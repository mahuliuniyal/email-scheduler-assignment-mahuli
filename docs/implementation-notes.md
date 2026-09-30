# Implementation Notes

This note records architecture changes made while turning the initial scaffold into the submission-ready assignment.

## OAuth storage

A dedicated `OAuthConnection` table was added for provider tokens such as Slack. Google sender accounts continue to live in `SenderAccount` because the Google identity is also the sender identity used by campaigns.

## Transactional outbox dispatch

The outbox is persisted in the same PostgreSQL transaction as the durable `EmailJob`. Publishing is performed by a BullMQ `outbox-dispatch-queue` worker.

The production process schedules the next outbox poll as another **delayed BullMQ job**. There is no `node-cron`, `setInterval`, or in-memory scheduler loop. This keeps the scheduling mechanism itself restartable through Redis/BullMQ.

## Rate limiting

Hourly quota and minimum-delay reservation are evaluated in one Redis Lua script. A send only consumes quota when both constraints pass. When the hourly limit is exhausted or the minimum delay has not elapsed, the active BullMQ job is moved to the delayed set and retained for later processing.

## Delivery semantics

The system is application-level idempotent and restart-safe, but SMTP is an external side effect. A crash after SMTP accepts a message and before PostgreSQL commits `SENT` can still create a duplicate on retry. The implementation does not claim mathematical exactly-once delivery.

## UI implementation

The Next.js UI follows the visible Figma structure: centered Google login card, left navigation, green Compose action, Scheduled/Sent list views, search, compose controls, lead upload and a Send Later modal. The backend APIs remain the source of data rather than mock/static rows.
