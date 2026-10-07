import { createHmac, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_SECONDS = 60 * 60 * 24;

function sign(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createAdminSession(username: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error('ADMIN_SESSION_SECRET is not configured');
  const payload = Buffer.from(JSON.stringify({ username, issuedAt: Math.floor(Date.now() / 1000) })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyAdminSession(token?: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || !token) return false;

  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;

  const expected = Buffer.from(sign(payload, secret), 'hex');
  const actual = Buffer.from(signature, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { issuedAt?: number };
    const age = Math.floor(Date.now() / 1000) - Number(data.issuedAt);
    return Number.isFinite(age) && age >= 0 && age < SESSION_TTL_SECONDS;
  } catch {
    return false;
  }
}

export function secureEquals(value: string, expected: string) {
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
