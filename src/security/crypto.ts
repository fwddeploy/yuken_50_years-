const PIN_ITERATIONS = 210_000;
const PIN_BYTES = 32;

export function isValidPin(pin: string) {
  return /^\d{4}$/.test(pin);
}

export async function hashPin(pin: string, salt = randomToken(16)) {
  if (!isValidPin(pin)) throw new Error("PIN must contain exactly four digits.");
  const key = await crypto.subtle.importKey("raw", encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(salt), iterations: PIN_ITERATIONS },
    key,
    PIN_BYTES * 8,
  );
  return { hash: toBase64Url(new Uint8Array(bits)), salt };
}

export async function verifyPin(pin: string, expectedHash: string, salt: string) {
  if (!isValidPin(pin) || !expectedHash || !salt) return false;
  const actual = await hashPin(pin, salt);
  return constantTimeEqual(actual.hash, expectedHash);
}

export function createSessionToken() {
  return randomToken(32);
}

export function createPublicToken() {
  return randomToken(32);
}

export async function hashPublicToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encode(token));
  return toBase64Url(new Uint8Array(digest));
}

export async function hashSessionToken(token: string, pepper: string) {
  const digest = await crypto.subtle.digest("SHA-256", encode(`${pepper}:${token}`));
  return toBase64Url(new Uint8Array(digest));
}

export function constantTimeEqual(left: string, right: string) {
  const a = encode(left);
  const b = encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index % a.length] ?? 0) ^ (b[index % b.length] ?? 0);
  return mismatch === 0;
}

function randomToken(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function encode(value: string) {
  return new TextEncoder().encode(value);
}

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}
