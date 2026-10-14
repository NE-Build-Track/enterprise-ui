import { EncryptJWT, jwtDecrypt } from "jose";

export type SessionRole = "actor" | "operator";

export type SessionClaims = {
  readonly token: string;
  readonly actorId: string | null;
  readonly applicationId: string;
  readonly role: SessionRole;
  readonly keyId: string | null;
};

export async function sessionKey(secret: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return new Uint8Array(digest);
}

export async function sealSession(claims: SessionClaims, secret: Uint8Array): Promise<string> {
  return new EncryptJWT({ ...claims })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .encrypt(secret);
}

export async function openSession(token: string, secret: Uint8Array): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtDecrypt(token, secret);
    if (!isSessionClaims(payload)) return null;
    return {
      token: payload.token,
      actorId: payload.actorId,
      applicationId: payload.applicationId,
      role: payload.role,
      keyId: payload.keyId,
    };
  } catch {
    return null;
  }
}

function isSessionClaims(value: unknown): value is SessionClaims {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.token === "string" &&
    record.token.startsWith("lpk_") &&
    (record.actorId === null || typeof record.actorId === "string") &&
    typeof record.applicationId === "string" &&
    (record.role === "actor" || record.role === "operator") &&
    (record.keyId === null || typeof record.keyId === "string")
  );
}
