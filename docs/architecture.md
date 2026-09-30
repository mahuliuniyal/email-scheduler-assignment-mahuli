# Architecture Document: Email Job Scheduler

## 1. Overview
The ReachInbox / Outbox Labs Full-stack Email Job Scheduler is a robust, scalable system designed for automated email outreach. 

**Stack:**
- **Frontend**: React (or Next.js) + Tailwind CSS
- **Backend API**: Node.js + Express.js + TypeScript
- **Database**: PostgreSQL (via Prisma ORM)
- **Queue & Scheduling**: BullMQ + Redis
- **Search**: Elasticsearch
- **Email Delivery**: Ethereal SMTP
- **Integrations**: Google OAuth, Slack OAuth

## 2. Verified Figma UI Summary (Based STRICTLY on visible design)
*Note: This summary is based solely on visual inspection of the provided Figma screenshot. Fonts, exact hex colors, and exact pixel dimensions cannot be definitively extracted without Figma Dev Mode access, so they are described observationally. Features requested in the assignment but not visually present (e.g., Slack/OAuth settings pages, BullMQ dashboard UI, CSV mapping modals) are intentionally omitted from this visual spec.*

**Visible Screens:**
1. **Login Screen**: 
   - A white card centered on a light background.
   - Contains a "Login" header, a "Login with Google" button (light background, Google logo), a divider text ("or sign up through email"), two inputs ("Email ID", "Password"), and a solid green "Login" button.
2. **Homepage (Dashboard List View)**: 
   - **Sidebar**: Logo ("ON8" or "ONE") at top left. User profile dropdown (avatar, name, email). Solid green "Compose" pill button. Navigation links: "Inbox" (gray icon/text), "Scheduled" (light green active background, green text, count badge), "Sent" (count badge).
   - **Main Area**: Top search bar with a magnifying glass icon. List of emails below it showing sender name, subject snippet, and pill-shaped status tags (e.g., orange background with orange text for times, light gray for "Scheduled").
3. **Homepage (Email Detail View)**: 
   - Header with a back arrow and thread subject.
   - Email body showing sender avatar, name, recipient dropdown ("to me"), and timestamp.
   - Email content contains text, a highlighted callout block (light yellow background, orange accent), and image attachments displayed as thumbnails.
4. **Homepage (Compose New Email)**: 
   - Header with "<- Compose New Email" on the left, and a "Send Later" (outline) and "Send" (solid green) button on the right.
   - Form fields horizontally aligned: "From" (dropdown), "To" (text input), "Subject" (text input).
   - Scheduling settings row: "Delay between 2 emails" (numeric input), "Hourly Limit" (numeric input).
   - Right side link: "+ Upload List" (green text with an icon).
   - Rich Text Editor: "Type Your Reply..." placeholder. Formatting toolbar (bold, italic, lists, etc.) is visible above the text area in one of the frames.
5. **Send Later Popover/Modal**: 
   - Appears over the compose view.
   - Title "Send Later", input for "Pick date & time", and a list of quick-select options (e.g., "Tomorrow, 10:00 AM").
   - "Cancel" (text) and "Done" (solid green) buttons at the bottom.

## 3. Core Architecture Decisions & Guiding Principles

### 3.1. PostgreSQL as Durable Source of Truth
PostgreSQL holds the definitive state of all entities. The `EmailJob` table tracks whether an email is `PENDING`, `SCHEDULED`, `SENDING`, `SENT`, or `FAILED`. Redis/BullMQ is used purely for transient scheduling and execution orchestration.

### 3.2. Idempotency and "At-Least-Once" Semantics
**Important**: BullMQ provides **at-least-once** job execution. It is impossible to guarantee mathematically perfect exactly-once delivery when interacting with an external network service (SMTP) without distributed transactions.
- **The Protocol**: Every email task has a unique deterministic identifier (`idempotency_key` based on `campaignId`, `leadId`, and `scheduledFor`). Before Ethereal SMTP is invoked, a PostgreSQL transaction locks the `EmailJob` row. If the state is already `SENT` or `SENDING`, the worker aborts.
- **The Failure Window**: If the worker successfully sends the email via SMTP, but the Node process crashes *before* the PostgreSQL transaction can commit the `SENT` status, the job will be retried by BullMQ upon worker restart. This will result in a duplicate email send.
- **Mitigation**: We acknowledge this failure window honestly. We minimize it by keeping the post-SMTP database acknowledgement as fast and minimal as possible. Retries are safe at the application level because they will be caught by the DB lock *unless* the crash occurred exactly in that microscopic window.

### 3.3. Job Persistence and Restart Safety
BullMQ stores job definitions in Redis Sorted Sets. 
- **Restart Survival**: Since Node.js application memory is not used for scheduling (NO CRON jobs), if the app restarts, Redis retains the delayed jobs. When workers boot up, they seamlessly resume pulling from Redis.
- **Worker Safety**: BullMQ uses atomic Lua scripts to pop jobs from Redis. If multiple instances/workers run concurrently, Redis guarantees a specific job is handed to exactly one worker at a time.

### 3.4. Transaction Boundaries
- **Start**: Worker picks up job. Begins PG Transaction.
- **Lock**: `SELECT ... FOR UPDATE` on `EmailJob`.
- **Update**: Set status to `SENDING`. Commit transaction.
- **Action**: Execute Ethereal SMTP send.
- **End**: Begin PG Transaction. Update status to `SENT` (or `FAILED` on error). Commit. 

### 3.5. Behavior for 1000+ Simultaneous Scheduled Emails
When a user uploads a CSV with 1000 leads and schedules them instantly:
1. The API creates 1000 `EmailJob` records in PostgreSQL (`status: PENDING`).
2. The API enqueues 1000 jobs to BullMQ.
3. BullMQ buffers them in Redis. 
4. Workers pull jobs at the rate defined by the configurable `concurrency` setting and the minimum delay settings. This prevents memory spikes and SMTP rate limit blocks.

### 3.6. Elasticsearch Consistency
When an email transitions to `SCHEDULED` or `SENT`, it must be searchable.
- **Dual Write with BullMQ**: To ensure consistency without complex Logstash setups, when an `EmailJob` is created/updated, a lightweight `SyncElasticsearch` job is dispatched to BullMQ. 
- **Failure Handling**: If the ES index fails, BullMQ retries it automatically, ensuring eventual consistency.

### 3.7. SMTP Failure Semantics
If Ethereal SMTP fails (e.g., connection timeout, 5xx error):
- The error is caught by the worker.
- The `EmailJob` is marked `FAILED` in PG (with error logs).
- BullMQ's automatic retry mechanism (with exponential backoff) re-queues the job.
- The worker executes the idempotency check on retry and attempts sending again.
