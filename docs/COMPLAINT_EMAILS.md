# Complainant workflow emails

## Implemented flow
A new submitted complaint queues an acknowledgement and bureau-routing email. Further emails cover initial scrutiny, DA assignment, notice issuance, investigation, institution response, evidence evaluation, pending sign-off, return for investigation, closure, clarification, escalation, SLA warning/breach, transfer and reopening. Draft saves do not send workflow messages.

Messages go to the active, verified complainant account that owns the complaint. Internal milestone events produce public-safe summaries; private officer remarks and report contents are never copied into complainant emails. Every message includes the complaint reference, stage, bureau, IST timestamp and authenticated case link. Status is read from current transactional state so assignments and draft submission do not show stale labels.

Outbox rows are inserted in the same transaction as the workflow event. An event/user idempotency key prevents duplicate queuing. Email has HTML and plain-text versions. Authentication mail has highest priority, followed by complainant updates, then officer mail.

## Delivery
Next.js `after()` starts a bounded delivery batch after successful POST responses and authenticated notification polling. Complaint submission does not wait for SMTP. A secure POST `/api/scheduler` also processes retries. Use an external scheduled trigger with `Authorization: Bearer <SCHEDULER_SECRET>` for retries when no one is browsing. Do not put the secret in a URL or source code.

Messages are leased one at a time, recovered after a 15-minute interrupted lease, retried with exponential backoff, and stopped after five attempts. A stable SMTP Message-ID is used. SMTP cannot guarantee exactly-once delivery if a server stops after provider acceptance but before the database write; the interrupted status explicitly records this uncertainty. Simulated messages are never automatically mass-sent after SMTP is enabled. An administrator can intentionally send an individual queued simulated message.

The administration page displays recent recipient/subject records, attempts, errors, simulated/queued/failed statuses and provider acceptance. No authentication tokens or email HTML are rendered in this log. "Accepted" does not guarantee inbox placement.

## Required private configuration
Set these in `.env.local` locally and the hosting provider's encrypted environment settings for deployment:

```dotenv
SMTP_HOST=<provider SMTP hostname>
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<provider SMTP username>
SMTP_PASSWORD=<provider SMTP credential>
SMTP_FROM=SAMADHAN Notification Bot <updates@your-verified-domain>
ALLOW_REAL_EMAIL=true
APP_URL=https://your-actual-website-domain
SCHEDULER_SECRET=<private random scheduler secret>
```

For implicit TLS on port 465, set `SMTP_PORT=465` and `SMTP_SECURE=true`. Port 587 requires STARTTLS. Use a sender domain/account authorized by your provider. Configure SPF/DKIM according to that provider. Never paste credentials into chat or commit `.env.local`. Restart the deployed service after changing environment values.

The local `.env.local` has missing configuration keys added without replacing existing values. Real email remains disabled until complete credentials are supplied. No real email was sent during implementation.

## Database
Migration `002-email-delivery.sql` adds plain-text body, delivery priority and lease fields. The database accessor refreshes migration state when reusing a development connection. The migration runs through the application's existing migration path on database access; no separate test or data import was performed.

## Delivery status at implementation
Local SMTP host, user, password and verified sender were missing. The code therefore uses the simulated outbox. Actual external delivery and hosted environment configuration are not confirmed. Testing, building and external test-email sending were not performed, as requested.
