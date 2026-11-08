# Errors, limits and troubleshooting

Sources: https://ikiform.com/docs/errors.md, https://ikiform.com/docs/limits.md and https://ikiform.com/docs/troubleshooting.md

## The envelope

```json
{
  "ok": false,
  "error": { "code": "rate_limited", "message": "Too many requests. Please slow down." },
  "request_id": "req_..."
}
```

- `error.code` is stable. Branch on it. `error.message` is plain English and may change.
- `error.fields` appears on validation errors, keyed by field name, each a list of messages. Whole-body errors use the key `_form`.
- `error.challenge_url` appears on `challenge_required`.
- `request_id` matches the `X-Request-Id` header on every response. Quote it when asking for support.
- Browser form posts get a hosted error page with the same message and status instead of JSON.

## Codes

| Status | Code                      | Cause                                                                                                                         | Fix                                                                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_body`            | Malformed JSON or multipart, a JSON array instead of an object, or an idempotency key over 255 characters                     | Send one JSON object, or let `FormData` build the body                                                                       |
| 400    | `invalid_request`         | A REST API query or body field is invalid                                                                                     | Fix the named parameter                                                                                                      |
| 401    | `unauthorized`            | No `Authorization` header, not a Bearer token, or an unknown, revoked or expired key (REST API and MCP)                       | Send `Authorization: Bearer ik_sk_...` with a live secret key                                                                |
| 402    | `plan_required`           | The workspace has no plan and the post came from a live site, a server or curl. Saved and held for 30 days, up to 100 a month | The user picks a plan or buys a submission pack. Held submissions then arrive with their webhooks and emails                 |
| 402    | `test_limit_reached`      | No plan, and 50 localhost tests were already used this month                                                                  | The user picks a plan, or waits for next month                                                                               |
| 403    | `forbidden`               | Key is malformed, from another workspace, publishable on the REST API, or missing the scope                                   | Use a secret key from this workspace with the scope named in the message                                                     |
| 403    | `origin_not_allowed`      | Post from outside allowed domains on a form set to **Reject**, or a publishable key used off its domains                      | Add the site to allowed domains or to the key's domains. Server posts use a secret key                                       |
| 403    | `form_paused`             | The form is paused                                                                                                            | The user resumes it in the dashboard                                                                                         |
| 403    | `captcha_failed`          | Turnstile token missing, expired (300 seconds), reused or invalid                                                             | Get a fresh token for every submit. With own keys, check the site key matches the secret                                     |
| 403    | `challenge_required`      | The form uses the Ikiform human check and a JSON post had no token                                                            | Browser: `challenge(formId)` from `@ikiform/sdk` before each submit. Server: send a secret key. Or use `error.challenge_url` |
| 404    | `not_found`               | Wrong, deleted or disabled form id, or a `GET` to `/f/<formId>`                                                               | Copy the endpoint from the dashboard or `get_form`, and POST to it                                                           |
| 405    | `method_not_allowed`      | A browser called the REST API, which is server to server only                                                                 | Call `/api/v1` from a backend                                                                                                |
| 409    | `conflict`                | Test event or replay on a disabled webhook endpoint                                                                           | Enable the endpoint in the dashboard first                                                                                   |
| 409    | `idempotency_in_progress` | The same idempotency key is still being processed                                                                             | Wait and retry with the same key                                                                                             |
| 413    | `payload_too_large`       | Body over 256 KB, over 100 fields, a name over 128 characters or a value over 16 KB                                           | Split long text, or send a link instead of the content                                                                       |
| 415    | `unsupported_media_type`  | `Content-Type` missing or not urlencoded, multipart or JSON                                                                   | Set `Content-Type: application/json` when posting JSON                                                                       |
| 415    | `unsupported_charset`     | Body is not UTF-8                                                                                                             | Encode as UTF-8. Add `accept-charset="utf-8"` to old HTML forms                                                              |
| 422    | `validation_failed`       | Fields failed the form's rules                                                                                                | Show `error.fields` next to each field                                                                                       |
| 422    | `files_not_supported`     | The post contains a file                                                                                                      | Remove file inputs, or upload elsewhere and submit the link                                                                  |
| 422    | `too_deep`                | JSON nested more than 3 levels, counting the top object                                                                       | Flatten, for example `{ "address_city": "London" }`                                                                          |
| 422    | `idempotency_mismatch`    | Key reused within 24 hours with different fields                                                                              | Use a new key for new data                                                                                                   |
| 429    | `rate_limited`            | Over a rate limit                                                                                                             | Wait `Retry-After` seconds                                                                                                   |
| 429    | `quota_exceeded`          | The workspace received twice its monthly limit this month                                                                     | The user upgrades, or waits for next month                                                                                   |
| 500    | `server_error`            | Something failed on Ikiform's side                                                                                            | Retry with backoff and an idempotency key. Quote `request_id` if it persists                                                 |

## Not errors

- Spam gets the same `201` or redirect as a real submission. Look under the spam filter in the dashboard, or `list_submissions { status: "spam" }`.
- A `_redirect` that is not allowed is ignored, and the browser lands on the hosted thank-you page.
- A `_replyto` that is not one valid email is ignored.

## Testing without a plan

Where a post comes from is read from `Origin`, or `Referer` when there is no `Origin`.

| Post from                                                               | Answer                                                                                    | Webhooks and emails                       |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------- |
| `localhost`, `127.0.0.1`, `[::1]`, `*.localhost` or `*.local`, any port | `201` or the redirect for the first 50 each month, then `402 test_limit_reached`          | Sent                                      |
| Any other site, a server or curl                                        | `402 plan_required`, saying the submission was saved. Held for 30 days, up to 100 a month | Not sent until the workspace picks a plan |

Local tests don't count toward monthly usage. A workspace with submission pack credits is live, not in test mode.

## Rate limits

| Applies to                            | Limit                                                     |
| ------------------------------------- | --------------------------------------------------------- |
| One form from one IP, Standard preset | 5 a minute and 3 in 10 seconds                            |
| One form from one IP, other presets   | Relaxed 20 a minute, Strict 2 every 10 minutes, or Custom |
| Any form from one IP                  | 30 a minute                                               |
| One form in total                     | 300 a minute, or a Custom cap of 1 to 10,000              |
| `GET /f/<formId>/schema`              | 60 a minute per IP and form                               |
| REST API                              | 100 requests per 60 seconds per key                       |

Testing by hand? Switch a test form to Relaxed. Posting from a server for every visitor? All posts share the server's IP, so post from the browser or choose Relaxed or Custom.

## Allowed domains and origin problems

With allowed domains set, a post must come from one of them or a subdomain. Otherwise:
- **Mark as spam** (the default): stored as spam with the reason `origin_mismatch`, and the visitor still sees success.
- **Reject**: `403 origin_not_allowed`.

Fixes: add every domain the form is served from, including `www`, staging and preview domains, and `localhost` while developing. Server posts carry no `Origin`, so send a secret key, which skips the check.

## CORS errors in the browser

The submission endpoint allows every origin, so a CORS error usually means the request went somewhere else:
- The URL is not exactly `https://ikiform.com/f/<formId>` with the full `frm_` id and no trailing path.
- The code calls `/api/v1` from a browser. The REST API refuses browsers by design.
- An ad blocker or proxy blocked it. Try a private window.
- The site's own `Content-Security-Policy` blocks it. Add `https://ikiform.com` to `connect-src`, and to `form-action` for HTML posts.

Debug from a terminal with the same origin the site sends:

```bash
curl -i https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "Origin: https://example.com" \
  -d '{"email":"ada@example.com"}'
```

## 422 with Unknown field

The form has fields defined and the post sent a name not in the definition. `error.fields` names it.
- Add the field in the dashboard, or remove the input.
- Rename a private marker to start with `_`. Reserved names are dropped, not validated.
- Check the honeypot name matches the form's honeypot field.
- Field ids are lowercase snake_case. `firstName` is not `first_name`.

## Submissions don't show up

- Look under the spam filter.
- Check the form is not paused and the id in `action` matches the dashboard.
- A browser post that shows Ikiform's error page was rejected. The page lists the reason.
- Server status: https://status.ikiform.com
