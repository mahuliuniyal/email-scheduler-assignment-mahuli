import { prisma } from '../utils/prisma';
import { config } from '../config';
import { redis } from '../utils/redis';
import type { User } from '@prisma/client';

async function getSlackToken(userId: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ accessToken: string }>>(
    `SELECT "accessToken" FROM "OAuthConnection" WHERE "userId" = $1 AND "provider" = 'slack' LIMIT 1`,
    userId,
  );
  return rows[0]?.accessToken || config.SLACK_BOT_TOKEN || null;
}

export async function notifySlackRateLimit(user: User, campaignId: string, resetTime: number) {
  const channel = config.SLACK_ALERT_CHANNEL_ID;
  const token = await getSlackToken(user.id);
  if (!channel || !token) return false;

  const dedupeKey = `slack-alert:${user.id}:${campaignId}:${Math.floor(resetTime / 3600000)}`;
  const reserved = await redis.set(dedupeKey, '1', 'EX', 3600, 'NX');
  if (reserved !== 'OK') return true;

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel,
      text: `ReachInbox rate limit reached for campaign ${campaignId}. Emails will resume after ${new Date(resetTime).toISOString()}.`,
    }),
  });

  const body = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (!response.ok || body.ok === false) {
    await redis.del(dedupeKey);
    throw new Error(`Slack notification failed: ${body.error || response.statusText}`);
  }

  return true;
}
