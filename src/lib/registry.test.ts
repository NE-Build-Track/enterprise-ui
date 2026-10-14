import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

import { lookupKey, rememberKey, tokenDigest } from "./registry";

const previous = process.env.LPB_KEY_REGISTRY;
let directory: string | undefined;

afterEach(async () => {
  process.env.LPB_KEY_REGISTRY = previous;
  if (directory) await rm(directory, { recursive: true, force: true });
});

it("stores a hash of the token, not the token", async () => {
  directory = await mkdtemp(path.join(tmpdir(), "lp-keys-"));
  process.env.LPB_KEY_REGISTRY = path.join(directory, "keys.json");
  await rememberKey("lpk_secret", {
    keyId: "key_1",
    actorId: "ada",
    applicationId: "default",
    kind: "actor",
    label: "ada",
    issuedAt: "2026-10-13T00:00:00Z",
  });
  expect(await lookupKey("lpk_secret")).toMatchObject({ actorId: "ada", keyId: "key_1" });
  expect(await lookupKey("lpk_other")).toBeNull();
  expect(tokenDigest("lpk_secret")).toHaveLength(64);
});
