"""
database/db.py — SQLite client with Supabase-compatible query builder.

Provides a drop-in replacement for the Supabase Python client so that
all existing service code (which uses db.table().select().eq().execute())
works unchanged against a local SQLite database.

Usage is identical to before:
    from app.database.db import get_db
    db = get_db()
    result = db.table("users").select("*").eq("id", user_id).execute()
    rows = result.data
"""

import json
import logging
import os
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

from app.config import get_settings

logger = logging.getLogger(__name__)


# ── Result object (mimics Supabase response) ──────────────────────────────────

@dataclass
class Result:
    """Response object returned by QueryBuilder.execute()."""
    data: List[Dict[str, Any]] = field(default_factory=list)


# ── QueryBuilder (mimics Supabase query builder) ──────────────────────────────

class QueryBuilder:
    """Chainable query builder that mimics the Supabase Python client API.

    Supports:
        .select(columns)
        .insert(data)
        .update(data)
        .eq(column, value)
        .gt(column, value)
        .contains(column, values)   — for TEXT[] / JSON array columns
        .order(column, desc=False)
        .limit(n)
        .single()
        .execute()
    """

    def __init__(self, conn: sqlite3.Connection, table: str):
        self._conn = conn
        self._table = table
        self._operation: str = "select"       # select | insert | update | delete
        self._columns: str = "*"
        self._insert_data: Optional[Dict[str, Any]] = None
        self._update_data: Optional[Dict[str, Any]] = None
        self._conditions: List[Tuple[str, str, Any]] = []
        self._order_col: Optional[str] = None
        self._order_desc: bool = False
        self._limit_val: Optional[int] = None
        self._single: bool = False

    # ── Operation setters ─────────────────────────────────────────────────────

    def select(self, columns: str = "*") -> "QueryBuilder":
        self._operation = "select"
        self._columns = columns
        return self

    def insert(self, data: Dict[str, Any]) -> "QueryBuilder":
        self._operation = "insert"
        self._insert_data = data
        return self

    def update(self, data: Dict[str, Any]) -> "QueryBuilder":
        self._operation = "update"
        self._update_data = data
        return self

    # ── Filter methods ────────────────────────────────────────────────────────

    def eq(self, column: str, value: Any) -> "QueryBuilder":
        self._conditions.append((column, "=", value))
        return self

    def gt(self, column: str, value: Any) -> "QueryBuilder":
        self._conditions.append((column, ">", value))
        return self

    def contains(self, column: str, values: List[str]) -> "QueryBuilder":
        """Filter rows where a JSON array column contains ALL of the given values."""
        for v in values:
            self._conditions.append((column, "CONTAINS", v))
        return self

    # ── Ordering & limiting ───────────────────────────────────────────────────

    def order(self, column: str, desc: bool = False) -> "QueryBuilder":
        self._order_col = column
        self._order_desc = desc
        return self

    def limit(self, n: int) -> "QueryBuilder":
        self._limit_val = n
        return self

    def single(self) -> "QueryBuilder":
        self._single = True
        self._limit_val = 1
        return self

    # ── Execution ─────────────────────────────────────────────────────────────

    def execute(self) -> Result:
        if self._operation == "select":
            return self._exec_select()
        elif self._operation == "insert":
            return self._exec_insert()
        elif self._operation == "update":
            return self._exec_update()
        else:
            raise ValueError(f"Unknown operation: {self._operation}")

    # ── Private helpers ───────────────────────────────────────────────────────

    def _build_where(self) -> Tuple[str, List[Any]]:
        """Build WHERE clause from collected conditions."""
        if not self._conditions:
            return "", []

        clauses = []
        params = []
        for col, op, val in self._conditions:
            if op == "CONTAINS":
                # JSON array stored as TEXT: use JSON functions
                clauses.append(f"EXISTS (SELECT 1 FROM json_each({col}) WHERE json_each.value = ?)")
                params.append(val)
            else:
                clauses.append(f"{col} {op} ?")
                params.append(val)

        return " WHERE " + " AND ".join(clauses), params

    def _exec_select(self) -> Result:
        where_clause, params = self._build_where()
        sql = f"SELECT {self._columns} FROM {self._table}{where_clause}"

        if self._order_col:
            direction = "DESC" if self._order_desc else "ASC"
            sql += f" ORDER BY {self._order_col} {direction}"

        if self._limit_val is not None:
            sql += f" LIMIT {self._limit_val}"

        cursor = self._conn.execute(sql, params)
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        rows = []
        for row in cursor.fetchall():
            row_dict = dict(zip(columns, row))
            # Deserialize JSON array columns back to Python lists
            for key, val in row_dict.items():
                if isinstance(val, str) and val.startswith("["):
                    try:
                        row_dict[key] = json.loads(val)
                    except (json.JSONDecodeError, TypeError):
                        pass
            rows.append(row_dict)

        return Result(data=rows)

    def _exec_insert(self) -> Result:
        if self._insert_data is None:
            raise ValueError("No data provided for insert.")

        data = self._prepare_data(self._insert_data)

        # Auto-generate UUID id if not provided
        if "id" not in data:
            data["id"] = str(uuid.uuid4())

        columns_list = list(data.keys())
        placeholders = ", ".join(["?"] * len(columns_list))
        cols_str = ", ".join(columns_list)
        values = list(data.values())

        sql = f"INSERT INTO {self._table} ({cols_str}) VALUES ({placeholders})"
        self._conn.execute(sql, values)
        self._conn.commit()

        # Return the inserted row by selecting it back
        result = (
            QueryBuilder(self._conn, self._table)
            .select("*")
            .eq("id", data["id"])
            .execute()
        )
        return result

    def _exec_update(self) -> Result:
        if self._update_data is None:
            raise ValueError("No data provided for update.")

        data = self._prepare_data(self._update_data)

        set_clauses = [f"{col} = ?" for col in data.keys()]
        set_values = list(data.values())

        where_clause, where_params = self._build_where()

        sql = f"UPDATE {self._table} SET {', '.join(set_clauses)}{where_clause}"
        self._conn.execute(sql, set_values + where_params)
        self._conn.commit()

        # Return updated rows
        if self._conditions:
            qb = QueryBuilder(self._conn, self._table).select("*")
            qb._conditions = self._conditions
            return qb.execute()

        return Result(data=[])

    def _prepare_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize Python types for SQLite storage."""
        prepared = {}
        for key, val in data.items():
            if isinstance(val, list):
                # Store arrays as JSON
                prepared[key] = json.dumps(val)
            elif isinstance(val, datetime):
                prepared[key] = val.isoformat()
            elif isinstance(val, dict):
                prepared[key] = json.dumps(val)
            else:
                prepared[key] = val
        return prepared


# ── SQLiteClient (mimics supabase.Client) ─────────────────────────────────────

class SQLiteClient:
    """Drop-in replacement for supabase.Client.

    Usage:
        client = SQLiteClient("data/app.db")
        result = client.table("users").select("*").execute()
    """

    def __init__(self, db_path: str):
        os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else ".", exist_ok=True)
        self._conn = sqlite3.connect(db_path, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA foreign_keys=ON")
        logger.info("SQLite database connected: %s", db_path)

    def table(self, name: str) -> QueryBuilder:
        return QueryBuilder(self._conn, name)

    @property
    def connection(self) -> sqlite3.Connection:
        """Direct access for schema initialization."""
        return self._conn


# ── Singleton accessor (same API as before) ───────────────────────────────────

@lru_cache
def get_db() -> SQLiteClient:
    """Return the cached SQLite client.

    Drop-in replacement for the previous Supabase get_db().
    """
    settings = get_settings()
    return SQLiteClient(settings.database_path)
