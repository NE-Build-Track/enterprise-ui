const ACTIVE_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "text/javascript",
  "application/javascript",
]);

const EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "application/json": "json",
  "text/plain": "txt",
  "application/octet-stream": "bin",
};

/** Attachment response for a stored job body. Active document types stay as opaque bytes. */
export function storedDownload(id: string, bytes: Uint8Array, contentType: string, status: number): Response {
  const raw = contentType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
  const media = ACTIVE_TYPES.has(raw) ? "application/octet-stream" : raw;
  const filename = downloadName(id, media);
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return new Response(body, {
    status,
    headers: {
      "content-type": media,
      "content-disposition": `attachment; filename="${filename}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}

function downloadName(id: string, media: string): string {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "") || "job";
  const extension = EXTENSIONS[media];
  return extension ? `${safeId}.${extension}` : safeId;
}
