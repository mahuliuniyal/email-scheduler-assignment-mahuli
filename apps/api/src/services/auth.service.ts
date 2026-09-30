import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { config } from '../config';

const SESSION_COOKIE = 'one_session';
const STATE_TTL_MS = 10 * 60 * 1000;

type SessionPayload = { userId: string; exp: number };
type OAuthState = { provider: 'google' | 'slack'; userId?: string; exp: number; nonce: string };

function sign(value: string) {
  return crypto.createHmac('sha256', config.AUTH_SECRET).update(value).digest('base64url');
}

function encode(payload: object) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${data}.${sign(data)}`;
}

function decode<T>(token: string): T | null {
  const [data, signature] = token.split('.');
  if (!data || !signature) return null;
  const expected = sign(data);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function getCookie(req: Request, name: string) {
  const raw = req.headers.cookie || '';
  const value = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined;
}

export function createSessionCookie(userId: string) {
  const token = encode({ userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 } satisfies SessionPayload);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${config.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

export function createOAuthState(provider: OAuthState['provider'], userId?: string) {
  return encode({ provider, userId, exp: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(16).toString('hex') } satisfies OAuthState);
}

export function readOAuthState(state: string): OAuthState | null {
  const payload = decode<OAuthState>(state);
  if (!payload || payload.exp < Date.now()) return null;
  return payload;
}

export async function getUserFromRequest(req: Request) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const payload = decode<SessionPayload>(token);
  if (!payload || payload.exp < Date.now()) return null;
  return prisma.user.findUnique({ where: { id: payload.userId } });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  res.locals.user = user;
  next();
}

export function isProductionAuthBypassed() {
  return config.NODE_ENV === 'test';
}
