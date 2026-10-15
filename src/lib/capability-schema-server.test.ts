import { expect, it } from "vitest";

import { loadCapabilityFormFrom } from "./capability-schema-server";

const HASH = "4274ff45aeda320be1e26863163b5878ac7db47f42ab84669a7a1b269d94bb8c";
const COMPOSE =
  '{"additionalProperties":true,"format":"comfystream.ffmpeg.request.v1","properties":{"fps":{"default":4,"exclusiveMinimum":0,"type":"number"},"tracks":{"items":{"additionalProperties":true,"properties":{"id":{"type":"string"},"keyframes":{"items":{"additionalProperties":true,"properties":{"duration":{"description":"Length of this keyframe in milliseconds.","minimum":0,"type":"number"},"timestamp":{"minimum":0,"type":"number"},"url":{"minLength":1,"type":"string"}},"required":["url"],"type":"object"},"minItems":1,"type":"array"},"type":{"enum":["video","audio","image"],"type":"string"}},"required":["keyframes"],"type":"object"},"minItems":1,"type":"array"}},"required":["tracks"],"tool":"compose","type":"object"}';

const discovery = [
  {
    runners: [
      {
        app: "comfystream/ffmpeg-compose",
        url: "https://orch.example/apps/runner_a/app",
        metadata: JSON.stringify({ required: ["tracks"], schema_sha256: HASH, schema_url: "./schema" }),
      },
    ],
  },
];

it("returns the compose example when the schema hash matches", async () => {
  const result = await loadCapabilityFormFrom("comfystream/ffmpeg-compose", {
    discoveryUrls: () => Promise.resolve(["https://orch.example/discovery"]),
    readDiscovery: () => Promise.resolve(discovery),
    readSchema: () => Promise.resolve(COMPOSE),
  });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.required).toEqual(["tracks"]);
  expect(result.example).toHaveProperty("tracks");
  expect(result.example).not.toHaveProperty("images");
});

it("blocks the form when the schema hash does not match", async () => {
  const mismatched = [
    {
      runners: [
        {
          app: "comfystream/ffmpeg-compose",
          url: "https://orch.example/apps/runner_b/app",
          metadata: JSON.stringify({ required: ["tracks"], schema_sha256: "ab".repeat(32), schema_url: "./schema" }),
        },
      ],
    },
  ];
  const result = await loadCapabilityFormFrom("comfystream/ffmpeg-compose", {
    discoveryUrls: () => Promise.resolve(["https://orch.example/discovery"]),
    readDiscovery: () => Promise.resolve(mismatched),
    readSchema: () => Promise.resolve(COMPOSE),
  });
  expect(result).toMatchObject({ ok: false, status: 422, error: "schema hash does not match discovery" });
});

it("uses the name heuristic only when discovery has no schema for the app", async () => {
  const absent = await loadCapabilityFormFrom("flux-dev", {
    discoveryUrls: () => Promise.resolve(["https://orch.example/discovery"]),
    readDiscovery: () => Promise.resolve(discovery),
    readSchema: () => Promise.reject(new Error("should not fetch")),
  });
  expect(absent).toMatchObject({ ok: false, status: 404 });
  const unread = await loadCapabilityFormFrom("comfystream/ffmpeg-compose", {
    discoveryUrls: () => Promise.resolve(["https://orch.example/discovery"]),
    readDiscovery: () => Promise.reject(new Error("down")),
    readSchema: () => Promise.reject(new Error("should not fetch")),
  });
  expect(unread).toMatchObject({ ok: false, status: 502 });
  const nowhere = await loadCapabilityFormFrom("comfystream/ffmpeg-compose", {
    discoveryUrls: () => Promise.resolve([]),
    readDiscovery: () => Promise.reject(new Error("should not fetch")),
    readSchema: () => Promise.reject(new Error("should not fetch")),
  });
  expect(nowhere).toMatchObject({ ok: false, status: 502, error: "discovery could not be read" });
});
