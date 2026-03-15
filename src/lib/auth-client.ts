/**
 * Browser-safe JWT utilities.
 * We only decode (not cryptographically verify) on the client — the server
 * still verifies the signature on every API call.
 */
export type JWTPayload = {
  userId: string;
  email: string;
  role: string;
  name: string;
  exp?: number;
};

export function decodeToken(token: string): JWTPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null; // expired
    return payload as JWTPayload;
  } catch {
    return null;
  }
}
