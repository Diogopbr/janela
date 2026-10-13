import { expect, test } from 'vitest';
import { hashPassword, verifyPassword } from '../../src/access/passwords.js';
test('passwords use individual salts, verify exact input and reject malformed hashes', async () => {
  const password = 'fixture-only-long-password';
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  expect(first).not.toBe(second);
  expect(first).not.toContain(password);
  expect(await verifyPassword(password, first)).toBe(true);
  expect(await verifyPassword('wrong-password', first)).toBe(false);
  expect(await verifyPassword(password, 'invalid')).toBe(false);
  expect(await verifyPassword(password, 'scrypt$999999999$8$1$00$00')).toBe(false);
});
test('administrative password creation rejects short input', async () => {
  await expect(hashPassword('short')).rejects.toThrow('12');
});
