import crypto from 'crypto';
import { Router } from 'express';
import { config } from '../config';
import { prisma } from '../utils/prisma';
import { createOAuthState, createSessionCookie, clearSessionCookie, getUserFromRequest, readOAuthState } from '../services/auth.service';

const router = Router();

router.get('/google', (_req, res) => {
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    return res.status(503).send('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }
  const state = createOAuthState('google');
  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: config.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req, res) => {
  try {
    const state = typeof req.query.state === 'string' ? readOAuthState(req.query.state) : null;
    if (!state || state.provider !== 'google') return res.status(400).send('Invalid OAuth state');
    if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) return res.status(503).send('Google OAuth is not configured');
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code) return res.status(400).send('Missing OAuth code');

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.GOOGLE_CLIENT_ID,
        client_secret: config.GOOGLE_CLIENT_SECRET,
        redirect_uri: config.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
    if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error || 'Google token exchange failed');

    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileResponse.json() as { email?: string; name?: string };
    if (!profile.email) throw new Error('Google account did not return an email');

    const user = await prisma.user.upsert({
      where: { email: profile.email },
      update: { name: profile.name || undefined },
      create: { email: profile.email, name: profile.name },
    });

    await prisma.senderAccount.upsert({
      where: { userId_email: { userId: user.id, email: profile.email } },
      update: {
        provider: 'google',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
      },
      create: {
        userId: user.id,
        provider: 'google',
        email: profile.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
      },
    });

    res.setHeader('Set-Cookie', createSessionCookie(user.id));
    return res.redirect(config.FRONTEND_URL);
  } catch (error) {
    console.error('Google OAuth error', error);
    return res.status(500).send('Google OAuth failed');
  }
});

router.get('/slack', async (req, res) => {
  if (!config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET) return res.status(503).send('Slack OAuth is not configured');
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).send('Sign in with Google first');
  const state = createOAuthState('slack', user.id);
  const params = new URLSearchParams({
    client_id: config.SLACK_CLIENT_ID,
    redirect_uri: config.SLACK_REDIRECT_URI,
    user_scope: 'chat:write',
    state,
  });
  return res.redirect(`https://slack.com/oauth/v2/authorize?${params}`);
});

router.get('/slack/callback', async (req, res) => {
  try {
    const state = typeof req.query.state === 'string' ? readOAuthState(req.query.state) : null;
    if (!state || state.provider !== 'slack' || !state.userId) return res.status(400).send('Invalid Slack OAuth state');
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    if (!code || !config.SLACK_CLIENT_ID || !config.SLACK_CLIENT_SECRET) return res.status(400).send('Missing Slack OAuth configuration');

    const tokenResponse = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.SLACK_CLIENT_ID,
        client_secret: config.SLACK_CLIENT_SECRET,
        redirect_uri: config.SLACK_REDIRECT_URI,
      }),
    });
    const data = await tokenResponse.json() as {
      ok?: boolean;
      access_token?: string;
      authed_user?: { id?: string; access_token?: string };
      team?: { id?: string; name?: string };
      error?: string;
    };
    if (!tokenResponse.ok || !data.ok) throw new Error(data.error || 'Slack token exchange failed');

    const accessToken = data.authed_user?.access_token || data.access_token;
    if (!accessToken) throw new Error('Slack did not return an access token');

    await prisma.$executeRawUnsafe(
      `INSERT INTO "OAuthConnection" ("id", "userId", "provider", "externalId", "accessToken", "metadata", "createdAt", "updatedAt")
       VALUES ($1, $2, 'slack', $3, $4, $5::jsonb, NOW(), NOW())
       ON CONFLICT ("userId", "provider") DO UPDATE SET
         "externalId" = EXCLUDED."externalId",
         "accessToken" = EXCLUDED."accessToken",
         "metadata" = EXCLUDED."metadata",
         "updatedAt" = NOW()`,
      crypto.randomUUID(),
      state.userId,
      data.authed_user?.id || null,
      accessToken,
      JSON.stringify({ teamId: data.team?.id, teamName: data.team?.name }),
    );

    return res.redirect(`${config.FRONTEND_URL}/?slack=connected`);
  } catch (error) {
    console.error('Slack OAuth error', error);
    return res.status(500).send('Slack OAuth failed');
  }
});

router.get('/me', async (req, res) => {
  const user = await getUserFromRequest(req);
  if (!user) return res.status(401).json({ authenticated: false });
  return res.json({ authenticated: true, user });
});

router.post('/logout', (_req, res) => {
  res.setHeader('Set-Cookie', clearSessionCookie());
  return res.json({ ok: true });
});

router.post('/dev-login', async (req, res) => {
  if (config.NODE_ENV === 'production') return res.status(404).end();
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: email.split('@')[0] } });
  res.setHeader('Set-Cookie', createSessionCookie(user.id));
  return res.json({ user });
});

export default router;
