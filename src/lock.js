/**
 * Password lock for the story content.
 *
 * The workbook transcriptions are encrypted at build time (see
 * vite.config.js) with AES-GCM, using a key derived from the password with
 * PBKDF2. The published site only ever contains the encrypted bytes, so the
 * stories cannot be read from the page source without the password.
 *
 * The same functions run in Node (at build time) and in the browser.
 */

const ITERATIONS = 250_000;
const subtle = globalThis.crypto.subtle;

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function deriveKey(password, saltB64) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt a string. Returns a JSON-safe payload: { salt, iv, data } in base64. */
export async function encrypt(password, plaintext) {
  const salt = toB64(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
  return { salt, iv: toB64(iv), data: toB64(new Uint8Array(data)) };
}

/** Decrypt with a CryptoKey. Throws if the key is wrong (AES-GCM authentication). */
export async function decryptWithKey(key, payload) {
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(payload.iv) }, key, fromB64(payload.data));
  return new TextDecoder().decode(plain);
}

export async function exportKey(key) {
  return toB64(new Uint8Array(await subtle.exportKey('raw', key)));
}

export async function importKey(b64) {
  return subtle.importKey('raw', fromB64(b64), { name: 'AES-GCM' }, true, ['decrypt']);
}
