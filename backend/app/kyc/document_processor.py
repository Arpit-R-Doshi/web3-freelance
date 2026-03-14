"""
kyc/document_processor.py — File upload and document information extraction.

Handles saving uploaded KYC documents to local storage and simulating
document information extraction (no real OCR dependency for hackathon).
"""

import logging
import os
import shutil
import uuid
from typing import Tuple

from fastapi import HTTPException, UploadFile, status

from app.config import get_settings

logger = logging.getLogger(__name__)

# Allowed MIME types for document uploads
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
}


def _ensure_upload_dir(directory: str) -> None:
    """Create the upload directory if it does not exist."""
    os.makedirs(directory, exist_ok=True)


async def save_file(file: UploadFile, subdirectory: str = "") -> str:
    """Save an uploaded file to local storage and return its path.

    Args:
        file:         FastAPI UploadFile object.
        subdirectory: Optional sub-path inside the base upload directory.

    Returns:
        Absolute path string to the saved file.

    Raises:
        HTTPException 400: If the file type is not allowed or file is empty.
        HTTPException 413: If the file exceeds the configured size limit.
    """
    settings = get_settings()

    # Validate content type
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type '{file.content_type}' is not allowed. "
                   f"Accepted: {', '.join(sorted(_ALLOWED_CONTENT_TYPES))}",
        )

    # Determine destination
    base_dir = settings.upload_dir
    dest_dir = os.path.join(base_dir, subdirectory) if subdirectory else base_dir
    _ensure_upload_dir(dest_dir)

    # Build unique filename to prevent collisions
    ext = os.path.splitext(file.filename or "upload")[-1] or ".bin"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest_path = os.path.join(dest_dir, unique_name)

    # Stream file to disk with size check
    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    total_written = 0

    with open(dest_path, "wb") as out_file:
        while chunk := await file.read(1024 * 64):  # 64 KB chunks
            total_written += len(chunk)
            if total_written > max_bytes:
                out_file.close()
                os.unlink(dest_path)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds {settings.max_upload_size_mb} MB limit.",
                )
            out_file.write(chunk)

    if total_written == 0:
        os.unlink(dest_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    logger.info("File saved: %s (%d bytes)", dest_path, total_written)
    return dest_path


def extract_document_info(
    document_path: str,
    document_type: str,
    document_number: str,
) -> dict:
    """Extract / validate document information.

    For the hackathon we simulate extraction by returning the submitted
    values with a 'verified' flag.  Replace this function body with
    actual OCR (e.g. Tesseract, Google Vision, AWS Textract) for production.

    Args:
        document_path:   Path to the saved document image.
        document_type:   Claimed document type (passport, driving_licence, …).
        document_number: Claimed document number.

    Returns:
        Dict with extracted / simulated document metadata.
    """
    logger.info(
        "Simulating document extraction for %s (type=%s, number=%s)",
        document_path,
        document_type,
        document_number,
    )

    return {
        "document_type": document_type,
        "document_number": document_number,
        "extraction_method": "simulated",
        "confidence": 0.99,
        "fields": {
            "doc_type": document_type,
            "doc_number": document_number,
        },
    }
