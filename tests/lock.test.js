import { describe, it, expect } from 'vitest';
import { encrypt, deriveKey, decryptWithKey, exportKey, importKey } from '../src/lock.js';

describe('password lock', () => {
  it('decrypts with the right password and a remembered key', async () => {
    const payload = await encrypt('secret-pw', 'The big red hen.');
    expect(payload.data).not.toContain('hen');
    const key = await deriveKey('secret-pw', payload.salt);
    expect(await decryptWithKey(key, payload)).toBe('The big red hen.');
    const again = await importKey(await exportKey(key));
    expect(await decryptWithKey(again, payload)).toBe('The big red hen.');
  });

  it('refuses the wrong password', async () => {
    const payload = await encrypt('secret-pw', 'The big red hen.');
    const wrong = await deriveKey('Secret-pw', payload.salt);
    await expect(decryptWithKey(wrong, payload)).rejects.toThrow();
  });
});
