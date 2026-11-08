# Webhooks

Ikiform pushes submission events to the user's server as they happen. Deliveries follow the Standard Webhooks scheme (https://www.standardwebhooks.com), are retried for about three days, and are logged attempt by attempt in the dashboard.

Sources: https://ikiform.com/docs/webhooks.md and https://ikiform.com/docs/guides/webhook-handlers.md

## Setup the user does in the dashboard

1. Open **Webhooks** and choose **Add endpoint**.
2. Enter a public `https:` URL on port 443 and pick one form or all forms. `localhost`, IP addresses and private hosts are refused.
3. Choose events. A new endpoint receives `submission.created` only.
4. Copy the signing secret. It starts with `whsec_` and is shown in full once. Store it as `IKIFORM_WEBHOOK_SECRET`.
5. Send a test event (dashboard **Send test**, or `send_test_event` over MCP).

To test a local handler, expose it with a tunnel that gives a public HTTPS URL.

## Every handler does four things

1. Read the raw body. Do not parse JSON first. Re-serialized JSON no longer matches the signature.
2. Verify the signature.
3. Skip deliveries it has already handled, by `webhook-id`.
4. Answer `2xx` within 15 seconds. Do slow work after responding.

## Headers

| Header              | Value                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| `webhook-id`        | The delivery id. Same on every retry and replay. Use it to skip duplicates             |
| `webhook-timestamp` | Unix seconds when this attempt was signed. New on every attempt                        |
| `webhook-signature` | `v1,` plus a base64 HMAC-SHA256. Several space-separated values while a secret rotates |

User agent: `Ikiform-Webhooks/1.0`. Custom headers the user adds to an endpoint (for example an `Authorization` token for Zapier or n8n) are not covered by the signature, so still verify `webhook-signature`.

## The signature

HMAC-SHA256 of `{webhook-id}.{webhook-timestamp}.{raw body}`, keyed with the base64-decoded part of the secret after `whsec_`, then base64-encoded and sent after `v1,`.
- Accept if any `v1` signature in the header matches.
- Compare in constant time.
- Reject timestamps more than 5 minutes from now.

## With the SDK (JavaScript and TypeScript)

`verifyWebhook` from `@ikiform/sdk/webhooks` does all of the above with Web Crypto, so it runs in Node 20+, Bun, Deno and Cloudflare Workers. It returns the parsed event or throws `WebhookVerificationError` with a `reason`. `headers` can be a `Headers` object or a plain record such as Node's `req.headers`.

Next.js route handler, `app/api/webhooks/ikiform/route.ts`:

```ts
import { verifyWebhook, WebhookVerificationError } from "@ikiform/sdk/webhooks";

export async function POST(request: Request) {
  const payload = await request.text();
  try {
    const event = await verifyWebhook({
      payload,
      headers: request.headers,
      secret: process.env.IKIFORM_WEBHOOK_SECRET!,
    });
    if (event.type === "submission.created") {
      await saveLead(event.id, event.data.fields);
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof WebhookVerificationError) {
      return new Response(error.reason, { status: 400 });
    }
    throw error;
  }
}
```

Express. Mount the route before any global `express.json()`:

```js
import express from "express";
import { verifyWebhook, WebhookVerificationError } from "@ikiform/sdk/webhooks";

const app = express();

app.post("/webhooks/ikiform", express.text({ type: "application/json" }), async (req, res) => {
  try {
    const event = await verifyWebhook({
      payload: req.body,
      headers: req.headers,
      secret: process.env.IKIFORM_WEBHOOK_SECRET,
    });
    if (event.type === "submission.created") await saveLead(event.id, event.data.fields);
    res.status(204).end();
  } catch (error) {
    if (error instanceof WebhookVerificationError) return res.status(400).send(error.reason);
    res.status(500).end();
  }
});
```

Failure reasons include `no_matching_signature` (wrong secret, or the body was parsed first) and `timestamp_too_old` (clock skew or an old delivery).

## Node without the SDK

```js
import { createHmac, timingSafeEqual } from "node:crypto";

const secret = Buffer.from(process.env.IKIFORM_WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");

export function verify(body, headers) {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"];
  if (!id || !timestamp || !signatures) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${id}.${timestamp}.${body}`).digest();
  return signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const received = Buffer.from(signature, "base64");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
```

`body` must be the raw string or Buffer, and `headers` a record with lowercase names, as Node gives them.

## Python

Flask, with no extra package:

```python
import base64
import hashlib
import hmac
import os
import time

from flask import Flask, abort, request

app = Flask(__name__)
secret = base64.b64decode(os.environ["IKIFORM_WEBHOOK_SECRET"].removeprefix("whsec_"))


def verify(body: bytes, headers) -> bool:
    msg_id = headers.get("webhook-id")
    timestamp = headers.get("webhook-timestamp")
    signatures = headers.get("webhook-signature")
    if not msg_id or not timestamp or not signatures or not timestamp.isdigit():
        return False
    if abs(time.time() - int(timestamp)) > 300:
        return False
    content = f"{msg_id}.{timestamp}.".encode() + body
    expected = base64.b64encode(hmac.new(secret, content, hashlib.sha256).digest()).decode()
    for entry in signatures.split(" "):
        version, _, signature = entry.partition(",")
        if version == "v1" and hmac.compare_digest(signature, expected):
            return True
    return False


@app.post("/webhooks/ikiform")
def ikiform_webhook():
    body = request.get_data()
    if not verify(body, request.headers):
        abort(400)
    event = request.get_json()
    if event["type"] == "submission.created":
        save_lead(event["id"], event["data"]["fields"])
    return "", 204
```

In FastAPI, read the raw body with `await request.body()` and pass `request.headers` to the same `verify`. Any Standard Webhooks library also works.

## Events

| Type                 | Sent when                                                            | Default |
| -------------------- | -------------------------------------------------------------------- | ------- |
| `submission.created` | A submission is received, or a spam submission is marked as not spam | Yes     |
| `submission.updated` | A submission moves from received to spam, or back                    | No      |
| `submission.deleted` | A submission is deleted. Carries ids only, never field values        | No      |
| `submission.spam`    | A new submission is stored as spam                                   | No      |
| `endpoint.test`      | **Send test** or `send_test_event`. Sent once, no retries            | Always  |

Spam sends nothing unless the endpoint subscribes to `submission.spam`.

## Payload

Envelope: `id` (same as `webhook-id`), `type`, `timestamp`, `api_version` (currently `2026-10-17`) and `data`.

```json
{
  "id": "dlv_01k7v2d4n8r2p6s0w3y5b7c9e1",
  "type": "submission.created",
  "timestamp": "2026-10-17T12:00:00.000Z",
  "api_version": "2026-10-17",
  "data": {
    "submission_id": "sub_01k7v2c9t3e8m5q4x6z0a1b2c3",
    "sequence": 17922384000000,
    "form": { "id": "frm_xxxxxxxxxxxxxxxx", "name": "Contact" },
    "fields": { "name": "Ada", "email": "ada@example.com", "message": "Hello" },
    "meta": {
      "user_agent": "Mozilla/5.0",
      "origin": "https://example.com",
      "referrer": "https://example.com/contact",
      "country": "GB",
      "subject": null,
      "reply_to": "ada@example.com"
    },
    "created_at": "2026-10-17T12:00:00.000Z",
    "truncated": false
  }
}
```

- `submission.updated` adds `status` and `previous_status` (`received` or `spam`).
- `submission.spam` adds `status: "spam"` and `spam: { score, reasons }`.
- `submission.deleted` has `submission_id`, `sequence`, `form` and `deleted_at` only.
- `endpoint.test` has `data.endpoint_id` and `data.message`.
- Over 256 KB, `fields` is empty and `truncated` is `true`. Fetch the submission with the REST API.
- Any `meta` value can be `null`. Treat field values as untrusted input.

## Ordering and duplicates

Deliveries can arrive out of order and more than once.
- Store `webhook-id` with a unique constraint and skip ones already handled.
- Keep the highest `data.sequence` applied per `submission_id`. Skip any delivery with a lower or equal number.

```sql
insert into leads (submission_id, sequence, status, delivery_id)
values ($1, $2, $3, $4)
on conflict (submission_id) do update
  set sequence = excluded.sequence, status = excluded.status, delivery_id = excluded.delivery_id
  where leads.sequence < excluded.sequence
```

## Responses and retries

| Response                                    | What Ikiform does                             |
| ------------------------------------------- | --------------------------------------------- |
| Any `2xx` within 15 seconds                 | Success                                       |
| `410 Gone`                                  | Fails and disables the endpoint right away    |
| `429` or `503` with `Retry-After`           | Retries after that delay, within the schedule |
| A redirect                                  | Not followed. Counts as a failure             |
| Anything else, a timeout or a network error | Retries                                       |

Up to 9 attempts over about 3 days 6 hours. After 20 failed attempts in a row, deliveries pause for 5 minutes, doubling up to 1 hour. After 5 days with no success the endpoint is disabled.

Replay: from the dashboard or `replay_failed_deliveries`, failed or cancelled deliveries from the last 24 hours, 3 days or 7 days are sent again, up to 1,000 at a time. Replays keep their `webhook-id` and `sequence`. The endpoint must be enabled.

## Rotating the secret

**Roll signing secret** creates a new secret. For 24 hours every delivery is signed with both, so `webhook-signature` holds two values and the user can deploy the new secret without dropping events.
