# ONE — ReachInbox / Outbox Labs Email Scheduler

A full-stack email outreach scheduler built with Next.js, Express, TypeScript, PostgreSQL, Prisma, BullMQ, Redis, Elasticsearch, Ethereal SMTP, Google OAuth and Slack OAuth.

## Features

- Google OAuth login with a real Google authorization-code exchange.
- Slack OAuth connection and real Slack `chat.postMessage` alerts when a sender hourly limit is exhausted.
- Campaign creation with sender, subject/body templates, minimum delay and hourly limit.
- CSV/text lead upload from the compose screen.
- Durable PostgreSQL `EmailJob` + transactional `EmailOutbox` persistence.
- BullMQ delayed scheduling with deterministic job IDs for idempotent enqueue.
- Atomic Redis-backed hourly quota + minimum-delay reservation shared by workers.
- Rate-limit and throttle exhaustion reschedules the active BullMQ job instead of dropping it.
- Crash recovery using a durable DB sending lease.
- Ethereal SMTP delivery with preview URL capture for development.
- Elasticsearch indexing and search for scheduled/sent email records.
- Bull Board at `/admin/queues`.
- Figma-inspired login, inbox list, compose form and Send Later modal.

## Local setup

1. Start infrastructure:

```bash
docker compose up -d
```

2. Copy environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

3. Install dependencies and generate Prisma client:

```bash
npm install
npm run prisma:generate -w @scheduler/api
npm run migrate:deploy -w @scheduler/api
```

4. Configure OAuth values in `apps/api/.env`.

Google redirect URI:
`http://localhost:3001/auth/google/callback`

Slack redirect URI:
`http://localhost:3001/auth/slack/callback`

For Slack alerts, also set `SLACK_ALERT_CHANNEL_ID` to the target channel ID. `SLACK_BOT_TOKEN` can be used as an environment fallback, while the normal path stores the real OAuth access token in PostgreSQL.

5. Start the backend and frontend:

```bash
npm run dev -w @scheduler/api
npm run dev -w @scheduler/web
```

Frontend: http://localhost:3000
API: http://localhost:3001
Bull Board: http://localhost:3001/admin/queues

## Honest delivery semantics

The system is restart-safe and idempotent at the application/queue level, but SMTP is an external side effect. A crash after an SMTP server accepts a message and before PostgreSQL commits `SENT` can still result in a duplicate on retry. The implementation deliberately does not claim mathematically perfect exactly-once email delivery.

## No cron

There is no `node-cron` or system cron. Email execution uses BullMQ delayed jobs. The transactional-outbox dispatcher uses a chained BullMQ delayed maintenance job so pending outbox rows are eventually published after a process restart.
