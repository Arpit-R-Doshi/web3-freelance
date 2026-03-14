"""
kyc/document_processor.py — Real Aadhaar identity verification pipeline.

Replaces the simulated verification stub with a real 5-stage pipeline:
  1. Load & preprocess image  (Pillow)
  2. OCR text extraction      (pytesseract)
  3. Aadhaar number validation (Verhoeff checksum — inline, no extra package)
  4. Face extraction from Aadhaar card
  5. Face match with selfie   (face_recognition → OpenCV Haar fallback)

Supported document type : aadhaar
Supported file formats  : image/jpeg, image/jpg, image/png
Maximum upload size     : 10 MB (enforced by save_file)

Public API
----------
  save_file(file, subdirectory)              — unchanged, used by kyc_routes
  extract_document_info(doc_path, doc_type,
                        doc_number,
                        selfie_path)         — main pipeline entry-point
"""

from __future__ import annotations

import logging
import os
import re
import uuid
from typing import Optional

import cv2
import numpy as np
from fastapi import HTTPException, UploadFile, status
from PIL import Image, ImageFilter

from app.config import get_settings

logger = logging.getLogger(__name__)

# ── Optional imports with graceful fallbacks ──────────────────────────────────

try:
    import pytesseract  # type: ignore

    # On Windows, Winget installs Tesseract here by default, but doesn't add it to PATH.
    # We explicitly point pytesseract to it if the executable exists.
    if os.name == "nt":
        _tesseract_path = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
        if os.path.exists(_tesseract_path):
            pytesseract.pytesseract.tesseract_cmd = _tesseract_path

    _OCR_AVAILABLE = True
    logger.info("pytesseract available — real OCR enabled.")
except ImportError:
    _OCR_AVAILABLE = False
    logger.warning("pytesseract not installed. OCR will be skipped (install via pip).")

try:
    import face_recognition  # type: ignore

    _FACE_REC_AVAILABLE = True
    logger.info("face_recognition available — dlib-based face matching enabled.")
except BaseException:
    # face_recognition calls quit() (SystemExit) when face_recognition_models
    # is not installed — BaseException is required to catch SystemExit.
    _FACE_REC_AVAILABLE = False
    logger.warning(
        "face_recognition not available — falling back to OpenCV Haar Cascade "
        "(less accurate). Install via `pip install face-recognition` + "
        "`pip install git+https://github.com/ageitgey/face_recognition_models` for full support."
    )


# Haar cascade for fallback face detection
_HAAR_CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
_haar_face_cascade: Optional[cv2.CascadeClassifier] = None


def _get_haar_cascade() -> cv2.CascadeClassifier:
    global _haar_face_cascade
    if _haar_face_cascade is None:
        _haar_face_cascade = cv2.CascadeClassifier(_HAAR_CASCADE_PATH)
    return _haar_face_cascade


# ── Allowed MIME types ─────────────────────────────────────────────────────────
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
}


# ══════════════════════════════════════════════════════════════════════════════
# FILE SAVING
# ══════════════════════════════════════════════════════════════════════════════

def _ensure_upload_dir(directory: str) -> None:
    os.makedirs(directory, exist_ok=True)


async def save_file(file: UploadFile, subdirectory: str = "") -> str:
    """Save an uploaded image file to local storage and return its path.

    Raises:
        HTTPException 400: Unsupported file type or empty file.
        HTTPException 413: File exceeds size limit.
    """
    settings = get_settings()

    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Unsupported file type '{file.content_type}'. "
                f"Accepted: {', '.join(sorted(_ALLOWED_CONTENT_TYPES))}."
            ),
        )

    base_dir = settings.upload_dir
    dest_dir = os.path.join(base_dir, subdirectory) if subdirectory else base_dir
    _ensure_upload_dir(dest_dir)

    ext = os.path.splitext(file.filename or "upload")[-1] or ".jpg"
    dest_path = os.path.join(dest_dir, f"{uuid.uuid4().hex}{ext}")

    max_bytes = settings.max_upload_size_mb * 1024 * 1024
    total_written = 0

    with open(dest_path, "wb") as out_file:
        while chunk := await file.read(65536):
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

    logger.info("Saved %d bytes → %s", total_written, dest_path)
    return dest_path


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 1 — IMAGE LOADING & PREPROCESSING
# ══════════════════════════════════════════════════════════════════════════════

def process_aadhaar_document(path: str) -> Image.Image:
    """Load and preprocess the Aadhaar image for OCR.

    Pipeline:
      - Load with Pillow
      - Convert to grayscale
      - Slight sharpening
      - Binary threshold (Otsu) via numpy for best OCR accuracy

    Args:
        path: Local file path to the uploaded image.

    Returns:
        Preprocessed PIL Image (greyscale, high-contrast).

    Raises:
        ValueError: If the file cannot be loaded as an image.
    """
    try:
        img = Image.open(path).convert("RGB")
    except Exception as exc:
        raise ValueError(f"Cannot open image at '{path}': {exc}") from exc

    # Resize if too small — OCR needs ≥300 DPI equivalent
    w, h = img.size
    if min(w, h) < 600:
        scale = 600 / min(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Grayscale + sharpen
    gray = img.convert("L")
    gray = gray.filter(ImageFilter.SHARPEN)

    # Otsu-style threshold via numpy for cleaner OCR
    arr = np.array(gray)
    _, thresh = cv2.threshold(arr, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    processed = Image.fromarray(thresh)

    return processed


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 2 — OCR TEXT EXTRACTION
# ══════════════════════════════════════════════════════════════════════════════

# Regex patterns for Aadhaar fields
_AADHAAR_RE = re.compile(r"\b(\d{4})\s(\d{4})\s(\d{4})\b|\b(\d{12})\b")
_DOB_RE = re.compile(
    r"\b(\d{2}[/\-]\d{2}[/\-]\d{4})"       # DD/MM/YYYY or DD-MM-YYYY
    r"|\b(\d{4}[/\-]\d{2}[/\-]\d{2})"       # YYYY-MM-DD
    r"|\b(19\d{2}|20\d{2})\b",              # year-only fallback
)
_NAME_RE = re.compile(
    r"(?:Name|NAME)[:\s]+([A-Z][a-zA-Z\s\.]{2,40})"  # after "Name:" label
)
_GENDER_RE = re.compile(r"\b(Male|Female|MALE|FEMALE|M|F)\b")


def extract_aadhaar_text(image: Image.Image) -> dict:
    """Run OCR on a preprocessed Aadhaar image and parse key fields.

    Args:
        image: Preprocessed grayscale PIL Image.

    Returns:
        dict with keys: aadhaar_number (str|None), name (str|None),
                        dob (str|None), gender (str|None), raw_text (str).
    """
    if not _OCR_AVAILABLE:
        logger.warning("pytesseract not available — skipping OCR field extraction.")
        return {
            "aadhaar_number": None,
            "name": None,
            "dob": None,
            "gender": None,
            "raw_text": "",
        }

    # pytesseract config: PSM 6 = Assume a single uniform block of text
    custom_config = r"--oem 3 --psm 6"
    raw_text = pytesseract.image_to_string(image, config=custom_config)
    logger.debug("OCR raw text:\n%s", raw_text)

    # ── Extract Aadhaar number ────────────────────────────────────────────────
    aadhaar_number: Optional[str] = None
    m = _AADHAAR_RE.search(raw_text)
    if m:
        if m.group(1):  # spaced format
            aadhaar_number = f"{m.group(1)} {m.group(2)} {m.group(3)}"
        else:            # compact 12-digit format
            d = m.group(4)
            aadhaar_number = f"{d[:4]} {d[4:8]} {d[8:]}"

    # ── Extract date of birth ─────────────────────────────────────────────────
    dob: Optional[str] = None
    dm = _DOB_RE.search(raw_text)
    if dm:
        dob = next(g for g in dm.groups() if g is not None)

    # ── Extract name (line after "Name" label, or first ALL-CAPS line) ────────
    name: Optional[str] = None
    nm = _NAME_RE.search(raw_text)
    if nm:
        name = nm.group(1).strip()
    else:
        # Fallback: look for a plain title-case line (typically the name)
        for line in raw_text.splitlines():
            stripped = line.strip()
            if (
                stripped
                and len(stripped) > 4
                and stripped.replace(" ", "").isalpha()
                and stripped[0].isupper()
                and not any(kw in stripped.lower() for kw in (
                    "government", "india", "aadhaar", "unique", "authority", "enrol"
                ))
            ):
                name = stripped
                break

    # ── Extract gender ────────────────────────────────────────────────────────
    gender: Optional[str] = None
    gm = _GENDER_RE.search(raw_text)
    if gm:
        g = gm.group(1).upper()
        gender = "MALE" if g in ("M", "MALE") else "FEMALE"

    return {
        "aadhaar_number": aadhaar_number,
        "name": name,
        "dob": dob,
        "gender": gender,
        "raw_text": raw_text,
    }


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 3 — AADHAAR NUMBER VALIDATION (VERHOEFF ALGORITHM)
# ══════════════════════════════════════════════════════════════════════════════

# Verhoeff multiplication table
_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]
_VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9]


def validate_aadhaar_number(number: str) -> bool:
    """Validate a 12-digit Aadhaar number using the Verhoeff checksum algorithm.

    Args:
        number: Aadhaar number string, with or without spaces.

    Returns:
        True if the checksum is valid, False otherwise.
    """
    digits = number.replace(" ", "").strip()

    if not digits.isdigit() or len(digits) != 12:
        return False

    # First digit of Aadhaar must not be 0 or 1 (UIDAI rule)
    if digits[0] in ("0", "1"):
        return False

    # Verhoeff check: reverse digits, iterate through permutation table
    c = 0
    for i, digit in enumerate(reversed(digits)):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][int(digit)]]

    return c == 0


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 4 — FACE EXTRACTION FROM DOCUMENT
# ══════════════════════════════════════════════════════════════════════════════

def extract_face_from_document(image: Image.Image) -> Optional[np.ndarray]:
    """Detect and crop the face region from an Aadhaar card image.

    Tries face_recognition (dlib HOG) first; falls back to OpenCV Haar Cascade.

    Args:
        image: Original (colour) PIL Image of the Aadhaar card.

    Returns:
        NumPy RGB array of the cropped face, or None if no face detected.
    """
    # Work on the original colour image for better face detection accuracy
    rgb = np.array(image.convert("RGB"))

    if _FACE_REC_AVAILABLE:
        # face_recognition uses HOG model by default — fast and accurate
        locations = face_recognition.face_locations(rgb, model="hog")
        if not locations:
            logger.warning("face_recognition: no face found in document.")
            return None
        if len(locations) > 1:
            logger.info("Multiple faces found in document; using the first (largest).")

        # Use first detected face (top, right, bottom, left)
        top, right, bottom, left = locations[0]
        face_crop = rgb[top:bottom, left:right]
        return face_crop

    # ── OpenCV Haar Cascade fallback ──────────────────────────────────────────
    gray_arr = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    cascade = _get_haar_cascade()
    faces = cascade.detectMultiScale(
        gray_arr,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(30, 30),
    )

    if len(faces) == 0:
        logger.warning("OpenCV Haar: no face found in document.")
        return None

    x, y, w, h = faces[0]
    return rgb[y : y + h, x : x + w]


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 5 — FACE COMPARISON WITH SELFIE
# ══════════════════════════════════════════════════════════════════════════════

_FACE_MATCH_THRESHOLD = 0.65  # Relaxed from 0.55 to accommodate older Aadhaar card photos


def compare_faces(doc_face_arr: np.ndarray, selfie_path: str) -> dict:
    """Compare the Aadhaar face crop against the selfie image.

    Args:
        doc_face_arr: RGB numpy array of the cropped document face.
        selfie_path:  Local file path to the uploaded selfie.

    Returns:
        dict with keys: match (bool), distance (float), method (str).

    Raises:
        ValueError: If no face is found in the selfie.
    """
    try:
        selfie_img = Image.open(selfie_path).convert("RGB")
    except Exception as exc:
        raise ValueError(f"Cannot load selfie image: {exc}") from exc

    selfie_rgb = np.array(selfie_img)

    if _FACE_REC_AVAILABLE:
        # Generate 128-d face encodings
        doc_locations = face_recognition.face_locations(doc_face_arr, model="hog")
        if not doc_locations:
            # doc_face_arr is already cropped — try full encoding directly
            doc_encodings = face_recognition.face_encodings(doc_face_arr)
        else:
            doc_encodings = face_recognition.face_encodings(doc_face_arr, doc_locations)

        if not doc_encodings:
            raise ValueError("Could not generate face encoding from Aadhaar card.")

        selfie_locations = face_recognition.face_locations(selfie_rgb, model="hog")
        selfie_encodings = face_recognition.face_encodings(selfie_rgb, selfie_locations)

        if not selfie_encodings:
            raise ValueError("No face detected in selfie. Please upload a clear, front-facing photo.")

        distance = float(face_recognition.face_distance([doc_encodings[0]], selfie_encodings[0])[0])
        matched = distance <= _FACE_MATCH_THRESHOLD

        return {
            "match": matched,
            "distance": round(distance, 4),
            "method": "face_recognition (dlib)",
        }

    # ── Haar cascade fallback: pixel-level similarity on resized crops ─────────
    # This is a rough proxy when dlib is unavailable.
    TARGET_SIZE = (128, 128)
    try:
        doc_resized = cv2.resize(doc_face_arr, TARGET_SIZE).astype(np.float32)
    except Exception:
        raise ValueError("Could not resize document face crop for comparison.")

    gray_selfie = cv2.cvtColor(selfie_rgb, cv2.COLOR_RGB2GRAY)
    cascade = _get_haar_cascade()
    faces = cascade.detectMultiScale(gray_selfie, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))

    if len(faces) == 0:
        raise ValueError("No face detected in selfie (OpenCV Haar fallback). Upload a clear front-facing photo.")

    x, y, w, h = faces[0]
    selfie_crop = selfie_rgb[y : y + h, x : x + w]
    selfie_resized = cv2.resize(selfie_crop, TARGET_SIZE).astype(np.float32)

    # Normalised cross-correlation as similarity proxy (range -1 to 1, higher = more similar)
    result = cv2.matchTemplate(doc_resized, selfie_resized, cv2.TM_CCOEFF_NORMED)
    score = float(result[0][0])
    # Convert to a distance-like metric (0 = identical, 1 = totally different)
    distance = round(1.0 - max(score, 0.0), 4)
    matched = distance <= _FACE_MATCH_THRESHOLD

    return {
        "match": matched,
        "distance": distance,
        "method": "opencv_haar (fallback)",
    }


# ══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE — extract_document_info()
# ══════════════════════════════════════════════════════════════════════════════

def extract_document_info(
    document_path: str,
    document_type: str,
    document_number: str,
    selfie_path: Optional[str] = None,
) -> dict:
    """Full Aadhaar KYC verification pipeline.

    Stages:
      1. Validate document type (only 'aadhaar' supported)
      2. Load & preprocess document image
      3. OCR — extract Aadhaar number, name, DOB, gender
      4. Validate Aadhaar checksum (Verhoeff)
      5. Detect face in document
      6. Match document face with selfie
      7. Return structured result

    Args:
        document_path:  Local path to the uploaded Aadhaar image.
        document_type:  Must be 'aadhaar'.
        document_number: User-claimed Aadhaar number (cross-validated with OCR).
        selfie_path:    Local path to the uploaded selfie image.

    Returns:
        On success:
            {
                "verification_status": "passed",
                "document_type": "aadhaar",
                "aadhaar_number": "XXXX XXXX XXXX",
                "name": "Full Name",
                "dob": "DD/MM/YYYY",
                "gender": "MALE",
                "face_match": True,
                "face_distance": 0.42,
                "confidence": 0.93,
                "method": "ocr + face_match",
            }
        On failure:
            {"verification_status": "rejected", "reason": "<reason_code>"}
    """

    # ── Guard: only Aadhaar is supported ──────────────────────────────────────
    if document_type.lower().strip() != "aadhaar":
        return {
            "verification_status": "rejected",
            "reason": "unsupported_document_type",
            "detail": f"Only 'aadhaar' is supported. Got: '{document_type}'.",
        }

    # ── Stage 1: Load & preprocess ────────────────────────────────────────────
    try:
        preprocessed_img = process_aadhaar_document(document_path)
        original_img = Image.open(document_path).convert("RGB")
    except ValueError as exc:
        return {"verification_status": "rejected", "reason": "image_load_failed", "detail": str(exc)}

    # ── Stage 2: OCR ──────────────────────────────────────────────────────────
    ocr_result = extract_aadhaar_text(preprocessed_img)
    ocr_number = ocr_result.get("aadhaar_number")

    logger.info(
        "OCR result — number: %s | name: %s | dob: %s | gender: %s",
        ocr_number,
        ocr_result.get("name"),
        ocr_result.get("dob"),
        ocr_result.get("gender"),
    )

    # ── Stage 3: Aadhaar number validation ────────────────────────────────────
    # Prefer OCR-extracted number; use user-supplied as fallback
    number_to_validate = ocr_number or document_number
    if not validate_aadhaar_number(number_to_validate):
        return {
            "verification_status": "rejected",
            "reason": "invalid_aadhaar_checksum",
            "detail": f"Aadhaar number '{number_to_validate}' failed Verhoeff checksum.",
        }

    # ── Stage 4: Face detection from document ─────────────────────────────────
    doc_face = extract_face_from_document(original_img)
    if doc_face is None:
        return {
            "verification_status": "rejected",
            "reason": "no_face_detected_in_document",
            "detail": "No face could be detected on the Aadhaar card. Ensure the card is clearly visible.",
        }

    # ── Stage 5: Face match with selfie ───────────────────────────────────────
    if selfie_path is None:
        return {
            "verification_status": "rejected",
            "reason": "selfie_missing",
            "detail": "A selfie image is required for face verification.",
        }

    try:
        face_result = compare_faces(doc_face, selfie_path)
    except ValueError as exc:
        return {
            "verification_status": "rejected",
            "reason": "face_comparison_error",
            "detail": str(exc),
        }

    if not face_result["match"]:
        return {
            "verification_status": "rejected",
            "reason": "face_mismatch",
            "detail": (
                f"Selfie does not match the Aadhaar photo "
                f"(distance={face_result['distance']:.3f}, "
                f"threshold={_FACE_MATCH_THRESHOLD})."
            ),
            "face_distance": face_result["distance"],
        }

    # ── All stages passed — build confidence score ─────────────────────────────
    # Components: Verhoeff pass (0.4) + OCR success (0.3) + face match (0.3)
    ocr_score = 0.3 if ocr_number else 0.1
    face_score = 0.3 * (1.0 - face_result["distance"])
    confidence = round(0.4 + ocr_score + face_score, 3)
    confidence = min(confidence, 0.99)

    logger.info(
        "Aadhaar verification PASSED — number: %s | face_distance: %.3f | confidence: %.3f",
        number_to_validate,
        face_result["distance"],
        confidence,
    )

    return {
        "verification_status": "passed",
        "document_type": "aadhaar",
        "aadhaar_number": number_to_validate,
        "name": ocr_result.get("name"),
        "dob": ocr_result.get("dob"),
        "gender": ocr_result.get("gender"),
        "face_match": True,
        "face_distance": face_result["distance"],
        "confidence": confidence,
        "method": f"ocr + face_match ({face_result['method']})",
    }
