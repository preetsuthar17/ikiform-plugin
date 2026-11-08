import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry === ".git") return [];
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function fail(file, message) {
  problems.push(`${relative(root, file)}: ${message}`);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    fail(file, `invalid JSON (${error.message})`);
    return null;
  }
}

function frontmatter(file) {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (pair) fields[pair[1]] = pair[2].replace(/^(["'])(.*)\1$/, "$2").trim();
  }
  return { fields, body: text.slice(match[0].length) };
}

function checkSkill(file) {
  const parsed = frontmatter(file);
  if (!parsed) return fail(file, "missing YAML frontmatter");
  const { name, description } = parsed.fields;
  const folder = dirname(file).split(/[\\/]/).pop();
  if (!name) fail(file, "frontmatter has no name");
  else if (name.length > 64 || !NAME.test(name))
    fail(file, `name "${name}" must be lowercase letters, digits and single hyphens, up to 64`);
  else if (name !== folder) fail(file, `name "${name}" must match its folder "${folder}"`);
  if (!description) fail(file, "frontmatter has no description");
  else if (description.length > 1024) fail(file, `description is ${description.length} characters, over 1024`);
  const lines = parsed.body.split("\n").length;
  if (lines > 500) fail(file, `body is ${lines} lines, over 500`);
  for (const [, target] of parsed.body.matchAll(/\]\((?!https?:|#|mailto:)([^)\s]+)\)/g)) {
    if (!existsSync(join(dirname(file), target.split("#")[0]))) fail(file, `broken link ${target}`);
  }
}

const files = walk(root);

for (const file of files.filter((path) => path.endsWith(".json"))) readJson(file);

for (const file of files.filter((path) => path.endsWith("SKILL.md"))) checkSkill(file);

const marketplaceFile = join(root, ".claude-plugin", "marketplace.json");
const marketplace = existsSync(marketplaceFile) ? readJson(marketplaceFile) : null;
if (!marketplace) fail(marketplaceFile, "missing marketplace.json");
else {
  if (!marketplace.name) fail(marketplaceFile, "missing name");
  if (!marketplace.owner?.name) fail(marketplaceFile, "missing owner.name");
  for (const entry of marketplace.plugins ?? []) {
    if (typeof entry.source !== "string") continue;
    const pluginRoot = join(root, entry.source);
    const manifestFile = join(pluginRoot, ".claude-plugin", "plugin.json");
    if (!existsSync(manifestFile)) {
      fail(marketplaceFile, `plugin ${entry.name} has no ${relative(root, manifestFile)}`);
      continue;
    }
    const manifest = readJson(manifestFile);
    if (manifest && manifest.name !== entry.name)
      fail(manifestFile, `name "${manifest.name}" differs from marketplace entry "${entry.name}"`);
    const mcpFile = join(pluginRoot, ".mcp.json");
    const mcp = existsSync(mcpFile) ? readJson(mcpFile) : null;
    for (const [server, config] of Object.entries(mcp?.mcpServers ?? {})) {
      if (config.url && !URL.canParse(config.url.replace(/\$\{[^}]+\}/g, "x")))
        fail(mcpFile, `server ${server} has an invalid url`);
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`x ${problem}`);
  process.exit(1);
}

console.log(`ok: ${files.length} files checked`);
