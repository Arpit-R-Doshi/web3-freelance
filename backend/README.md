# Identity & Trust Layer

> Hackathon-ready cross-border collaboration backend powered by **Decentralized Identifiers (DIDs)**, **Verifiable Credentials (VCs)**, and **Role-Based Access Control (RBAC)**.

---

## ✨ What It Demonstrates

| Capability | Implementation |
|---|---|
| Decentralized Identity | `did:key` generation via DIDKit (pure-Python Ed25519 fallback) |
| KYC Verification | Multipart document upload + simulated verification |
| Verifiable Credentials | W3C VC issuance, Ed25519 signed |
| RBAC Authorization | Role-permission middleware on every protected endpoint |
| JWT Authentication | HS256 tokens with expiry, role & KYC status claims |

---

## 🗂️ Project Structure

```
backend/
├── app/
│   ├── main.py                  # FastAPI entry point
│   ├── config.py                # Settings from .env
│   ├── database/
│   │   ├── db.py                # Supabase client
│   │   └── models.py            # Pydantic models
│   ├── auth/
│   │   ├── auth_routes.py       # POST /auth/register, /auth/login
│   │   ├── jwt_handler.py       # JWT encode/decode
│   │   └── password_utils.py    # bcrypt hashing
│   ├── identity/
│   │   ├── __init__.py          # GET /identity/resolve, POST /identity/verify-credential
│   │   ├── did_service.py       # generate_did(), resolve_did()
│   │   ├── credential_issuer.py # issue_credential()
│   │   └── credential_verifier.py # verify_credential()
│   ├── kyc/
│   │   ├── kyc_routes.py        # POST /kyc/submit, GET /kyc/status
│   │   ├── kyc_service.py       # submit_kyc(), approve_kyc()
│   │   └── document_processor.py # save_file(), extract_document_info()
│   ├── rbac/
│   │   ├── roles.py             # Role enum
│   │   ├── permissions.py       # ROLE_PERMISSIONS mapping
│   │   └── authorization.py     # require_permission() dependency
│   ├── middleware/
│   │   └── rbac_middleware.py   # get_current_user(), RBACLoggingMiddleware
│   └── contracts/
│       └── contract_routes.py   # POST /contracts/create|accept|submit
├── storage/kyc_documents/       # Local KYC document uploads
├── requirements.txt
├── .env.example
└── README.md
```

---

## ⚡ Quick Start

### 1. Prerequisites

- Python 3.11+
- A free [Supabase](https://supabase.com) project

### 2. Clone & Install

```bash
cd c:\bytecamp\backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
```

### 3. Configure Environment

```bash
copy .env.example .env
```

Edit `.env` and fill in:

```dotenv
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key
JWT_SECRET=generate-with-python-secrets-module
```

### 4. Set Up Supabase Database

Run the following SQL in the **Supabase SQL Editor** (`supabase.com → SQL Editor`):

```sql
-- Users table
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  did          TEXT,
  jwk          TEXT,           -- Ed25519 private key (demo only — use HSM in prod)
  role         TEXT DEFAULT 'CLIENT',
  kyc_status   TEXT DEFAULT 'unverified',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- KYC submissions
CREATE TABLE kyc_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
  document_type   TEXT,
  document_number TEXT,
  document_path   TEXT,
  selfie_path     TEXT,
  status          TEXT DEFAULT 'pending',
  submitted_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Verifiable Credentials
CREATE TABLE credentials (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  vc_jwt    TEXT NOT NULL,
  issued_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. Run the Server

```bash
uvicorn app.main:app --reload
```

Open **http://localhost:8000/docs** for the interactive Swagger UI.

---

## 🎬 Hackathon Demo Flow

### Step 1 — Register (CLIENT role)

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@demo.com","password":"Demo1234!","role":"CLIENT"}'
```

Response includes `access_token` and the generated `did:key` for Alice.

---

### Step 2 — Login

```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@demo.com","password":"Demo1234!"}'

# Save the token:
TOKEN="eyJ..."
```

---

### Step 3 — Submit KYC Documents

```bash
curl -X POST http://localhost:8000/kyc/submit \
  -H "Authorization: Bearer $TOKEN" \
  -F "document_type=passport" \
  -F "document_number=AB123456" \
  -F "document_image=@any_image.png;type=image/png" \
  -F "selfie_image=@any_image.png;type=image/png"
```

The system auto-approves and returns a signed **Verifiable Credential JWT** (`vc_jwt`).

---

### Step 4 — Access CLIENT-Only Endpoint ✅

```bash
curl -X POST http://localhost:8000/contracts/create \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Logo Design","description":"Need a company logo","budget":500}'
```

---

### Step 5 — Test RBAC Rejection ❌

Alice is a CLIENT — she cannot accept a contract (FREELANCER only):

```bash
curl -X POST http://localhost:8000/contracts/accept \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":"abc123"}'

# Returns: 403 Forbidden
# "Your role 'CLIENT' does not have the required permission: 'accept_contract'."
```

---

### Step 6 — Register as FREELANCER and Accept

```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@demo.com","password":"Demo1234!","role":"FREELANCER"}'
# Get BOB_TOKEN from response

curl -X POST http://localhost:8000/contracts/accept \
  -H "Authorization: Bearer $BOB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contract_id":"abc123"}'
# → 200 OK, contract accepted
```

---

### Step 7 — Verify a Credential

```bash
curl -X POST http://localhost:8000/identity/verify-credential \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vc_jwt":"<paste vc_jwt from Step 3>"}'
```

---

### Step 8 — Resolve a DID

```bash
curl http://localhost:8000/identity/resolve/did:key:z6Mk...
```

---

## 🔐 RBAC Quick Reference

| Endpoint | Required Permission | Allowed Roles |
|---|---|---|
| `POST /contracts/create` | `create_contract` | CLIENT, ADMIN |
| `POST /contracts/accept` | `accept_contract` | FREELANCER, ADMIN |
| `POST /contracts/submit` | `submit_work` | FREELANCER, ADMIN |
| `POST /kyc/submit` | _(any authenticated user)_ | ALL |
| `GET /identity/my-credentials` | _(any authenticated user)_ | ALL |

---

## 🧑‍💻 DIDKit Note

The system attempts to load the `didkit` native library. If unavailable:
- A pure-Python **Ed25519 + did:key** implementation is used automatically.
- All DID generation, credential issuance, and verification remain functional.
- To enable full W3C compliance, uncomment `didkit>=0.3.0` in `requirements.txt` and run `pip install didkit`.

---

## 🏗️ Architecture Overview

```
Request → CORS → RBACLoggingMiddleware → Router
                                          │
                        ┌─────────────────┼──────────────────┐
                        ▼                 ▼                  ▼
                  auth_routes        kyc_routes       contract_routes
                        │                 │                  │
                  jwt_handler      kyc_service         require_permission()
                  password_utils   doc_processor       rbac/permissions.py
                        │                 │
                  Supabase DB      identity/
                                   did_service.py
                                   credential_issuer.py
                                   credential_verifier.py
```
