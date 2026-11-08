# Posting from a server

Backends, cron jobs, server actions and integrations post to the same endpoint as browsers. Add a secret API key so Ikiform knows the post is the user's own.

Source: https://ikiform.com/docs/guides/server.md

## When to post from a server

Prefer posting from the browser. Each visitor then keeps their own IP for rate limits and every spam check works. Post from a server when:
- the form must work without JavaScript and the app already has a server (a Next.js server action, a SvelteKit form action, a Nuxt server route),
- the data comes from the backend, not a visitor (an order, a cron job, an import),
- the post comes from another service.

All server posts share the server's IP, so the per-IP rate limits count every visitor together. The Standard preset allows 5 posts a minute and 3 in 10 seconds per IP and form. For forms proxied through a server, ask the user to choose the Relaxed or Custom rate limit.

## The key

1. The user opens https://ikiform.com/dashboard/api-keys and creates a **secret** key.
2. It needs the `submissions:write` scope.
3. The key starts with `ik_sk_` and is shown once. Store it as a server environment variable, for example `IKIFORM_SECRET_KEY`.

Never expose it to the browser. In Next.js, do not prefix it with `NEXT_PUBLIC_`. In Vite apps, do not prefix it with `VITE_`.

## Send a submission

Node or any runtime with `fetch`:

```ts
const response = await fetch("https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.IKIFORM_SECRET_KEY}`,
    "Idempotency-Key": order.id,
  },
  body: JSON.stringify({ email: order.email, plan: order.plan }),
});

const result = await response.json();
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message} (${result.request_id})`);
```

curl:

```bash
curl https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx \
  -H "Authorization: Bearer $IKIFORM_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order_1234" \
  -d '{"email":"ada@example.com","plan":"team"}'
```

Python:

```python
import os

import requests

response = requests.post(
    "https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx",
    json={"email": "ada@example.com", "plan": "team"},
    headers={
        "Authorization": f"Bearer {os.environ['IKIFORM_SECRET_KEY']}",
        "Idempotency-Key": "order_1234",
    },
    timeout=10,
)
result = response.json()
if not result["ok"]:
    raise RuntimeError(f"{result['error']['code']}: {result['error']['message']}")
```

## Forwarding a browser form from a server action

Forward only string values, so a file input never reaches Ikiform. Next.js adds `$ACTION` fields, which should be skipped.

```ts
"use server";

export interface ContactState {
  ok: boolean;
  message: string;
  fields?: Record<string, string[]>;
}

export async function sendContact(_previous: ContactState, formData: FormData): Promise<ContactState> {
  const body = new URLSearchParams();
  for (const [name, value] of formData) {
    if (typeof value === "string" && !name.startsWith("$ACTION")) body.append(name, value);
  }
  const response = await fetch("https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx", {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${process.env.IKIFORM_SECRET_KEY}`,
    },
    body,
  });
  const result = await response.json();
  if (result.ok) return { ok: true, message: "Thanks, we got it." };
  return { ok: false, message: result.error.message, fields: result.error.fields };
}
```

Use it with `useActionState(sendContact, { ok: false, message: "" })` in a client component.

## What a secret key changes

| Check                             | Without a key                         | With a secret key                |
| --------------------------------- | ------------------------------------- | -------------------------------- |
| Allowed domains                   | Checked against `Origin` or `Referer` | Skipped                          |
| Ikiform human check               | Required when turned on               | Skipped                          |
| Your own Turnstile keys           | Token required                        | Token still required             |
| Rate limits                       | Per visitor IP and form               | Still apply, per the server's IP |
| Field validation and spam scoring | Run                                   | Run                              |

A key from another workspace, a revoked key, or a secret key without `submissions:write` gets `403 forbidden`. A malformed `Authorization` header is refused, not ignored.

## Publishable keys

Publishable keys (`ik_pub_`) are for browsers. They can only submit, and only from the domains listed on the key. From any other site they get `403 origin_not_allowed`. They do not skip the human check or the form's allowed domains.

## Retries and idempotency

Send an `Idempotency-Key` header (or an `_idempotency` field) that is stable for the thing being submitted, such as an order id. Keys are up to 255 characters and scoped to the form for 24 hours. The header wins when both are sent.

| Retry with                                | Result                                        |
| ----------------------------------------- | --------------------------------------------- |
| Same key, same fields                     | The first response is replayed. No duplicate. |
| Same key, different fields                | `422 idempotency_mismatch`                    |
| Same key while the first is still running | `409 idempotency_in_progress`                 |

Retry `429` after `Retry-After`, and `500`, `409` or network errors with backoff. Do not retry other `4xx` errors unchanged.

```js
const key = crypto.randomUUID();

async function send(attempt = 1) {
  const response = await fetch("https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ email: "ada@example.com" }),
  }).catch(() => null);
  if (response && response.status < 500 && response.status !== 429) return response.json();
  if (attempt === 3) throw new Error("Ikiform is unreachable");
  const wait = Number(response?.headers.get("Retry-After")) || attempt * 2;
  await new Promise((resolve) => setTimeout(resolve, wait * 1000));
  return send(attempt + 1);
}
```

## Plans and server posts

On a workspace without a plan, posts from a server or curl are not free tests. They get `402 plan_required` and are held for 30 days, up to 100 a month, until the user picks a plan or buys a pack. Only posts from localhost are free tests.

## REST API

Reading forms and submissions from a backend uses the REST API at `https://ikiform.com/api/v1` with a secret key, or `createClient` from `@ikiform/sdk`. It refuses browsers by design. Docs: https://ikiform.com/docs/api.md. OpenAPI: https://ikiform.com/api/v1/openapi.json.
