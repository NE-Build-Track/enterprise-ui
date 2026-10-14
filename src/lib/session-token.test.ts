import { expect, it } from "vitest";

import { openSession, sealSession, sessionKey } from "./session-token";

it("round-trips a session and rejects a token sealed with another secret", async () => {
  const claims = {
    token: "lpk_example",
    actorId: "ada",
    applicationId: "default",
    role: "actor" as const,
    keyId: "key_1",
  };
  const secret = await sessionKey("test-secret");
  const sealed = await sealSession(claims, secret);
  expect(await openSession(sealed, secret)).toEqual(claims);
  expect(await openSession(sealed, await sessionKey("other-secret"))).toBeNull();
  expect(await openSession("not-a-token", secret)).toBeNull();
});
