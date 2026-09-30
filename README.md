# Email Scheduler

A production-style email scheduling platform built with **TypeScript, React/Next.js, Express, PostgreSQL, Redis, BullMQ, Elasticsearch, Google OAuth, Slack OAuth, and Ethereal Email**.

The application allows users to upload leads, compose campaigns, schedule emails, control sending speed/rate limits, and monitor scheduled/sent emails through a web dashboard.

---

## Features

### Authentication
- Google OAuth login
- Session-based authenticated application flow
- Sender account integration for Google

### Email Campaigns
- Compose email campaigns from the dashboard
- Upload lead lists using CSV/text input
- Configure:
  - Delay between emails
  - Hourly sending limit
  - Scheduled start date/time
- Track scheduled and sent emails
- Campaign and lead persistence through PostgreSQL

### Reliable Email Scheduling
- BullMQ + Redis based background job processing
- No cron-based email sending
- Durable scheduling through PostgreSQL
- Jobs survive application restarts
- Deterministic job IDs for idempotent processing
- Sending leases prevent duplicate concurrent processing
- Failed jobs can be retried safely

### Rate Limiting
- Configurable hourly email limit per campaign
- Minimum delay between consecutive emails
- Rate-limit state is maintained using Redis
- When the rate limit is exhausted, jobs are delayed/rescheduled instead of being dropped
- Supports safe processing across workers/instances

### Slack Notifications
- Real Slack OAuth integration
- Configurable Slack alert channel
- Rate-limit events can trigger Slack notifications

### Email Delivery
- Ethereal Email used for development/testing
- SMTP-based email sending
- Preview URL support for Ethereal messages

### Search & Analytics Infrastructure
- Elasticsearch integration for email/job synchronization
- BullMQ queue monitoring through Bull Board

### Dashboard
- Compose interface
- Scheduled emails view
- Sent emails view
- Search/filter interface
- Queue monitoring
- Google and Slack integrations

---

# Tech Stack

## Frontend
- Next.js
- React
- TypeScript
- Tailwind CSS

## Backend
- Node.js
- Express
- TypeScript

## Data & Infrastructure
- PostgreSQL
- Prisma ORM
- Redis
- BullMQ
- Elasticsearch

## Integrations
- Google OAuth
- Slack OAuth
- Ethereal Email / SMTP

## Testing
- Jest
- Integration tests for scheduler/worker behaviour

---

# Architecture

```text
                         ┌──────────────────────┐
                         │      Next.js UI      │
                         │  React + TypeScript  │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │   Express API        │
                         │      Backend         │
                         └──────┬───────┬───────┘
                                │       │
                    ┌───────────┘       └────────────┐
                    ▼                                ▼
          ┌──────────────────┐             ┌──────────────────┐
          │   PostgreSQL     │             │      Redis       │
          │    + Prisma      │             │ BullMQ Queues    │
          └────────┬─────────┘             └────────┬─────────┘
                   │                                │
                   │                                ▼
                   │                     ┌────────────────────┐
                   │                     │   Email Worker     │
                   │                     │ delay/rate-limit/  │
                   │                     │ retry/idempotency  │
                   │                     └─────────┬──────────┘
                   │                               │
                   │                               ▼
                   │                     ┌────────────────────┐
                   │                     │   Ethereal SMTP    │
                   │                     │   Email Delivery   │
                   │                     └────────────────────┘
                   │
                   ▼
          ┌──────────────────┐
          │   Outbox Table   │
          │ durable dispatch │
          └────────┬─────────┘
                   │
                   ▼
          ┌──────────────────┐
          │ Outbox Dispatcher│
          │ PostgreSQL →     │
          │ BullMQ           │
          └──────────────────┘

Additional integrations:

      ┌──────────────────┐       ┌──────────────────┐
      │   Elasticsearch  │       │      Slack       │
      │   Job indexing   │       │ Rate-limit alert │
      └──────────────────┘       └──────────────────┘

      ┌──────────────────┐
      │    Bull Board    │
      │ Queue Monitoring │
      └──────────────────┘
