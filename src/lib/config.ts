import "server-only";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function engineUrl(): string {
  return required("LPB_ENGINE_URL").replace(/\/$/, "");
}

export function adminToken(): string {
  return required("LPB_ADMIN_TOKEN");
}

export function applicationId(): string {
  return process.env.LPB_APPLICATION_ID?.trim() || "default";
}

export function sessionSecret(): string {
  return required("SESSION_SECRET");
}

export function signupInviteCode(): string | null {
  const value = process.env.SIGNUP_INVITE_CODE?.trim();
  return value ? value : null;
}
