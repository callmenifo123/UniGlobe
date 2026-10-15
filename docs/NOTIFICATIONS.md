# Order notification transports

Orders are persisted before notifications or WhatsApp. Every distinct channel/destination receives its own durable D1 outbox job, including the customer email when supplied and email is enabled. Notification failures never remove an order.

## Native Cloudflare email

The application implements the `SendEmail.send(EmailMessageBuilder)` contract in the installed Cloudflare Workers types. Add a **separate website binding** named `ORDER_EMAIL` only after inspecting the account's sending capability and confirming its sender/recipient restrictions. A Wrangler binding example is:

```jsonc
"send_email": [{
  "name": "ORDER_EMAIL",
  "allowed_sender_addresses": ["YOUR_VERIFIED_WEBSITE_SENDER"]
}]
```

Replace the placeholder with the approved sender, then set the same address in Admin → Ordering & notifications. The native binding takes precedence when present. The application supplies plain-text Unicode receipts, sanitized subjects and a stable Message-ID derived from the outbox job. Message-ID helps tracing; it is not an exactly-once delivery guarantee.

The code and mocked binding tests are complete. Account entitlement, the current production binding contract, arbitrary customer-receipt support, verified sender and actual delivery require live account access. A restricted Email Routing binding that can send only to verified destinations is **not sufficient for arbitrary customer receipts**. Do not change existing Mail routing or mail-related DNS to work around that restriction. No email binding is activated in the checked-in local configuration.

## Optional HTTPS transport

If the account's approved sending service uses an HTTPS adapter, configure `EMAIL_API_URL` and `EMAIL_API_TOKEN` as server-only secrets. The contract is:

```http
POST /your-approved-send-endpoint
Authorization: Bearer <server secret>
Content-Type: application/json
Idempotency-Key: <stable outbox job ID>
```

```json
{
  "from": "verified-sender@example.test",
  "to": ["recipient@example.test"],
  "subject": "Order received · UGF-1042",
  "text": "Complete plain-text receipt"
}
```

Any successful 2xx response acknowledges acceptance; other responses are retried. The adapter must honor the idempotency key and report provider acceptance truthfully. HTTPS is mandatory; redirects are rejected so credentials cannot follow an unexpected redirect. No subscription or third-party provider is purchased or enabled by this implementation.

## Telegram

Set `TELEGRAM_BOT_TOKEN` through Worker secrets. Set one or more chat IDs and enable notifications in Admin. The bot must be added to the chosen group/channel with permission to send, or the intended user must start the bot. The token never appears in settings, HTML or logs.

Messages use plain text, disable link previews and split below Telegram's size limit without splitting Unicode surrogate pairs. Acknowledged chunks are checkpointed and skipped on retry. Telegram's `retry_after` is honored. If Telegram accepts a message but the connection fails before acknowledgement or its database checkpoint, that chunk can still be repeated: Telegram has no request idempotency primitive.

## Delivery lifecycle

- Order creation and all initial outbox jobs share an atomic D1 transaction.
- The first send is scheduled with `waitUntil`; the five-minute Worker cron resumes outstanding jobs.
- Each invocation processes up to 20 jobs with four concurrent runners and a bounded time budget. Long Telegram messages continue during subsequent invocations.
- An atomic lease prevents simultaneous workers from claiming the same job. Updates are fenced by lease and attempt number.
- Message text/subject/sender are snapshotted on first delivery, so template edits cannot change a partly sent message.
- Each failed attempt uses exponential backoff, up to five attempts. An expired lease on the fifth attempt becomes a visible failure instead of remaining stuck.
- Admin → Orders → order detail shows delivery state and allows a failed job to be retried. A manual retry retains its message snapshot and acknowledged Telegram progress.
- Customer email and company receipts contain the complete order, delivery address, total and customer notes. Internal admin notes are excluded.

## Local verification and live activation

`npm test` uses isolated D1 storage and mocks both the native binding and external HTTP transports, including failure, concurrent claims, final-attempt recovery, Telegram partial delivery and rate limits. Browser tests do not send live messages.

Locally, Wrangler does not trigger cron automatically. To exercise a configured local outbox explicitly:

```sh
curl http://localhost:8787/cdn-cgi/local/scheduled
```

Only configure real transport credentials when you intend to send real notifications. For production, verify the sender and company/customer destinations with controlled orders before opening general ordering. Confirm the cron, logs, delivery statuses and retries. Existing UniGlobe Mail resources must remain unchanged.
