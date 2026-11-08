# Plain HTML and static sites

A plain HTML form is the whole integration. No script, no iframe and no embed. Set the `action` to the form's endpoint and keep the user's own markup and CSS. This works in any static site generator (Hugo, Jekyll, Eleventy, Astro) and in site builders that accept custom HTML.

Source: https://ikiform.com/docs/html.md

## A basic form

```html
<form action="https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx" method="post">
  <label>
    Name
    <input name="name" autocomplete="name" required />
  </label>
  <label>
    Email
    <input name="email" type="email" autocomplete="email" required />
  </label>
  <label>
    Message
    <textarea name="message" rows="5"></textarea>
  </label>
  <input name="_gotcha" type="text" tabindex="-1" autocomplete="off" hidden />
  <button>Send</button>
</form>
```

- `method` must be `post`. The browser sends `application/x-www-form-urlencoded`, or `multipart/form-data` with `enctype`. Both work.
- Every control with a `name` becomes a field. Controls without a name, and disabled controls, are not sent.
- Browser validation such as `required` helps people but is not a security check. Field rules defined in the dashboard are enforced on the server.
- Opening `https://ikiform.com/f/<formId>` in a tab is a `GET` and answers `404 not_found`. That is expected. The endpoint only takes posts.

## After submit

A successful browser post is answered with a `303` redirect. Ikiform picks the target in this order:
1. The form's **Redirect after submit** setting in the dashboard.
2. A `_redirect` (or `_next`) field in the post, if it passes the rules below.
3. Otherwise Ikiform's hosted thank-you page at `/f/<formId>/thanks`.

Rules for `_redirect`. Ikiform follows it only when it is:
- an `https:` URL,
- with no username, password or custom port,
- on one of the form's allowed domains or a subdomain of one.

Forms without allowed domains ignore `_redirect`. A `_redirect` that is not followed falls through to the hosted thank-you page. It never causes an error.

```html
<form action="https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx" method="post">
  <input name="email" type="email" required />
  <input type="hidden" name="_redirect" value="https://example.com/thanks" />
  <input name="_gotcha" type="text" tabindex="-1" autocomplete="off" hidden />
  <button>Request a demo</button>
</form>
```

If the form already has a redirect URL in the dashboard, do not add `_redirect`.

When a post is rejected, for example a missing required field, the browser sees a hosted error page that lists the problems and links back.

## Arrays and checkboxes

Repeated names and names ending in `[]` become arrays. Use `[]` for checkbox groups and `<select multiple>` so a single choice is still an array.

```html
<label><input type="checkbox" name="topics[]" value="billing" /> Billing</label>
<label><input type="checkbox" name="topics[]" value="api" /> API</label>
```

- Names like `address[city]` are kept literally, not nested. Post JSON for nested values.
- An unchecked checkbox is not sent at all.
- Up to 100 fields, names up to 128 characters, values up to 16 KB.

File uploads are not built yet. A post with a real file gets `422 files_not_supported`. Upload files elsewhere and submit the link.

## Reserved fields

Names that start with `_` are instructions for Ikiform and are never stored as answers.

| Field                   | Effect                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `_gotcha`               | Honeypot. Leave it empty and hidden. A filled value is enough to store the post as spam. The name can be changed per form.      |
| `_redirect`, `_next`    | Where to send the browser after a successful post.                                                                              |
| `_subject`              | A label stored as `meta.subject` and sent to webhooks and the API. Cut to 200 characters. It does not change the email subject. |
| `_replyto`              | Reply-to address for notification emails. Ignored unless it is one valid email.                                                 |
| `_idempotency`          | Idempotency key, the same as the `Idempotency-Key` header.                                                                      |
| `_ikiform_ts`           | Signed render time, set by the SDK. Do not set it by hand.                                                                      |
| `cf-turnstile-response` | The Turnstile token, added by the Turnstile widget or the SDK.                                                                  |
| `_ikiform_via`          | Set by Ikiform's own check page. Do not send it.                                                                                |

Any other `_` name is dropped, so `_source` works as a private marker.

## The honeypot

The default name is `_gotcha`. Use the form's `honeypot_field` from `get_form` if it differs. A plain `hidden` attribute is enough for most bots. If spam still gets through, hide it off-screen instead, because some bots skip inputs marked `hidden`:

```html
<div aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden">
  <label>
    Leave this empty
    <input name="_gotcha" type="text" tabindex="-1" autocomplete="off" />
  </label>
</div>
```

Keep `tabindex="-1"` and `autocomplete="off"` so keyboard users and password managers never fill it.

## Human check

- Spam check set to **Ikiform**: no HTML change. A browser post without a token gets a short check page on ikiform.com, which runs Cloudflare Turnstile and posts the fields again. The visitor ends on the same thank-you page.
- Spam check set to **your own Turnstile keys**: render the widget inside the form. Posts without a valid token get `403 captcha_failed`.

```html
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>

<form action="https://ikiform.com/f/frm_xxxxxxxxxxxxxxxx" method="post">
  <input name="email" type="email" required />
  <div class="cf-turnstile" data-sitekey="YOUR_SITE_KEY"></div>
  <button>Send</button>
</form>
```

## Static site notes

- Keep the form id in site config (Hugo params, Jekyll `_config.yml`, Eleventy global data) when the form appears in many places. A form id is not a secret.
- If the site sets a `Content-Security-Policy`, add `https://ikiform.com` to `form-action`, and to `connect-src` if a script posts with `fetch`.
- Allowed domains should list every domain the form is served from, including `www`, staging and preview domains. Subdomains of a listed domain already match.
- Platform guides: https://ikiform.com/docs/guides/hugo.md, jekyll.md, eleventy.md, webflow.md, framer.md, wordpress.md, wix.md, squarespace.md, carrd.md under the same path.
