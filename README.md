# Ikiform for Claude Code and other agents

[Ikiform](https://ikiform.com) is the backend for any form. Point an HTML form, a framework form or a server request at `https://ikiform.com/f/<formId>`. Ikiform validates the post, blocks spam, stores it and sends signed webhooks.

This repository has two things:
- **An Agent Skill** (`ikiform`) that teaches a coding agent to connect a form to Ikiform, post from a server, verify Ikiform webhooks and triage submissions. It works in Claude Code and any agent that reads `SKILL.md` skills.
- **A Claude Code plugin** that bundles the skill with the Ikiform MCP server, so the agent can look up your forms, create them, read submissions and debug webhooks.

## Install in Claude Code

In a Claude Code session:

```
/plugin marketplace add preetsuthar17/ikiform-plugin
/plugin install ikiform@ikiform
```

Or from your shell:

```bash
claude plugin marketplace add preetsuthar17/ikiform-plugin
claude plugin install ikiform@ikiform
```

### Set your API key

The plugin's MCP server reads your key from the `IKIFORM_API_KEY` environment variable.
1. Create a **secret** key at https://ikiform.com/dashboard/api-keys.
2. Give it the scopes you want the agent to have:

   | Scope               | Lets the agent                                                |
   | ------------------- | ------------------------------------------------------------- |
   | `forms:read`        | List forms and read a form's endpoint, fields and setup steps |
   | `forms:write`       | Create forms and change name, allowed domains or redirect URL |
   | `submissions:read`  | List and read submissions                                     |
   | `submissions:write` | Mark spam or not spam, and delete submissions                 |
   | `webhooks:read`     | List webhook endpoints and deliveries                         |
   | `webhooks:write`    | Send test events and replay failed deliveries                 |

   `forms:read` is enough to wire forms into your code. Add more only if you want the agent to do more.

3. Export it in the shell you start Claude Code from, for example in `~/.zshrc`:

   ```bash
   export IKIFORM_API_KEY=ik_sk_...
   ```

4. Start Claude Code and run `/mcp`. The server shows as `plugin:ikiform:ikiform`.

The key is a secret. Keep it in your shell profile or a secrets manager, never in a repository or in browser code.

The skill works without the key. Without it, the agent asks you for the form id from the dashboard instead of looking it up.

### Use it

Ask in plain words, for example:
- "Connect the contact form in this project to Ikiform."
- "Add a waitlist form to the landing page and send it to Ikiform."
- "Verify Ikiform webhooks in our Express server."
- "Show me this week's spam on the Contact form."
- "Why is my Ikiform webhook failing?"

Or run the skill directly with `/ikiform:ikiform`.

The agent asks before it deletes a submission or replays webhook deliveries.

## Use the skill in other agents

The skill is a plain [Agent Skills](https://agentskills.io) folder: `plugins/ikiform/skills/ikiform/`. Copy it into your agent's skills directory.

Claude Code without the plugin:

```bash
git clone https://github.com/preetsuthar17/ikiform-plugin ikiform-plugin
mkdir -p ~/.claude/skills
cp -R ikiform-plugin/plugins/ikiform/skills/ikiform ~/.claude/skills/ikiform
```

Use `.claude/skills/ikiform` inside a project instead to share it with your team. For other agents, copy the same folder into the directory that agent reads skills from. The skill uses only `name`, `description` and `license` in its frontmatter, so it stays portable.

## Connect the MCP server without the plugin

Server: `https://ikiform.com/mcp`, Streamable HTTP, authenticated with `Authorization: Bearer ik_sk_...`.

### Claude Code

```bash
claude mcp add --transport http ikiform https://ikiform.com/mcp --header "Authorization: Bearer ik_sk_..."
```

### Cursor

In `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "ikiform": {
      "url": "https://ikiform.com/mcp",
      "headers": {
        "Authorization": "Bearer ${env:IKIFORM_API_KEY}"
      }
    }
  }
}
```

### VS Code

In `.vscode/mcp.json`. VS Code asks for the key the first time and stores it securely:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "ikiform-api-key",
      "description": "Ikiform secret API key (ik_sk_...)",
      "password": true
    }
  ],
  "servers": {
    "ikiform": {
      "type": "http",
      "url": "https://ikiform.com/mcp",
      "headers": {
        "Authorization": "Bearer ${input:ikiform-api-key}"
      }
    }
  }
}
```

### Tools

The full list of tools and the scope each one needs is at https://ikiform.com/docs/mcp#tools.

The server also has a `connect_form` prompt that returns setup steps for a form.

## Layout

```
.claude-plugin/marketplace.json        the "ikiform" marketplace
plugins/ikiform/
  .claude-plugin/plugin.json           plugin manifest
  .claude-plugin/icon.png              listing icon
  .mcp.json                            the Ikiform MCP server
  skills/ikiform/SKILL.md              the skill
  skills/ikiform/references/*.md       detail the skill loads when needed
server.json                            MCP Registry listing
glama.json                             Glama listing
.github/workflows/publish-mcp.yml      publishes server.json to the MCP Registry
scripts/check.mjs                      offline checks
```

## Check changes

With Claude Code installed:

```bash
claude plugin validate --strict .
claude plugin validate --strict ./plugins/ikiform
```

Without it, or in CI, run the offline checks. They need Node 20 or later and no packages:

```bash
node scripts/check.mjs
```

They check that every JSON file parses, that `SKILL.md` has a valid `name` and `description` under the Agent Skills limits, that its relative links resolve, and that the marketplace entry matches the plugin manifest.

To try a local copy before publishing:

```bash
claude plugin marketplace add ./
claude plugin install ikiform@ikiform
```

## Docs

- Ikiform docs: https://ikiform.com/docs
- Everything as markdown for agents: https://ikiform.com/llms.txt
- Support: hello@ikiform.com

## License

MIT. See [LICENSE](LICENSE).
