# fetch in JavaScript apps

Any code that can send an HTTP request can submit to Ikiform. In a JS app, post `new FormData(form)` with `Accept: application/json` and read the JSON answer.

Sources: https://ikiform.com/docs/frameworks.md and the guides under https://ikiform.com/docs/guides/

## The contract

```
POST https://ikiform.com/f/<formId>
Accept: application/json
Body: FormData, urlencoded or JSON (UTF-8)
```

- Success: `201 { "ok": true, "id": "sub_..." }`
- Failure: `{ "ok": false, "error": { "code", "message", "fields"? }, "request_id" }`
- `error.fields` maps field names to lists of messages. Errors about the whole body use the key `_form`.
- `fetch` only rejects on network failures. HTTP errors resolve with the envelope in the body.
- `Accept: application/json` makes Ikiform answer with JSON instead of a redirect.
- CORS is open to every origin. Allowed domains, not CORS, protect the form.
- `X-Request-Id` and `Retry-After` are readable from browser code.
- Spam also gets `201`, so the visitor can't tell.

Show both states: a success message, and the error message or per-field errors.

## Plain JavaScript, progressively enhanced

The form still posts as normal HTML when JavaScript is off.

```html
<form id="contact" action="https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx" method="post" novalidate>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required />
  <p data-error-for="email"></p>
  <label for="message">Message</label>
  <textarea id="message" name="message"></textarea>
  <p data-error-for="message"></p>
  <input name="_gotcha" type="text" tabindex="-1" autocomplete="off" hidden />
  <button>Send</button>
  <p role="status" data-status></p>
</form>

<script type="module">
  const form = document.querySelector("#contact");
  const button = form.querySelector("button");
  const status = form.querySelector("[data-status]");

  function showErrors(fields = {}) {
    for (const slot of form.querySelectorAll("[data-error-for]")) {
      const messages = fields[slot.dataset.errorFor];
      slot.textContent = messages ? messages[0] : "";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    status.textContent = "Sending";
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      const result = await response.json();
      showErrors(result.ok ? {} : result.error.fields);
      status.textContent = result.ok ? "Thanks, we got it." : result.error.message;
      if (result.ok) form.reset();
    } catch {
      status.textContent = "Couldn't reach the server. Try again.";
    } finally {
      button.disabled = false;
    }
  });
</script>
```

## React and Next.js client component

```tsx
"use client";

import { useState } from "react";

const ENDPOINT = "https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx";

type Status = "idle" | "sending" | "sent" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("sending");
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(event.currentTarget),
      });
      const result = await response.json();
      if (result.ok) return setStatus("sent");
      setErrors(result.error.fields ?? {});
      setMessage(result.error.message);
    } catch {
      setErrors({});
      setMessage("Couldn't reach the server. Try again.");
    }
    setStatus("error");
  }

  if (status === "sent") return <p>Thanks, we got it.</p>;

  return (
    <form onSubmit={onSubmit} noValidate>
      <label htmlFor="email">Email</label>
      <input id="email" name="email" type="email" required aria-invalid={Boolean(errors.email)} />
      {errors.email ? <p>{errors.email[0]}</p> : null}
      <label htmlFor="message">Message</label>
      <textarea id="message" name="message" />
      <input name="_gotcha" type="text" tabIndex={-1} autoComplete="off" hidden />
      {status === "error" && !Object.keys(errors).length ? <p role="alert">{message}</p> : null}
      <button disabled={status === "sending"}>{status === "sending" ? "Sending" : "Send"}</button>
    </form>
  );
}
```

In Next.js App Router, keep `"use client"` and render the component from any server component page. The `"use client"` line is ignored outside Next.js.

Next.js server action instead: it works without JavaScript but needs a secret key, and all posts share the server's IP for rate limits. See [server.md](server.md) and https://ikiform.com/docs/guides/nextjs.md.

## Vue

```vue
<script setup>
import { ref } from "vue";

const status = ref("idle");
const errors = ref({});
const message = ref("");

async function onSubmit(event) {
  status.value = "sending";
  const response = await fetch("https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new FormData(event.target),
  }).catch(() => null);
  const result = response ? await response.json() : { ok: false, error: { message: "Couldn't reach the server." } };
  if (result.ok) {
    status.value = "sent";
    return;
  }
  errors.value = result.error.fields ?? {};
  message.value = result.error.message;
  status.value = "error";
}
</script>

<template>
  <p v-if="status === 'sent'">Thanks, we got it.</p>
  <form v-else @submit.prevent="onSubmit">
    <label>Email <input name="email" type="email" required /></label>
    <p v-if="errors.email">{{ errors.email[0] }}</p>
    <label>Message <textarea name="message"></textarea></label>
    <input name="_gotcha" type="text" tabindex="-1" autocomplete="off" hidden />
    <p v-if="status === 'error' && !errors.email" role="alert">{{ message }}</p>
    <button :disabled="status === 'sending'">Send</button>
  </form>
</template>
```

Nuxt: same component. For a form that also posts before hydration, see https://ikiform.com/docs/guides/nuxt.md.

## Svelte 5

```svelte
<script>
  let status = $state("idle");
  let errors = $state({});
  let message = $state("");

  async function onsubmit(event) {
    event.preventDefault();
    status = "sending";
    const response = await fetch("https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(event.currentTarget),
    }).catch(() => null);
    const result = response ? await response.json() : { ok: false, error: { message: "Couldn't reach the server." } };
    if (result.ok) {
      status = "sent";
      return;
    }
    errors = result.error.fields ?? {};
    message = result.error.message;
    status = "error";
  }
</script>

{#if status === "sent"}
  <p>Thanks, we got it.</p>
{:else}
  <form {onsubmit}>
    <label>Email <input name="email" type="email" required /></label>
    {#if errors.email}<p>{errors.email[0]}</p>{/if}
    <label>Message <textarea name="message"></textarea></label>
    <input name="_gotcha" type="text" tabindex="-1" autocomplete="off" hidden />
    {#if status === "error" && !errors.email}<p role="alert">{message}</p>{/if}
    <button disabled={status === "sending"}>Send</button>
  </form>
{/if}
```

SvelteKit with a prerendered page: https://ikiform.com/docs/guides/sveltekit.md. A form action with a secret key: https://ikiform.com/docs/guides/svelte.md.

## Astro

Astro renders plain HTML, which is all Ikiform needs. Start with the static form from [html.md](html.md). Add a script only to stay on the page after submit:

```astro
<form id="contact" action="https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx" method="post">
  <input name="email" type="email" required />
  <textarea name="message"></textarea>
  <input name="_gotcha" type="text" tabindex="-1" autocomplete="off" hidden />
  <button>Send</button>
  <p role="status" data-status></p>
</form>

<script>
  const form = document.querySelector("#contact");
  const status = form.querySelector("[data-status]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "Sending";
    const response = await fetch(form.action, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new FormData(form),
    });
    const result = await response.json();
    status.textContent = result.ok ? "Thanks, we got it." : result.error.message;
    if (result.ok) form.reset();
  });
</script>
```

## The SDK (optional)

`@ikiform/sdk` wraps the same request. `submit` never throws and resolves to `{ ok: true, id }` or `{ ok: false, error, status, requestId }`.

```ts
import { submit } from "@ikiform/sdk";

const result = await submit("frm_xxxxxxxxxxxxxxxx", new FormData(form));
if (result.ok) console.log("Saved", result.id);
else console.error(result.error.code, result.error.message, result.error.fields);
```

`data` can be `FormData`, `URLSearchParams` or a plain object (sent as JSON). Options: `baseUrl`, `signal`, `idempotencyKey`, `turnstileToken`, `fetch`.

## Ikiform human check with fetch

If the form's spam check is **Ikiform**, a `fetch` post without a token gets `403 challenge_required`. HTML posts don't, because they get a check page instead. Get a token right before each submit:

```ts
import { challenge } from "@ikiform/sdk";

const data = new FormData(form);
data.set("cf-turnstile-response", await challenge("frm_xxxxxxxxxxxxxxxx"));
const response = await fetch("https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx", {
  method: "POST",
  headers: { Accept: "application/json" },
  body: data,
});
```

Or with the SDK: `submit(formId, data, { turnstileToken: await challenge(formId) })`. Tokens are single use. `challenge` rejects with `ChallengeError` whose `code` is `challenge_failed`, `challenge_timeout` or `aborted`.

## Body formats

| Content-Type                         | Shape                | Notes                                            |
| ------------------------------------ | -------------------- | ------------------------------------------------ |
| `application/json` and `+json` types | One JSON object      | Nested at most 3 levels, counting the top object |
| `application/x-www-form-urlencoded`  | Name and value pairs | Repeated names and `name[]` become arrays        |
| `multipart/form-data`                | Name and value pairs | Real files are refused                           |
| Anything else                        |                      | `415 unsupported_media_type`                     |

## Content Security Policy

If the app sets a CSP, add `https://ikiform.com` to `connect-src`, and to `form-action` if the form can also post as HTML.
