---

name: ikiform
description: Connect any HTML, framework or server form to Ikiform, the hosted form backend at https://ikiform.com/f/<formId>, verify Ikiform webhook signatures (Standard Webhooks), and read or triage submissions and webhook deliveries with the Ikiform MCP server. Use when the user wants a backend for a contact, waitlist, signup or feedback form on a static site or app without building a server route, wants to wire an existing form to Ikiform, mentions Ikiform, a frm_ form id, an ik_sk_ key or a whsec_ secret, needs to verify an Ikiform webhook, or asks to list, check, mark as spam, delete or replay Ikiform submissions and deliveries.
license: MIT
---

# Ikiform

Ikiform is the backend for any form. A form posts to one endpoint, `https://ikiform.com/f/<formId>`. Ikiform validates the post, blocks spam, stores it, emails the owner and sends signed webhooks. The user keeps their own markup and CSS.

Use this skill to:
- add a form backend to a site or app,
- connect a form that already exists in the project,
- post submissions from a server, script or integration,
- verify Ikiform webhooks in the user's backend,
- read and triage submissions and webhook deliveries through the Ikiform MCP server.

## Rules

- Ikiform is the form backend, so do not build a server route to receive the form. Post straight to the Ikiform endpoint.
- Every form needs a real form id (`frm_...`). Never invent one. Get it from the MCP server (`list_forms`, `get_form` or `create_form`) or ask the user for it from https://ikiform.com/dashboard.
- If the id is not known yet, use the placeholder `frm_xxxxxxxxxxxxxxxx` and ask the user for the real id.
- Never put a secret key (`ik_sk_...`) in browser code, a mobile app or a public repository. Secret keys belong in server environment variables only.
- Never fill the honeypot field and never make it visible.

## Connect a form

When the MCP server is connected, call `get_form` with the form id first. It returns the endpoint, field names, honeypot field, allowed domains, redirect URL, ready-to-paste snippets and `setup_instructions` written for that exact form. Follow `setup_instructions` when you have them. The steps below are the same instructions for when you don't.

Endpoint: `POST https://ikiform.com/f/<formId>`. It accepts `application/x-www-form-urlencoded`, `multipart/form-data` (no file uploads) or JSON.

### 1. Detect the stack

- Static HTML: set `<form action="https://ikiform.com/f/<formId>" method="POST">`. The browser follows the redirect after submit. See [references/html.md](references/html.md).
- JS app (React, Vue, Svelte, Next, Astro and so on): on submit, `fetch` the endpoint with method `POST`, headers `{ Accept: "application/json" }` and body `new FormData(form)`. Success is `201 { ok: true, id }`. Failure is `{ ok: false, error: { code, message, fields } }`. Show both states. See [references/javascript.md](references/javascript.md).
- Server code, cron jobs and integrations: post with a secret key. See [references/server.md](references/server.md).

### 2. Fields

Keep the field names the form already uses. If `get_form` returned fields, use exactly those names (the `name` attribute or JSON key). Names starting with `_` are reserved and not stored.

Reserved names you may use:

| Field                   | Effect                                                                          |
| ----------------------- | ------------------------------------------------------------------------------- |
| `_gotcha`               | Default honeypot. The name can be changed per form.                             |
| `_redirect`, `_next`    | Thank-you page after an HTML post. See step 4.                                  |
| `_subject`              | A label stored as `meta.subject`, up to 200 characters.                         |
| `_replyto`              | Reply-to address for notification emails. Ignored unless it is one valid email. |
| `_idempotency`          | Idempotency key, same as the `Idempotency-Key` header.                          |
| `cf-turnstile-response` | Turnstile token, added by the widget or the SDK.                                |

Any other name starting with `_` is dropped, so `_source` and similar work as private markers.

### 3. Spam honeypot

Add this inside the form. Use the form's `honeypot_field` from `get_form` if it is not `_gotcha`:

```html
<input type="text" name="_gotcha" tabindex="-1" autocomplete="off" hidden />
```

In JSX write `tabIndex={-1}` and `autoComplete="off"`. Keep it hidden from people and never fill it. A filled honeypot marks the submission as spam.

Human check, only when the form has one:
- Spam check set to **Ikiform**: HTML posts pass it automatically. With `fetch`, add a `cf-turnstile-response` field set to `await challenge("<formId>")` from the `@ikiform/sdk` package. Tokens are single use, so call it once per submit.
- Spam check set to **your own Turnstile keys**: render the Cloudflare Turnstile widget inside the form so it posts `cf-turnstile-response`.

### 4. Thank-you page

- If the form has a redirect URL set in the dashboard, the form redirects there after an HTML post. Do not add `_redirect`.
- Otherwise it is optional and works for HTML posts only: add a hidden `_redirect` input with an absolute `https` URL. Its host must be one of the form's allowed domains or a subdomain of one, with no port. A form with no allowed domains ignores `_redirect`. When it is ignored, Ikiform shows its own thank-you page.
- JSON and `fetch` requests ignore redirects and get `201` with the submission id.

If the form has allowed domains, posts from other sites, localhost included, are flagged as spam or refused. Ask the user to add `localhost` to allowed domains while testing.

### 5. Verify

Run the site locally and submit once. On a workspace without a plan, submissions from localhost are free tests (50 a month). Then check the submission at https://ikiform.com/dashboard, or with `list_submissions` over MCP.

A post that scores as spam still gets `201` or the normal redirect. If a test submission is missing, look under the spam filter.

More detail: https://ikiform.com/llms.txt and https://ikiform.com/docs.md. Any docs page is markdown when you append `.md`.

## Verify webhooks

Ikiform signs every webhook with [Standard Webhooks](https://www.standardwebhooks.com): HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}`, keyed with the base64-decoded part of the `whsec_` secret.
- Read the raw body before any JSON parsing. Re-serialized JSON no longer matches.
- Accept if any space-separated `v1,<signature>` in `webhook-signature` matches. Compare in constant time.
- Reject timestamps more than 5 minutes from now.
- Use `webhook-id` to skip duplicates and `data.sequence` to apply events for one submission in order.
- Answer `2xx` within 15 seconds and do slow work afterwards.

In JavaScript and TypeScript, use `verifyWebhook` from `@ikiform/sdk/webhooks`. Node without the SDK, Python, events and payloads are in [references/webhooks.md](references/webhooks.md).

## Use the MCP server

The Ikiform MCP server is at `https://ikiform.com/mcp` (Streamable HTTP, stateless, POST only). It authenticates with `Authorization: Bearer ik_sk_...`, a secret key the user creates at https://ikiform.com/dashboard/api-keys with the scopes below. All data belongs to that key's workspace.

| Tool                       | Scope               | Use                                                                                                                  |
| -------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `list_forms`               | `forms:read`        | Forms with id, name, status, submission count and endpoint                                                           |
| `get_form`                 | `forms:read`        | One form with fields, honeypot, allowed domains, redirect URL, snippets and `setup_instructions`                     |
| `create_form`              | `forms:write`       | New form from a name. Fields are learned from what the form posts                                                    |
| `update_form`              | `forms:write`       | Change name, status (pause or resume), allowed domains, redirect URL, spam check, rate limits or email notifications |
| `set_form_fields`          | `forms:write`       | Publish or remove the form's field schema                                                                            |
| `delete_form`              | `forms:write`       | Delete a form. Destructive                                                                                           |
| `list_submissions`         | `submissions:read`  | Filter by `form_id`, `status` (`received` or `spam`) and `since`                                                     |
| `get_submission`           | `submissions:read`  | One submission with fields, metadata, status and spam score                                                          |
| `mark_spam`                | `submissions:write` | Move a submission to spam                                                                                            |
| `mark_not_spam`            | `submissions:write` | Restore a spam submission to received                                                                                |
| `delete_submission`        | `submissions:write` | Permanently delete a submission. Destructive                                                                         |
| `list_webhook_endpoints`   | `webhooks:read`     | Endpoints with URL, status, events and failure state                                                                 |
| `create_webhook_endpoint`  | `webhooks:write`    | Add an endpoint. Returns the signing secret once                                                                     |
| `update_webhook_endpoint`  | `webhooks:write`    | Change URL, form, events or headers, or disable and enable it                                                        |
| `roll_webhook_secret`      | `webhooks:write`    | New signing secret. The old one works for 24 hours                                                                   |
| `delete_webhook_endpoint`  | `webhooks:write`    | Delete an endpoint. Destructive                                                                                      |
| `list_deliveries`          | `webhooks:read`     | Recent deliveries to one endpoint, to debug a failing webhook                                                        |
| `send_test_event`          | `webhooks:write`    | Queue a signed test event to an active endpoint                                                                      |
| `replay_failed_deliveries` | `webhooks:write`    | Re-send failed or cancelled deliveries from `24h`, `3d` or `7d`                                                      |

The server also offers the prompt `connect_form`, which takes an optional `form_id` and returns the setup instructions.

How to use it well:
- To wire a form, call `get_form` and use its endpoint, field names and `setup_instructions`. Use `list_forms` to find the id, or `create_form` when the user's form has no Ikiform form yet.
- Confirm with the user before `delete_submission`, `delete_form` and `delete_webhook_endpoint`. They cannot be undone.
- Never write a webhook secret or Turnstile secret into code. Give it to the user to store as an environment variable.
- Confirm with the user before `replay_failed_deliveries`. It re-sends events to their server. When the result has `more: true`, call it again for the rest.
- Say what will change before `update_form`, `set_form_fields`, `mark_spam` and `mark_not_spam`. Marking spam or not spam triggers webhooks, and a field schema rejects posts that don't match.
- After `send_test_event`, wait a few seconds and check with `list_deliveries`.
- Lists return up to 25 items by default, 100 at most. Pass `next_cursor` as `cursor` for the next page.
- A `forbidden` error that names a missing scope means the key lacks it. Ask the user to create a secret key with that scope at https://ikiform.com/dashboard/api-keys. Do not retry.

More in [references/mcp.md](references/mcp.md).

## Common errors

Every error has the same envelope: `{ ok: false, error: { code, message, fields? }, request_id }`. Branch on `error.code`, not the message.

| Status and code           | Cause                                                                                                                            | Fix                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `402 plan_required`       | The workspace has no active plan and the post came from a live site, a server or curl. It is held for 30 days, up to 100 a month | The user picks a plan or buys a submission pack. Held submissions then arrive                            |
| `402 test_limit_reached`  | No plan and 50 localhost tests already used this month                                                                           | The user picks a plan, or waits for next month                                                           |
| `403 challenge_required`  | The form uses the Ikiform human check and a JSON post had no token                                                               | Call `challenge(formId)` from `@ikiform/sdk` and send the token, or post from a server with a secret key |
| `403 captcha_failed`      | Turnstile token missing, expired, reused or invalid                                                                              | Get a fresh token for every submit                                                                       |
| `403 origin_not_allowed`  | Post from a site outside allowed domains on a form set to reject, or a publishable key used off its domains                      | Add the site to allowed domains. Server posts use a secret key                                           |
| `403 forbidden`           | Key is malformed, from another workspace, or lacks the scope                                                                     | Use a secret key from this workspace with the named scope                                                |
| `404 not_found`           | Wrong or deleted form id, or a `GET` to `/f/<formId>`                                                                            | Copy the endpoint from the dashboard and POST to it                                                      |
| `422 validation_failed`   | Fields failed validation                                                                                                         | Show `error.fields[name][0]` next to each field                                                          |
| `422 files_not_supported` | The post contains a file                                                                                                         | Remove file inputs, or upload elsewhere and send a link                                                  |
| `429 rate_limited`        | Over a rate limit. Standard is 5 posts a minute and 3 in 10 seconds per IP and form                                              | Wait `Retry-After` seconds. For tests or server posts, the user can switch the form to Relaxed or Custom |
| `429 quota_exceeded`      | The workspace received twice its monthly limit                                                                                   | The user upgrades or waits for next month                                                                |

Origin problems without an error: when allowed domains are set and the form is on **Mark as spam**, posts from other origins are stored as spam with the reason `origin_mismatch`. Add every domain the form runs on, including `www`, staging, preview and `localhost` while testing.

Full list with fixes: [references/errors.md](references/errors.md).

## References

- [references/html.md](references/html.md): plain HTML and static sites, redirects, arrays, honeypot, Turnstile.
- [references/javascript.md](references/javascript.md): `fetch` and the SDK in React, Next.js, Vue, Svelte, Astro and plain JS.
- [references/server.md](references/server.md): posting from a server with a secret key, idempotency and retries.
- [references/webhooks.md](references/webhooks.md): events, payloads, verification in Node and Python, ordering and retries.
- [references/mcp.md](references/mcp.md): MCP tools, inputs, scopes and workflows.
- [references/errors.md](references/errors.md): every error code, limits and troubleshooting.
