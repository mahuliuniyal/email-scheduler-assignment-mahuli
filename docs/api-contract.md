# API Contract

## Authentication & OAuth Integrations
- `GET /api/auth/google` - Initiates Google OAuth flow.
- `GET /api/auth/google/callback` - Handles Google OAuth callback.
- `GET /api/auth/slack` - Initiates Slack OAuth flow.
- `GET /api/auth/slack/callback` - Handles Slack OAuth callback.

## Campaigns & Leads
- `GET /api/campaigns` - List user campaigns.
- `POST /api/campaigns` - Create a new campaign.
  - Body: `{ name, subjectTemplate, bodyTemplate, hourlyLimit, minDelaySeconds }`
- `GET /api/campaigns/:id` - Get campaign details.
- `POST /api/campaigns/:id/leads/upload` - Upload CSV of leads.
  - Form-data: `file` (CSV).
  - Triggers batch generation of `EmailJob`s and enqueueing to BullMQ.

## Monitoring & Search
- `GET /api/search/emails?q={query}` - Proxy to Elasticsearch to search emails by content, status, or recipient.
- `GET /admin/queues` - BullMQ Dashboard (HTML view via `bull-board`). Must be secured via middleware.

## Webhooks (Optional)
- `POST /api/webhooks/slack` - Listen to Slack events if interactive features are required.
