export const MAX_UPDATE_ATTACHMENTS = 3;
export const MAX_UPDATE_MEDIA_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const types = {
  "image/jpeg": { kind: "image", extension: "jpg" },
  "image/png": { kind: "image", extension: "png" },
  "image/webp": { kind: "image", extension: "webp" },
  "image/heic": { kind: "image", extension: "heic" },
  "image/heif": { kind: "image", extension: "heif" },
  "video/mp4": { kind: "video", extension: "mp4" },
  "video/quicktime": { kind: "video", extension: "mov" },
  "video/webm": { kind: "video", extension: "webm" },
} as const;

export type AllowedMediaType = keyof typeof types;

export function mediaTypeDetails(contentType: string) {
  return types[contentType as AllowedMediaType] ?? null;
}

export function validateMediaSelection(files: ReadonlyArray<{ type: string; size: number }>) {
  if (files.length > MAX_UPDATE_ATTACHMENTS) return `Choose no more than ${MAX_UPDATE_ATTACHMENTS} photos or videos.`;
  let total = 0;
  for (const file of files) {
    const details = mediaTypeDetails(file.type);
    if (!details) return "Use JPG, PNG, WebP, HEIC, MP4, MOV or WebM files.";
    if (details.kind === "image" && file.size > MAX_IMAGE_BYTES) return "Each photo must be 10 MB or smaller.";
    total += file.size;
  }
  if (total > MAX_UPDATE_MEDIA_BYTES) return "Photos and videos together must be 50 MB or smaller.";
  return null;
}

export function safeMediaFileName(name: string) {
  const leaf = name.replaceAll("\\", "/").split("/").pop()?.trim() || "attachment";
  return Array.from(leaf).filter(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127).join("").slice(0, 180) || "attachment";
}

export function parseMediaRange(header: string | null, size: number): { offset: number; length: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size < 1) return "invalid";
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix < 1) return "invalid";
    const length = Math.min(suffix, size);
    return { offset: size - length, length, end: size - 1 };
  }
  const offset = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(requestedEnd) || offset < 0 || requestedEnd < offset || offset >= size) return "invalid";
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1, end };
}

export async function hasExpectedMediaSignature(file: Blob, contentType: string) {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (contentType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes[0] === 0x89 && ascii(1, 4) === "PNG";
  if (contentType === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (contentType === "video/webm") return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  if (["image/heic", "image/heif", "video/mp4", "video/quicktime"].includes(contentType)) return ascii(4, 8) === "ftyp";
  return false;
}
