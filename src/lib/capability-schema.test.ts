import { createHash } from "node:crypto";
import { expect, it } from "vitest";

import {
  alignMediaType,
  exampleFromSchema,
  formFields,
  missingRequired,
  registrationsFromDiscovery,
  requestSchema,
  resolveSchemaUrl,
  schemaDocumentMatches,
  schemaJobPath,
  writePath,
  type SchemaNode,
} from "./capability-schema";

const MAP = "https://eliteencoder.net/assets/img/map-image.png";
const COMPOSE_HASH = "4274ff45aeda320be1e26863163b5878ac7db47f42ab84669a7a1b269d94bb8c";
const COMPOSE_TEXT =
  '{"additionalProperties":true,"format":"comfystream.ffmpeg.request.v1","properties":{"fps":{"default":4,"exclusiveMinimum":0,"type":"number"},"tracks":{"items":{"additionalProperties":true,"properties":{"id":{"type":"string"},"keyframes":{"items":{"additionalProperties":true,"properties":{"duration":{"description":"Length of this keyframe in milliseconds.","minimum":0,"type":"number"},"timestamp":{"minimum":0,"type":"number"},"url":{"minLength":1,"type":"string"}},"required":["url"],"type":"object"},"minItems":1,"type":"array"},"type":{"enum":["video","audio","image"],"type":"string"}},"required":["keyframes"],"type":"object"},"minItems":1,"type":"array"}},"required":["tracks"],"tool":"compose","type":"object"}';

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

function schemaOf(text: string): SchemaNode {
  const parsed: unknown = JSON.parse(text);
  const request = requestSchema(parsed);
  if (!request.ok) throw new Error(request.error);
  return request.schema;
}

const compose = schemaOf(COMPOSE_TEXT);
const images = schemaOf(
  JSON.stringify({
    additionalProperties: true,
    format: "comfystream.ffmpeg.request.v1",
    properties: {
      fps: { default: 4, exclusiveMinimum: 0, type: "number" },
      images: {
        items: {
          oneOf: [
            { minLength: 1, type: "string" },
            {
              additionalProperties: true,
              properties: {
                frames: { default: 1, minimum: 1, type: "integer" },
                url: { minLength: 1, type: "string" },
              },
              required: ["url"],
              type: "object",
            },
          ],
        },
        minItems: 1,
        type: "array",
      },
    },
    required: ["images"],
    tool: "images-to-video",
    type: "object",
  }),
);

it("resolves a relative schema url against the runner app url", () => {
  const runner = "https://hky.eliteencoder.net:8936/apps/runner_m5vpw5bf/app";
  expect(resolveSchemaUrl(runner, "./schema")).toBe(`${runner}/schema`);
  expect(schemaJobPath(runner, `${runner}/schema`)).toBe("/schema");
  expect(resolveSchemaUrl(runner, "./")).toBe(runner);
  expect(resolveSchemaUrl(runner, ".")).toBe(runner);
  expect(resolveSchemaUrl(runner, "")).toBe(runner);
});

it("reads schema_url and schema_sha256 from discovery metadata", () => {
  const runner = "https://orch.example/apps/runner_x/app";
  const found = registrationsFromDiscovery([
    {
      runners: [
        { app: "comfystream/ffmpeg-compose", url: runner, metadata: "not-json" },
        {
          app: "comfystream/ffmpeg-images-to-video",
          url: runner,
          metadata: JSON.stringify({
            kind: "ffmpeg-batch",
            required: ["images"],
            schema_sha256: COMPOSE_HASH,
            schema_url: "./schema",
            streaming: false,
            tool: "images-to-video",
          }),
        },
        { app: "blueclaw/chat/qwen", url: runner, metadata: "{\"capability\":\"openai:chat-completions\"}" },
      ],
    },
  ]);
  expect(found).toEqual([
    {
      app: "comfystream/ffmpeg-images-to-video",
      runnerUrl: runner,
      schemaUrl: `${runner}/schema`,
      schemaPath: "/schema",
      schemaSha256: COMPOSE_HASH,
      required: ["images"],
    },
  ]);
});

it("accepts the canonical schema bytes when a paid response re-encodes JSON", () => {
  const spaced = JSON.stringify(JSON.parse(COMPOSE_TEXT) as unknown, null, 2);
  expect(schemaDocumentMatches(COMPOSE_TEXT, COMPOSE_HASH, digest)).toBe(true);
  expect(schemaDocumentMatches(spaced, COMPOSE_HASH, digest)).toBe(true);
  const pinned = digest(`${COMPOSE_TEXT}\n`);
  expect(schemaDocumentMatches(spaced, pinned, digest)).toBe(true);
  expect(schemaDocumentMatches(`${COMPOSE_TEXT}\n`, pinned, digest)).toBe(true);
  expect(schemaDocumentMatches(COMPOSE_TEXT.replace('"default":4', '"default":5'), COMPOSE_HASH, digest)).toBe(false);
  expect(schemaDocumentMatches(COMPOSE_TEXT.replace('"default":4', '"default":5'), pinned, digest)).toBe(false);
});

it("unwraps a fal endpoint schema and ignores the wrapper", () => {
  const parsed = requestSchema({
    format: "livepeer.fal.endpoint-schema.v1",
    input_schema: { $ref: "#/components/schemas/FfmpegApiComposeInput" },
    components: { schemas: { FfmpegApiComposeInput: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } } },
    paths: { "/": { post: {} } },
  });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  expect(exampleFromSchema(parsed.schema)).toEqual({ prompt: "A red paper lantern over a quiet canal at dusk" });
  expect(requestSchema({ format: "unknown" }).ok).toBe(false);
});

it("builds an images body from the images schema and a tracks body from compose", () => {
  expect(exampleFromSchema(images)).toEqual({
    fps: 4,
    images: [{ frames: 8, url: MAP }],
  });
  expect(exampleFromSchema(compose)).toEqual({
    fps: 4,
    tracks: [
      {
        id: "video",
        keyframes: [{ duration: 2000, timestamp: 0, url: MAP }],
        type: "image",
      },
    ],
  });
  expect(JSON.stringify(exampleFromSchema(images))).not.toContain("tracks");
  expect(JSON.stringify(exampleFromSchema(compose))).not.toContain("images");
});

it("fills schema defaults and array minimums for other ffmpeg tools", () => {
  const scale = schemaOf(
    JSON.stringify({
      format: "comfystream.ffmpeg.request.v1",
      type: "object",
      required: ["video_url"],
      properties: {
        height: { minimum: 0, type: "integer" },
        mode: { default: "pad", enum: ["pad", "crop", "stretch"], type: "string" },
        video_url: { minLength: 1, type: "string" },
        width: { minimum: 0, type: "integer" },
      },
    }),
  );
  expect(exampleFromSchema(scale)).toEqual({ mode: "pad", video_url: "https://example.com/video.mp4" });
  const merged = schemaOf(
    JSON.stringify({
      format: "comfystream.ffmpeg.request.v1",
      type: "object",
      required: ["video_urls"],
      properties: { video_urls: { items: { minLength: 1, type: "string" }, minItems: 2, type: "array" } },
    }),
  );
  expect(exampleFromSchema(merged)?.video_urls).toEqual(["https://example.com/video.mp4", "https://example.com/video.mp4"]);
  const frame = schemaOf(
    JSON.stringify({
      format: "comfystream.ffmpeg.request.v1",
      type: "object",
      required: ["video_url"],
      properties: {
        frame_type: { default: "first", enum: ["first", "last"], type: "string" },
        video_url: { type: "string" },
      },
    }),
  );
  expect(exampleFromSchema(frame)).toMatchObject({ frame_type: "first" });
  const loud = schemaOf(
    JSON.stringify({
      format: "comfystream.ffmpeg.request.v1",
      type: "object",
      required: ["audio_url"],
      properties: {
        audio_url: { type: "string" },
        integrated_loudness: { default: -18, type: "number" },
        volume: { type: "integer" },
      },
    }),
  );
  expect(exampleFromSchema(loud)).toEqual({ audio_url: "https://example.com/audio.wav", integrated_loudness: -18 });
  const trim = schemaOf(
    JSON.stringify({
      format: "comfystream.ffmpeg.request.v1",
      type: "object",
      required: ["video_url"],
      properties: {
        duration: { minimum: 0, type: "number" },
        start_time: { default: 0, minimum: 0, type: "number" },
        video_url: { type: "string" },
      },
    }),
  );
  expect(exampleFromSchema(trim)).toEqual({ start_time: 0, video_url: "https://example.com/video.mp4" });
});

it("shows required fields and keeps keys the user added", () => {
  const labels = formFields(images, exampleFromSchema(images)).flatMap(function names(field): string[] {
    return field.kind === "group" ? [field.label, ...field.fields.flatMap(names)] : [field.label];
  });
  expect(labels).toContain("fps");
  expect(labels).toContain("images");
  expect(labels).not.toContain("tracks");
  const written = writePath({ fps: 4, images: [{ url: MAP, frames: 8 }], note: "keep" }, ["images", "0", "url"], MAP);
  expect(written).toMatchObject({ note: "keep", images: [{ frames: 8 }] });
  const video = "https://example.com/clip.mp4";
  const aligned = alignMediaType({ tracks: [{ id: "video", type: "image", keyframes: [{ url: video }] }] }, ["tracks", "0", "keyframes", "0", "url"]);
  expect(aligned).toMatchObject({ tracks: [{ type: "video", keyframes: [{ url: video }] }] });
  const track = alignMediaType({ tracks: [{ id: "video", type: "image", url: video }] }, ["tracks", "0", "url"]);
  expect(track).toMatchObject({ tracks: [{ type: "video", url: video }] });
  expect(missingRequired({ fps: 4 }, ["images"])).toEqual(["images"]);
  expect(missingRequired({ images: [] }, ["images"])).toEqual(["images"]);
  expect(missingRequired({ images: [{ url: MAP }] }, ["images"])).toEqual([]);
});
