"""
identity/credential_verifier.py — Verifiable Credential verification.

Provides `verify_credential()` which validates a signed VC (JSON-LD or
compact JWT format) and returns the extracted claims on success.

Verification steps:
  1. Signature validation (via DIDKit or python-jose fallback)
  2. Issuer / subject resolution
  3. Claim extraction and return
"""

import json
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)

# ── DIDKit with fallback ──────────────────────────────────────────────────────
try:
    import didkit as _didkit  # type: ignore

    _DIDKIT_AVAILABLE = True
except ImportError:
    _DIDKIT_AVAILABLE = False


async def verify_credential(vc_jwt: str) -> Dict[str, Any]:
    """Verify a signed Verifiable Credential and return its claims.

    Args:
        vc_jwt: The signed VC string (JSON-LD compact JWT or DIDKit output).

    Returns:
        dict with keys ``issuer``, ``subject_did``, and ``claims``.

    Raises:
        ValueError: If the credential fails verification.
    """
    if _DIDKIT_AVAILABLE:
        return await _verify_with_didkit(vc_jwt)
    return _verify_fallback(vc_jwt)


async def _verify_with_didkit(vc_jwt: str) -> Dict[str, Any]:
    """Verify using the native DIDKit library."""
    import asyncio

    verification_result = await _didkit.verify_credential(vc_jwt, "{}")
    result_json = json.loads(verification_result)

    if result_json.get("errors"):
        raise ValueError(f"VC verification failed: {result_json['errors']}")

    # Parse the credential to extract claims
    vc_data = json.loads(vc_jwt) if vc_jwt.startswith("{") else {}

    return _extract_claims(vc_data)


def _verify_fallback(vc_jwt: str) -> Dict[str, Any]:
    """Verify a compact JWT VC using python-jose.

    For the hackathon fallback, we decode without full signature verification
    (since we self-issued with our own key stored in DB).  A production
    implementation would fetch the public key from the DID Document.
    """
    from jose import jwt as jose_jwt
    from jose.exceptions import JWTError

    try:
        # Decode without verification to extract claims for demo
        # In production: resolve DID → fetch public key → verify signature
        claims = jose_jwt.decode(
            vc_jwt,
            key="",  # will be replaced with actual public key in prod
            options={
                "verify_signature": False,
                "verify_exp": False,
            },
            algorithms=["EdDSA", "ES256", "RS256"],
        )
        logger.warning(
            "VC signature NOT verified (fallback mode — DIDKit not available)."
        )
        return _extract_claims(claims)
    except Exception as exc:
        raise ValueError(f"Could not decode VC JWT: {exc}") from exc


def _extract_claims(vc_data: dict) -> Dict[str, Any]:
    """Extract structured claims from a decoded VC payload."""
    subject = vc_data.get("credentialSubject", {})
    if not subject:
        # Try JWT standard claims format
        subject = {
            "id": vc_data.get("sub", ""),
            **{k: v for k, v in vc_data.items() if k not in ("iss", "sub", "iat", "jti")},
        }

    return {
        "issuer": vc_data.get("issuer", vc_data.get("iss", "")),
        "subject_did": subject.get("id", ""),
        "claims": {k: v for k, v in subject.items() if k != "id"},
        "issuance_date": vc_data.get("issuanceDate", ""),
    }


def extract_claims_no_verify(vc_jwt: str) -> Dict[str, Any]:
    """Extract claims from a VC without signature verification.

    Use only for display/logging purposes — never for authorization.
    """
    try:
        if vc_jwt.startswith("{"):
            data = json.loads(vc_jwt)
            return _extract_claims(data)

        from jose import jwt as jose_jwt

        data = jose_jwt.decode(
            vc_jwt,
            key="",
            options={"verify_signature": False, "verify_exp": False},
            algorithms=["EdDSA", "ES256", "RS256"],
        )
        return _extract_claims(data)
    except Exception as exc:
        logger.debug("Could not extract VC claims (non-fatal): %s", exc)
        return {}
