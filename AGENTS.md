# Strict Engineering Rules for Agents (AGENTS.md)

Future coding agents MUST strictly adhere to the following rules when implementing the ReachInbox / Outbox Labs Full-stack Email Job Scheduler:

1. **NO CRON JOBS**: You are strictly forbidden from using `node-cron`, `cron`, `setInterval`, or any custom recurring background loop. All delays, rate limits, and scheduling MUST be handled via BullMQ delayed sets.
2. **PostgreSQL is the ONLY Source of Truth**: Redis and BullMQ are volatile state mediums. All actual states (PENDING, SENT, FAILED) must be durably written to PostgreSQL.
3. **Idempotency is Non-Negotiable but Acknowledge "At-Least-Once" Reality**: 
   - Every email send operation must check durable state in PostgreSQL before sending to prevent duplicates.
   - You must NOT claim "exactly-once" delivery is mathematically guaranteed. Acknowledge that a crash after SMTP accepts the email but before DB commit will cause a duplicate. Keep the transaction window as short as possible to minimize this.
4. **Do Not Fake Integrations**:
   - Do NOT mock Google OAuth. Use the real OAuth2 strategy.
   - Do NOT mock Slack OAuth. The Slack rate limit alert must send a real HTTP request.
   - Do NOT fake Elasticsearch. Index real documents and search via the official ES client.
   - Do NOT fake Ethereal delivery. Use `nodemailer` to dispatch to actual Ethereal credentials.
5. **Rate Limiting & Delays**:
   - Do NOT use in-memory rate limiting (no arrays, no local variables).
   - Limit state must be Redis-backed and atomic across workers.
   - Exhaustion of the rate limit MUST reschedule the job (using BullMQ `moveToDelayed`), NOT drop it.
   - **Do NOT artificially alter requested schedule times during initial enqueue to achieve "minimum delay".** Enforce minimum send delays centrally (e.g., using BullMQ's built-in rate limiter or checking a `last_sent` Redis key at processing time).
6. **Infrastructure**:
   - Do NOT introduce RabbitMQ, Kafka, or alternative queues. Use BullMQ.
   - Do NOT introduce another database. Use PostgreSQL.
7. **Configurability**: All concurrency levels, default minimum delays, and Redis/DB connection strings must be read from environment variables.
8. **UI/UX**: The frontend must consume real backend APIs rather than mocked static JSON. Follow the standard SaaS dashboard patterns if specific Figma designs cannot be queried.
9. **Architectural Adjustments**: Do not change the approved architecture in `docs/` without explicitly documenting the reason in a new markdown file.
10. **Code Quality**: Prefer small, single-responsibility modules (e.g., `services/email.ts`, `services/queue.ts`, `jobs/processor.ts`).
