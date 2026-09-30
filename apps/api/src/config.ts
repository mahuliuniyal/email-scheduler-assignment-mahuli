import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  AUTH_SECRET: z.string().default('change-me-in-production'),
  DATABASE_URL: z.string(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  ELASTICSEARCH_URL: z.string().default('http://localhost:9200'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).default(5),
  MIN_SEND_DELAY_MS: z.coerce.number().int().min(0).default(2000),
  MAX_EMAILS_PER_HOUR_PER_SENDER: z.coerce.number().int().min(1).default(50),
  SENDING_LEASE_MS: z.coerce.number().int().min(1000).default(120000),
  OUTBOX_POLL_MS: z.coerce.number().int().min(250).default(2000),
  SMTP_HOST: z.string().default('smtp.ethereal.email'),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:3001/auth/google/callback'),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_REDIRECT_URI: z.string().default('http://localhost:3001/auth/slack/callback'),
  SLACK_ALERT_CHANNEL_ID: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
});

export const config = envSchema.parse(process.env);
