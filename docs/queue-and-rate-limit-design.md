# Queue & Rate Limit Design

## 1. Rate Limiting Strategy
## 1. Rate Limiting Strategy
We require a Redis/DB-backed distributed hourly rate limit to cap how many emails a specific sender (OAuth user) can send per hour. This limit must be configurable per campaign or sender.

### 1.1. Redis Key Structure
We use an atomic counter in Redis to track limits.
- **Key**: `ratelimit:email:{sender_id}:{YYYY-MM-DD-HH}`
- **Action**: `INCR` the key atomically via a Lua script or simple Redis transaction.
- **Expiration**: `EXPIRE` set to 3600 seconds on the first increment.

### 1.2. Rescheduling on Exhaustion (Preserving Order)
If the worker pops a job and the `INCR` operation exceeds `HOURLY_LIMIT`:
1. The job is **NOT dropped**.
2. The worker calculates the exact time remaining until the next hour boundary: 
   `delay = 3600 - (current_time_in_seconds % 3600)`
3. The worker invokes BullMQ's `job.moveToDelayed(delay * 1000)` API.
4. The job is temporarily suspended and placed back in the delayed set, preserving its execution intent for the next available window without modifying the user's original `scheduledFor` intent in the DB.

## 2. Minimum Delay Between Sends (Centralized Enforcement)
To enforce a minimum delay between emails, we **DO NOT** artificially alter the `scheduledFor` requested time during the initial CSV enqueue phase. Doing so creates brittle schedules that break if jobs fail or new jobs are added.

Instead, the minimum delay is enforced centrally at the worker/queue level:
- **Using BullMQ Rate Limiter**: BullMQ natively supports rate limiting at the queue or worker level (e.g., `limit: 1, duration: min_delay * 1000`). 
- **Alternative (Custom Redis Token Bucket)**: A Redis key tracking the `last_sent_timestamp:{sender_id}`. If a worker picks up a job and `Date.now() - last_sent < min_delay`, it immediately calls `job.moveToDelayed(remaining_wait_time)`. This securely enforces the minimum delay across all distributed workers dynamically.

## 3. Slack Notification Deduplication
When the rate limit is hit, the user must be notified via a real Slack OAuth API webhook. However, we must prevent spamming the user if 100 emails hit the rate limit in the same hour.

### 3.1. Deduplication Logic
- **Key**: `slack_notified:{sender_id}:{YYYY-MM-DD-HH}`
- **Action**: Use Redis `SETNX` (Set if Not eXists) with a value of `1` and expiry of 3600s.
- **Flow**:
  1. Rate limit hit.
  2. `SETNX slack_notified...`
  3. If result is `1`, make the HTTP request to Slack API.
  4. If result is `0`, skip the Slack notification.

## 4. BullMQ Configuration Details
- **No Cron**: Recurring checks are strictly forbidden. All scheduling relies on BullMQ's delayed sets.
- **Concurrency**: Controlled via worker instantiation `new Worker(queueName, processor, { concurrency: Number(process.env.WORKER_CONCURRENCY) || 5 })`.
- **Live Dashboard**: Configured via `@bull-board/express`. Mounted on `/admin/queues` with authentication middleware.
