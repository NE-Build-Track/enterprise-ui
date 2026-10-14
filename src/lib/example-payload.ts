const PROMPT = "A red paper lantern over a quiet canal at dusk";
const IMAGE = "https://example.com/image.jpg";
const VIDEO = "https://example.com/video.mp4";
const AUDIO = "https://example.com/audio.wav";

type Json = Record<string, unknown>;

/** Example runner body for a single-shot offering. Persistent apps get none. */
export function examplePayload(app: string, modes: readonly string[]): string {
  if (!modes.includes("single-shot")) return "";
  const body = bodyFor(app.toLowerCase());
  return JSON.stringify(body, null, 2);
}

function bodyFor(app: string): Json {
  if (app.includes("/chat/") || app.endsWith("/chat")) {
    return { messages: [{ role: "user", content: "Say hello in one sentence." }] };
  }
  if (includesAny(app, ["whisper", "asr", "transcribe"])) return { audio_url: AUDIO };
  if (includesAny(app, ["tts"])) return { text: "Hello from the enterprise desk." };
  if (includesAny(app, ["music", "sfx", "soundtrack"])) return { prompt: "Soft rain on a tin roof" };
  if (includesAny(app, ["subtitle"])) return { video_url: VIDEO };
  if (includesAny(app, ["bg-remove", "background-removal", "upscale"])) {
    return app.includes("video") ? { video_url: VIDEO } : { image_url: IMAGE };
  }
  if (includesAny(app, ["edit", "erase", "fill", "inpaint"])) return { prompt: PROMPT, image_url: IMAGE };
  if (includesAny(app, ["transition", "keyframe", "first-last"])) {
    return { prompt: PROMPT, image_url: IMAGE, end_image_url: IMAGE };
  }
  if (includesAny(app, ["a2v", "audio-to-video", "lipsync", "talking-head"])) {
    return { prompt: PROMPT, image_url: IMAGE, audio_url: AUDIO };
  }
  if (includesAny(app, ["i2v", "image-to-video", "ref2v", "reference-to-video", "i3d", "image-to-3d"])) {
    return { prompt: PROMPT, image_url: IMAGE };
  }
  if (includesAny(app, ["v2v", "video-to-video", "video-to-music", "extract-frame", "trim", "merge", "compose", "metadata", "loudnorm"])) {
    return includesAny(app, ["v2v", "video-to-video", "video-to-music"])
      ? { prompt: PROMPT, video_url: VIDEO }
      : { video_url: VIDEO };
  }
  if (includesAny(app, ["images-to-video"])) return { prompt: PROMPT, image_urls: [IMAGE] };
  return { prompt: PROMPT };
}

function includesAny(app: string, needles: readonly string[]): boolean {
  return needles.some((needle) => app.includes(needle));
}
