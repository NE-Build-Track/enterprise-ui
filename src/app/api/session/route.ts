import { NextResponse } from "next/server";

import { engineUrl } from "@/lib/config";
import { createEngineCall } from "@/lib/engine/client";
import { isRecord } from "@/lib/engine/errors";
import { adminCall } from "@/lib/engine/server";
import { engineFailure, readBody } from "@/lib/http";
import { authenticateKey } from "@/lib/login";
import { resolveActor } from "@/lib/resolve-actor";
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
    const actor = await resolveActor(createEngineCall(engineUrl(), token), adminCall(), token, {
      actorId: login.actorId,
      applicationId: login.applicationId,
    });
    const claims = actor ? { ...login, actorId: actor.actorId, applicationId: actor.applicationId } : login;
    await writeSession(claims);
    if (form) {
      const path = claims.role === "operator" ? "/operator" : "/overview";
      return NextResponse.redirect(new URL(path, request.url), 303);
    }
    return Response.json({
      role: claims.role,
      actorId: claims.actorId,
      applicationId: claims.applicationId,
      provisioned: claims.provisioned,
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
