# SLD Concierge Bot Backend

This service receives Telegram webhook updates and temporarily stores website audit summaries in Redis for multi-user handoff.

## Flow

1. The browser parses PDF/CSV files locally and calculates the audit.
2. Clicking **Ergebnis an Alfred senden** posts only calculated totals to `POST /api/audits` over HTTPS.
3. The service stores the audit under a random opaque ID in Redis with a 30-minute expiration and returns a short Telegram payload (`audit_<id>`).
4. The browser opens `https://t.me/SLDConciergeRobot?start=<payload>`.
5. Telegram delivers `/start audit_<id>`. The backend atomically consumes that one-time Redis key and replies with score-based recommendations.

Raw statements are never uploaded. Audit totals are retained temporarily for up to 30 minutes and are deleted when used.

## Railway setup

Repository: `Yourcryptopro/sld-cashflow-checker`

- Service Root Directory: `bot-backend`
- Add a Redis service to the Railway project (New → Database → Redis).
- In the bot service variables, add `REDIS_URL` referencing the Redis service's private connection variable. Railway reference syntax is usually `${{Redis.REDIS_URL}}`; choose the Redis service's `REDIS_URL` from the variable picker if the service has another name.
- Keep `TELEGRAM_BOT_TOKEN` set in Railway only.
- Set `CALL_BOOKING_URL` to the actual SLD booking page.
- Set `ALLOWED_ORIGIN` to the exact public origin where the website runs.
- `WEBHOOK_SECRET` is optional; if set, register the identical value with Telegram `setWebhook`.

After adding Redis and variables, deploy/redeploy the bot service. `GET /health` should report `"auditStore":"redis"`. If Redis is unavailable, the API returns 503 rather than silently storing audits in local memory.

## Test the complete flow

1. Open the deployed website and calculate an audit.
2. Click **Ergebnis an Alfred senden**.
3. Telegram should open with a short `audit_...` payload.
4. Alfred should reply with a score-based recommendation and the configured 1:1 Call button.

If the browser reports CORS, update `ALLOWED_ORIGIN` to the exact site origin in Railway, then redeploy.

## Score bands

- 75–100: growth and cash-flow levers; optional 1:1 discussion.
- 50–74: review subscriptions/contracts and build a reserve; offer a prioritization call.
- 0–49: stabilize cashflow first and recommend a timely team call.

Recommendations are educational prompts, not individualized investment, tax, legal, or debt advice.