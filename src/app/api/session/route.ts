import { NextResponse } from "next/server";

import { engineUrl } from "@/lib/config";
import { engineFailure, readBody } from "@/lib/http";
import { authenticateKey } from "@/lib/login";
import { isRecord } from "@/lib/engine/errors";
import { clearSession, readSession, writeSession } from "@/lib/session";

export async function GET(): Promise<Response> {
  const session = await readSession();
  if (!session) return Response.json({ error: "a credential is required" }, { status: 401 });
  return Response.json({ role: session.role, actorId: session.actorId, applicationId: session.applicationId });
}

export async function POST(request: Request): Promise<Response> {
  const form = isForm(request);
  try {
    const token = form ? await tokenFromForm(request) : await tokenFromJson(request);
    const login = await authenticateKey(engineUrl(), token);
    await writeSession(login);
    if (form) {
      const path = login.role === "operator" ? "/operator" : "/dashboard";
      return NextResponse.redirect(new URL(path, request.url), 303);
    }
    return Response.json({
      role: login.role,
      actorId: login.actorId,
      applicationId: login.applicationId,
      provisioned: login.provisioned,
    });
  } catch (error) {
    if (form) return NextResponse.redirect(new URL("/login?error=rejected", request.url), 303);
    return engineFailure(error);
  }
}

function isForm(request: Request): boolean {
  const type = request.headers.get("content-type") ?? "";
  return type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data");
}

async function tokenFromJson(request: Request): Promise<string> {
  const body = await readBody(request);
  return isRecord(body) && typeof body.token === "string" ? body.token.trim() : "";
}

async function tokenFromForm(request: Request): Promise<string> {
  const data = await request.formData();
  return String(data.get("token") ?? "").trim();
}

export async function DELETE(): Promise<Response> {
  await clearSession();
  return new Response(null, { status: 204 });
}
