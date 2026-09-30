# Test Plan

## 1. Unit Tests
- **Template Rendering**: Verify template string replacement (e.g., `{{firstName}}` replacing variables accurately).
- **Time/Delay Calculations**: Verify algorithm for staggering job delays and calculating time to next hour.
- **Idempotency Logic**: Mock PG transactions to ensure `status` prevents duplicate processing.

## 2. Integration Tests
- **Queue Enqueueing**: Test that uploading a CSV successfully writes to PostgreSQL and adds EXACTLY *N* jobs to BullMQ.
- **Rate Limit Trigger**:
  1. Mock Redis.
  2. Set rate limit to 5.
  3. Execute worker processing 6 times.
  4. Assert 5 successful sends, 1 job moved to delayed state.
  5. Assert Slack Notification is fired exactly once.
- **Elasticsearch Sync**: Ensure the `SyncElasticsearch` job accurately indexes document structures matching the mapping.

## 3. End-to-End (E2E) Verification
- **Application Boot**: Ensure the app successfully connects to PG, Redis, and ES.
- **Idempotent Retries**: Intentionally throw a simulated network error during Ethereal SMTP dispatch. Verify the job goes to `FAILED` and upon BullMQ retry, eventually resolves to `SENT` without dual dispatch.
- **Dashboard Visibility**: Ensure queued jobs appear in `/admin/queues`.
