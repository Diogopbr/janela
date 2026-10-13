import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, parameters, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}
export async function hashPassword(password: string): Promise<string> {
  if ([...password].length < 12 || Buffer.byteLength(password, 'utf8') > 1024) throw new Error('Password must contain at least 12 characters and at most 1024 bytes');
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$32768$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (Buffer.byteLength(password, 'utf8') > 1024) return false;
  const match = /^scrypt\$32768\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
  if (!match?.[1] || !match[2]) return false;
  const key = await derive(password, Buffer.from(match[1], 'hex'));
  return timingSafeEqual(key, Buffer.from(match[2], 'hex'));
}
