import { expect, it } from "vitest";

import { examplePayload } from "./example-payload";

it("prefills a prompt for single-shot text-to-image apps", () => {
  const body = JSON.parse(examplePayload("comfystream/fal-flux-schnell", ["single-shot"])) as {
    prompt: string;
  };
  expect(body.prompt).toContain("lantern");
  expect(JSON.parse(examplePayload("flux-dev", ["single-shot"]))).toHaveProperty("prompt");
});

it("prefills image and video inputs from the app name", () => {
  expect(JSON.parse(examplePayload("comfystream/fal-flux-2-edit", ["single-shot"]))).toMatchObject({
    image_url: expect.any(String),
  });
  expect(JSON.parse(examplePayload("comfystream/fal-veo-31-i2v", ["single-shot"]))).toMatchObject({
    image_url: expect.any(String),
  });
  expect(JSON.parse(examplePayload("comfystream/fal-whisper-transcribe", ["single-shot"]))).toHaveProperty("audio_url");
  expect(JSON.parse(examplePayload("blueclaw/chat/qwen3.8-27b", ["single-shot"]))).toHaveProperty("messages");
});

it("does not guess a body for a registered ffmpeg tool", () => {
  expect(examplePayload("comfystream/ffmpeg-compose", ["single-shot"])).toBe("");
  expect(examplePayload("comfystream/ffmpeg-images-to-video", ["single-shot"])).toBe("");
});

it("leaves persistent apps empty", () => {
  expect(examplePayload("comfystream", ["persistent"])).toBe("");
  expect(examplePayload("comfystream/flux-klein", ["persistent"])).toBe("");
});
