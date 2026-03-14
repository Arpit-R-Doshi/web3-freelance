"""
identity/credential_issuer.py — Verifiable Credential issuance.

Issues W3C Verifiable Credentials once a user's KYC has been approved.
The credential is cryptographically signed with the platform's DID key
and stored in Supabase for later retrieval.

Credential format:
    {
      "@context": ["https://www.w3.org/2018/credentials/v1"],
      "type": ["VerifiableCredential", "KYCCredential"],
      "issuer": "<platform_did>",
      "issuanceDate": "<iso8601>",
      "credentialSubject": {
        "id": "<user_did>",
        "kyc_status": "verified",
        "verification_level": "basic"
      }
    }
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.config import get_settings
from app.database.db import get_db

logger = logging.getLogger(__name__)

# ── DIDKit with fallback ──────────────────────────────────────────────────────
try:
    import didkit as _didkit  # type: ignore

    # The pip didkit 0.2.1 version lacks the required functions (e.g. generate_key). 
    # Use the same strict check here to ensure we fall back correctly.
    if getattr(_didkit, "issue_credential", None) is None:
        raise ImportError("Installed didkit version lacks issue_credential function")

    _DIDKIT_AVAILABLE = True
except ImportError:
    _DIDKIT_AVAILABLE = False


def _build_credential(
    platform_did: str,
    user_did: str,
    claims: Dict[str, Any],
) -> Dict[str, Any]:
    """Return an unsigned W3C VC dict."""
    return {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://w3id.org/security/suites/ed25519-2020/v1",
        ],
        "id": f"urn:uuid:{uuid.uuid4()}",
        "type": ["VerifiableCredential", "KYCCredential"],
        "issuer": platform_did,
        "issuanceDate": datetime.now(tz=timezone.utc).isoformat(),
        "credentialSubject": {
            "id": user_did,
            **claims,
        },
    }


def _sign_credential_didkit(credential: dict, jwk: str) -> str:
    """Sign a VC using the native DIDKit library; returns JWT-VC string."""
    import asyncio

    proof_options = json.dumps(
        {
            "type": "Ed25519Signature2020",
            "cryptosuite": "ed25519-2020",
        }
    )
    signed = asyncio.get_event_loop().run_until_complete(
        _didkit.issue_credential(json.dumps(credential), proof_options, jwk)
    )
    return signed  # DIDKit returns a JSON-LD signed VC string


def _sign_credential_fallback(credential: dict, jwk: str) -> str:
    """Sign a VC manually when DIDKit is not available, avoiding python-jose limitation.

    Produces a compact JWT where the payload is the credential using EdDSA.
    """
    import base64

    def b64url_encode(data: bytes) -> str:
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    jwk_data = json.loads(jwk)

    # Reconstruct raw Ed25519 private key bytes from JWK
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    priv_bytes = base64.urlsafe_b64decode(jwk_data["d"] + "==")
    private_key = Ed25519PrivateKey.from_private_bytes(priv_bytes)

    header_dict = {"typ": "JWT", "alg": "EdDSA"}
    payload_dict = {**credential, "jti": credential["id"]}

    header_b64 = b64url_encode(json.dumps(header_dict, separators=(",", ":")).encode("utf-8"))
    payload_b64 = b64url_encode(json.dumps(payload_dict, separators=(",", ":")).encode("utf-8"))

    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
    signature = private_key.sign(signing_input)
    signature_b64 = b64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


async def issue_credential(
    user_id: str,
    user_did: str,
    claims: Optional[Dict[str, Any]] = None,
    platform_jwk: Optional[str] = None,
) -> str:
    """Issue a signed KYC Verifiable Credential and store it in Supabase.

    Args:
        user_id:      UUID of the user.
        user_did:     The user's `did:key` DID.
        claims:       Extra credential subject claims (merged with defaults).
        platform_jwk: JWK of the *issuing* platform key. When None the user's
                      own JWK stored in the DB is used (fine for demo).

    Returns:
        Signed VC as a JSON string (or compact JWT when DIDKit unavailable).
    """
    settings = get_settings()
    db = get_db()

    default_claims = {
        "kyc_status": "verified",
        "verification_level": "basic",
    }
    merged_claims = {**default_claims, **(claims or {})}

    # Fetch signing key
    if platform_jwk is None:
        res = db.table("users").select("jwk").eq("id", user_id).execute()
        if not res.data or not res.data[0].get("jwk"):
            raise ValueError(f"No JWK found for user {user_id}")
        platform_jwk = res.data[0]["jwk"]

    # Build unsigned credential
    credential = _build_credential(
        platform_did=user_did,   # In demo the user is self-issuing; swap for platform DID in prod
        user_did=user_did,
        claims=merged_claims,
    )

    # Sign
    if _DIDKIT_AVAILABLE:
        vc_jwt = _sign_credential_didkit(credential, platform_jwk)
    else:
        vc_jwt = _sign_credential_fallback(credential, platform_jwk)

    logger.info("Issued VC for user %s (DIDKit=%s)", user_id, _DIDKIT_AVAILABLE)

    # Persist to Supabase
    db.table("credentials").insert(
        {"user_id": user_id, "vc_jwt": vc_jwt}
    ).execute()

    return vc_jwt
