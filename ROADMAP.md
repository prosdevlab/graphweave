# Graphweave Roadmap

> **What you draw is what runs — anywhere.**
>
> GraphWeave is the only tool that visually builds LangGraph graphs, executes
> them live, and exports them as portable artifacts. This roadmap extends that
> loop from "runs in our UI" to "runs anywhere."

## Where we are today

The canvas builder and execution backend are functional through Canvas Phase 5
and Execution Phase 5. You can draw a graph, run it with SSE streaming, debug
with state inspection, and browse run history.

What's missing: **the export story is broken.** The Python exporter produces
tool stubs (`# TODO: Replace with actual tool call`). There is no way to take
a graph you built and run it outside of GraphWeave.

---

## Phase 1 — Export

> Draw it, run it, ship it.

Close the gap between "runs in GraphWeave" and "runs anywhere."

### User stories

- "I built a research agent in GraphWeave. I want to export it and run it on
  my server without GraphWeave installed."
- "I need my agent to call our internal Slack API, not just the 8 built-in
  tools."
- "I drew an agent that summarizes GitHub issues. I want to use it as a tool
  in Claude Code."
- "I want to hand my teammate a Docker image of the agent I built so they can
  deploy it to Cloud Run."
- "I want to click Export in the canvas and get a zip file I can run."

### 1.1 Custom Tools

Users define custom tools as Python functions with a parameter schema. A tool
is a single function — name, description, parameters, implementation. No
framework, no boilerplate.

```python
# This is a tool. That's it.
def slack_send(channel: str, message: str) -> dict:
    resp = requests.post("https://slack.com/api/chat.postMessage", ...)
    return {"success": True, "result": f"Sent to {channel}"}
```

Tools are created via the UI (name + params + function body) or by importing a
`.json`/`.py` file. They register alongside the built-in 8 and work in any
tool node. They export cleanly — no stubs.

Shareable as files: export a tool, hand it to someone, they import it. No
plugin system required for simple sharing.

The tool builder supports three creation modes:

- **HTTP Request** (no code) — method, URL, headers, body mapping. Covers
  most API-based tools: Slack, Jira, GitHub, Stripe, any REST API.
- **SQL Query** (no code) — connection string + SQL template with `{{param}}`
  placeholders. Covers database tools: Postgres, MySQL, MongoDB.
- **Code** (advanced) — Monaco editor with syntax highlighting for tools that
  need logic: parsing, loops, conditionals, external binaries.

**Changes:** tool registry, DB schema (tools table), canvas tool dropdown,
tool creation UI (form builders + code editor), import/export endpoints
**Outcome:** users can create and share tools like `slack_send`, `jira_create`,
`semantic_search` and use them in any graph — most without writing code.

### 1.2 Fix Tool Export

Inline actual tool implementations into exported Python code. Both core and
plugin tools should produce working code, not stubs.

**Files:** `packages/execution/app/exporter.py`
**Outcome:** `GET /graphs/{id}/export` returns code that runs without modification.

### 1.3 MCP Server Export

Export a graph as a standalone MCP server that Claude Code, Cursor, or any
MCP-compatible client can use. The exported artifact:

```
my-agent/
  server.py           # MCP server (stdio JSON-RPC transport)
  graph.py            # Compiled LangGraph graph
  requirements.txt    # pip dependencies
  README.md           # Setup instructions
```

**New endpoint:** `GET /graphs/{id}/export?format=mcp`
**Outcome:** "I drew an agent in GraphWeave and now Claude Code can call it."

### 1.4 Docker Image Export

Export a self-contained Docker image: FastAPI + compiled graph + tools +
dependencies. `docker run -e OPENAI_API_KEY=... -p 8000:8000 my-agent` and it
serves a REST API.

```
my-agent/
  Dockerfile
  app/
    main.py            # FastAPI app with /run, /stream, /health endpoints
    graph.py           # Compiled LangGraph graph
    requirements.txt
```

**New endpoint:** `GET /graphs/{id}/export?format=docker`
**Outcome:** One-command deployment anywhere Docker runs.

### 1.5 Canvas Export UI

Export button in the canvas UI. Pick a format (Python, MCP server, Docker),
preview the output, download as a zip.

**Outcome:** Complete the draw-run-export loop without leaving the browser.

---

## Phase 2 — Distribution

> Make it useful, make it shareable.

### User stories

- "I'm new to GraphWeave. I want to start from a working agent template, not
  an empty canvas."
- "I want my agent to run every morning and email me a summary of overnight
  GitHub activity."
- "When a customer submits a support ticket, I want my agent to automatically
  research the issue and draft a response."
- "I built a Slack plugin with 3 tools and a template. I want to share it with
  the community."
- "I want to see how a real-world agent (like dev-agent) is built in
  GraphWeave so I can learn the patterns."

### 2.1 Template Gallery

Pre-built graph templates users can clone and customize. Categories: research,
customer support, data processing, content creation.

Templates are GraphSchema JSON files with metadata (name, description,
required plugins, example inputs). Shipped in-repo or via plugins, browsable
from the home view.

**Outcome:** New users start from working examples, not empty canvases.

### 2.2 Webhook Triggers

Agents triggered by external events. Each graph gets an inbound webhook URL.
Slack message, GitHub PR, form submission — any HTTP POST triggers a run.

**Outcome:** Agents that respond to events, not just manual runs.

### 2.3 Scheduled Runs (Cron Agents)

Run agents on a schedule. "Check competitor pricing every 6 hours." Results
stored, optional webhook/notification on state changes.

**Outcome:** Agents that provide ongoing value, not one-off demos.

### 2.4 Plugin System

A plugin bundles related tools + templates + config into a distributable
package. Built on top of custom tools — the packaging layer for when you want
to share a coherent set of capabilities, not just individual functions.

A Slack plugin ships `slack_send` + `slack_read` + `slack_search` tools AND a
"Customer Support Agent" template that uses them. Install the plugin, get
everything.

Architecture inspired by [SDK Kit](https://github.com/lytics/sdk-kit)'s
capability-based model. The built-in 8 tools become the "core" plugin.

**Design:** [`.claude/gw-plans/plugins/overview.md`](.claude/gw-plans/plugins/overview.md)
**Outcome:** structured distribution for bundles of tools + templates.

### 2.5 Community Registry

Three browsable registries — tools, plugins, and templates — all backed by
open GitHub repos. Search, filter by category, preview, one-click install.

**Tool registry** (`graphweave/community-tools`):
Individual tools contributed by the community. Browsable by category:

| Category | Examples |
|----------|---------|
| Communication | Slack, Discord, Teams, Email, SMS, Webhook |
| Developer | GitHub, GitLab, CI/CD, code search, package lookup |
| Project Management | Jira, Linear, Asana, Trello, Notion |
| Data & Storage | SQL, MongoDB, Redis, S3, Google Sheets |
| AI & Search | Vector DB, embeddings, web scrape, RSS |
| CRM & Support | Salesforce, HubSpot, Zendesk, Intercom |
| Content | Image generation, TTS, translation, CMS publish |
| Finance | Stripe, QuickBooks, invoice, payment |

**Plugin registry** (`graphweave/community-plugins`):
Bundles of related tools + templates. Install a plugin, get a full capability
set.

**Template registry** (part of community-plugins):
Pre-built agents by use case. Clone, customize, run.

Contribution flow:
1. Build a tool or plugin locally
2. Test it in your GraphWeave instance
3. Submit a PR to the appropriate community repo
4. After review, it appears in the in-app browser

Not a marketplace with accounts and payments — open repos that anyone can
contribute to and install from. Same model as Claude Code's plugin ecosystem.

**Outcome:** the ecosystem grows through community contributions.
Building an agent starts with "is there a tool for that?"

### 2.6 Dev-Agent Template

Rebuild [lytics/dev-agent](https://github.com/lytics/dev-agent) as a
GraphWeave plugin. Ships with tools (semantic search, GitHub issues, git
history) and a template graph that fetches issues, searches code, plans
implementation, and assembles context.

Serves as both a useful tool and the reference implementation for the plugin
format.

**Outcome:** flagship plugin that demonstrates the complete draw-run-export
pipeline with community-contributed tools.

---

## Companion Projects

These are separate repos that build on GraphWeave's API and export formats:

- **GraphWeave CLI (`gw`)** — terminal interface for the full GraphWeave
  workflow. Separate packaging, separate release cycle.
  - `gw run <graph>` — run a graph, stream output to terminal
  - `gw serve <graph>` — serve a graph as an MCP server
  - `gw install <tool|plugin>` — install from community registry
  - `gw search "slack"` — search tools and plugins
  - `gw export <graph> --format mcp` — export a graph
  - `gw dev` — start UI + execution engine

---

## Future — Extensibility

Not scheduled but on the radar:

- **Agent Sharing** — publish graphs for others to fork.
- **Cloud Deploy Targets** — one-click deploy to Cloud Run, Fly.io, Railway.
- **Graph Versioning** — branch, diff, merge, rollback graph schemas.
- **Embeddable Widget** — `<GraphWeaveAgent agentId="abc" />` for embedding
  agents in websites.
- **Multi-Agent Teams** — supervisor/worker patterns (when LangGraph's
  multi-agent primitives stabilize).
- **Plugin SDK** — `graphweave create-plugin` scaffolding tool, testing
  utilities, publishing workflow.

---

## What we're NOT building

- **Managed hosting.** Export and host it yourself.
- **Observability dashboard.** Integrate with LangSmith.
- **Low-code for non-developers.** GraphWeave maps 1:1 to LangGraph primitives.
  The target user understands what a state graph is.
- **Our own LLM framework.** We build on LangGraph, not around it.
