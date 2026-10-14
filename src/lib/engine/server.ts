import "server-only";

import { adminToken, engineUrl } from "../config";
import { createEngineCall, type EngineCall } from "./client";

export function adminCall(): EngineCall {
  return createEngineCall(engineUrl(), adminToken());
}

export function actorCall(token: string): EngineCall {
  return createEngineCall(engineUrl(), token);
}

export function publicCall(): EngineCall {
  return createEngineCall(engineUrl(), null);
}
