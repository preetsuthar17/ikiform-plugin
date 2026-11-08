# The Ikiform MCP server

- URL: `https://ikiform.com/mcp`
- Transport: Streamable HTTP. Stateless, JSON-RPC over `POST` only.
- Auth: `Authorization: Bearer ik_sk_...`, a secret key from https://ikiform.com/dashboard/api-keys.
- Every tool works on the workspace that owns the key, and each tool needs one scope on the key.

## Scopes

| Scope               | Tools                                                                                                                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forms:read`        | `list_forms`, `get_form`, and `connect_form` with a `form_id`                                                                                                                                |
| `forms:write`       | `create_form`, `update_form`, `set_form_fields`, `delete_form`                                                                                                                               |
| `submissions:read`  | `list_submissions`, `get_submission`                                                                                                                                                         |
| `submissions:write` | `mark_spam`, `mark_not_spam`, `delete_submission`                                                                                                                                            |
| `webhooks:read`     | `list_webhook_endpoints`, `list_deliveries`                                                                                                                                                  |
| `webhooks:write`    | `create_webhook_endpoint` and `update_webhook_endpoint` (both also need `submissions:read`), `delete_webhook_endpoint`, `roll_webhook_secret`, `send_test_event`, `replay_failed_deliveries` |

Suggest the smallest set for the job. Wiring forms needs `forms:read`, plus `forms:write` to create forms. Read-only triage needs `submissions:read`. A tool called without its scope returns a `forbidden` error that names the missing scope. Ask the user for a new secret key with that scope rather than retrying.

## Tools

Ids look like `frm_...` (forms), `sub_...` (submissions), `whk_...` (webhook endpoints) and `dlv_...` (deliveries). Never invent one. Get it from a list tool or from the user.

### Forms

- `list_forms { limit?, cursor? }`: forms newest first, with `id`, `name`, `status`, `submission_count` and `endpoint`.
- `get_form { form_id }`: endpoint, `fields`, `honeypot_field`, `allowed_domains`, `redirect_url`, plus `snippets` (HTML, JavaScript and React) and `setup_instructions`. Call this before wiring a form in code.
- `create_form { name, allowed_domains?, redirect_url? }`: creates a form and returns its id and endpoint. Fields are learned from what the form posts, so only a name is needed. Use it when the user's form has no Ikiform form yet.
- `update_form { form_id, name?, status?, allowed_domains?, redirect_url?, honeypot_field?, spam_check?, turnstile_site_key?, turnstile_secret?, origin_mismatch?, rate_limit?, notifications? }`: send only what should change.
  - `status`: `paused` stops accepting posts, `active` resumes. A form Ikiform disabled returns `forbidden`.
  - `allowed_domains` replaces the whole list (up to 20, subdomains included, an empty list allows any site). Set `redirect_url` to `null` to go back to Ikiform's thank-you page.
  - `spam_check`: `off`, `ikiform` (Ikiform's human check) or `custom` (the user's own Turnstile widget, which needs `turnstile_site_key` and `turnstile_secret`). The secret is stored encrypted and never returned; `turnstile_secret: null` removes it.
  - `origin_mismatch`: `spam` or `reject` for posts from sites outside `allowed_domains`.
  - `rate_limit { preset, per_ip?, window_seconds?, per_form_per_minute? }`: `standard`, `relaxed`, `strict` or `custom`. Write-only: it is never returned.
  - `notifications { enabled }`: turns new-submission emails on or off. Recipients are chosen in the dashboard.
- `set_form_fields { form_id, definition }`: publishes a field schema (`{ version: 1, title, fields: [...] }`). Posts that don't match are rejected. `definition: null` removes it.
- `delete_form { form_id }`: deletes the form. Its endpoint stops accepting posts.

### Submissions

- `list_submissions { form_id?, status?, since?, limit?, cursor? }`: newest first across the workspace. `status` is `received` or `spam`. `since` is an ISO 8601 date or date-time, like `2026-10-01T00:00:00Z`. Each item has fields, public metadata and the spam score with reasons.
- `get_submission { submission_id }`: one submission with fields, metadata, status and spam score.
- `mark_spam { submission_id }`: moves it to spam. Pending `submission.created` webhooks for it are cancelled, and endpoints subscribed to `submission.spam` get one.
- `mark_not_spam { submission_id }`: restores it to received. Endpoints that never got its `submission.created` webhook get it now.
- `delete_submission { submission_id }`: permanently deletes it and its data. Cannot be undone. Endpoints subscribed to `submission.deleted` get a webhook.

### Webhooks

- `list_webhook_endpoints {}`: URL, form, status, subscribed events and failure state. Signing secrets and custom header values are never returned.
- `create_webhook_endpoint { url, form_id?, description?, event_types?, headers? }`: adds an endpoint and returns its `whsec_` signing secret once. Tell the user to store it as an environment variable such as `IKIFORM_WEBHOOK_SECRET`; never write it into code. `event_types` defaults to `submission.created`. `headers` is a list of `{ name, value }`.
- `update_webhook_endpoint { endpoint_id, url?, form_id?, description?, event_types?, headers?, status? }`: send only what should change. `status: "disabled"` stops deliveries and `"active"` resumes them; resuming does not replay. A header `value` of `null` keeps the saved value. Send header values again when the URL changes.
- `roll_webhook_secret { endpoint_id }`: returns a new signing secret once. The old one works for 24 hours.
- `delete_webhook_endpoint { endpoint_id }`: deletes the endpoint and its delivery history.
- `list_deliveries { endpoint_id, status?, limit?, cursor? }`: recent deliveries newest first, with status, attempt count, last HTTP status and last error. `status` is `succeeded`, `pending` or `failed`.
- `send_test_event { endpoint_id }`: queues a signed `endpoint.test` to an active endpoint and returns the delivery.
- `replay_failed_deliveries { endpoint_id, window }`: queues every failed or cancelled delivery from `24h`, `3d` or `7d` again. If the result has `more: true`, call it again to replay the rest.

### Prompt

- `connect_form { form_id? }`: step-by-step instructions to connect the project's form. With a `form_id` (needs `forms:read`) they are filled in with that form's endpoint, fields and settings.

## Paging

Lists default to 25 items, 100 at most (`limit` 1 to 100). When `has_more` is true, pass `next_cursor` as `cursor` for the next page.

## Confirm before acting

| Tool                                     | Before calling                                                                                                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `delete_submission`                      | Always ask the user to confirm. Name the submission (id, form, a field like the email). It cannot be undone                                                      |
| `replay_failed_deliveries`               | Ask the user to confirm the endpoint and window. It re-sends events to their server                                                                              |
| `mark_spam`, `mark_not_spam`             | Say which submissions will move. Both trigger webhooks. Confirm when acting on more than one                                                                     |
| `update_form`                            | Say what will change. Changing allowed domains, the spam check or rate limits can send real posts to spam or reject them. Pausing stops the form accepting posts |
| `set_form_fields`                        | Show the fields first. Posts that don't match the schema are rejected                                                                                            |
| `delete_form`, `delete_webhook_endpoint` | Always ask the user to confirm, naming the form or endpoint                                                                                                      |
| `roll_webhook_secret`                    | Confirm, and tell the user to update their server within 24 hours                                                                                                |
| `create_form`                            | Fine to call when the user asked to connect a form that has no Ikiform form yet                                                                                  |

Read tools need no confirmation.

## Workflows

Connect a form in the user's code:
1. `list_forms`, and match the form by name with the user. If none fits, `create_form` with a short name like "Contact".
2. `get_form` with the id.
3. Follow `setup_instructions`. Use the exact `endpoint`, field names and `honeypot_field`.
4. If `allowed_domains` is set, ask the user whether to add `localhost` while testing (`update_form`).
5. After the user submits once locally, `list_submissions { form_id, limit: 5 }` to confirm it arrived. Check `status: "spam"` too if it is missing.

Triage spam:
1. `list_submissions { form_id, status: "spam" }`.
2. Read the spam reasons. `origin_mismatch` means the post came from a domain not in allowed domains, which often means a missing `www`, staging or `localhost` entry.
3. Show the user what looks real and offer `mark_not_spam` for those.

Debug a failing webhook:
1. `list_webhook_endpoints` and find the endpoint, its `status`, `failing_since` and `consecutive_failures`.
2. `list_deliveries { endpoint_id, status: "failed" }` and read the last HTTP status and error.
3. Fix the handler. Common causes: the body was parsed before verifying, the wrong `whsec_` secret, a redirect, or a response slower than 15 seconds.
4. `send_test_event`, wait a few seconds, then `list_deliveries` again.
5. With the user's confirmation, `replay_failed_deliveries` for the window that failed.

A disabled endpoint returns `409 conflict` to `send_test_event` and `replay_failed_deliveries`. Turn it back on with `update_webhook_endpoint { status: "active" }` after the user confirms.

Add a webhook for the user's server:
1. Build the handler first (see references/webhooks.md), reading the secret from an environment variable.
2. `create_webhook_endpoint` with the deployed https URL and the form id.
3. Give the user the returned `secret` to set as that environment variable. Don't print it in code or commit it.
4. `send_test_event`, then `list_deliveries` to confirm a `2xx`.

API keys, members, notification recipients and billing are managed in the dashboard only, so a leaked key can't create keys, invite people or spend money.

## Connect the server in other clients

Claude Code:

```bash
claude mcp add --transport http ikiform https://ikiform.com/mcp --header "Authorization: Bearer ik_sk_..."
```

Any client that takes JSON config:

```json
{
  "mcpServers": {
    "ikiform": {
      "type": "http",
      "url": "https://ikiform.com/mcp",
      "headers": { "Authorization": "Bearer ik_sk_..." }
    }
  }
}
```
