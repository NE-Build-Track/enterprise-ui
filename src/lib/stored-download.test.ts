import { expect, it } from "vitest";

import { storedDownload } from "./stored-download";

it("keeps a non-UTF-8 body byte for byte", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe]);
  const response = storedDownload("job-1", png, "image/png", 200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="job-1.png"');
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
});

it("does not reflect an active document type onto this origin", async () => {
  const html = new TextEncoder().encode("<html></html>");
  const response = storedDownload("job-1", html, "text/html; charset=utf-8", 200);
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(html);
  expect(response.headers.get("content-type")).toBe("application/octet-stream");
  expect(response.headers.get("content-disposition")).toContain("attachment");
});
