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

### 1.1 Plugin System

A plugin is a self-contained package that extends GraphWeave. Plugins can
provide any combination of:

- **Tools** — Python functions agents can call (Slack, Jira, SQL, etc.)
- **Node types** — custom nodes beyond the built-in 6 (e.g. RAG Retriever,
  Batch Processor, Code Executor)
- **Templates** — pre-built graphs that use the plugin's capabilities
- **Provider integrations** — new LLM providers beyond OpenAI/Anthropic/Gemini

Plugins are pure Python functions with capability injection — no classes to
inherit, no framework lock-in. Architecture inspired by
[SDK Kit](https://github.com/lytics/sdk-kit)'s capability-based plugin model.

Three distribution formats, from simplest to most shareable:

1. **Single file** — drop a `.py` file into `plugins/`. Good for personal tools.
2. **Directory** — plugin with templates, manifest, and pip deps. Shareable as
   a zip or git repo.
3. **pip package** — `pip install graphweave-plugin-slack`. Discoverable via
   Python entry points. The community contribution path.

The built-in 8 tools become the "core" plugin — same interface, nothing
special about them. This validates the plugin system works before community
plugins are built.

**Design:** [`.claude/gw-plans/plugins/overview.md`](.claude/gw-plans/plugins/overview.md)
**Outcome:** extensible platform where anyone can contribute tools, nodes,
and templates that the whole community can install and use.

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

### 2.4 Community Plugin Registry

A GitHub repo (`graphweave/community-plugins`) where users contribute plugins
via PR. Browsable from the UI — search, preview, one-click install.

Categories: messaging (Slack, Discord), project management (Jira, Linear),
data (SQL, vector search), APIs (GitHub, Stripe), AI (embeddings, RAG),
developer tools (git, code analysis).

Contribution flow:
1. Build a plugin locally (single file or directory)
2. Test it in your GraphWeave instance
3. Package as a pip-installable plugin
4. Submit a PR to `community-plugins` with manifest + README
5. After review, it appears in the in-app plugin browser

Not a marketplace with accounts and payments — an open repo that anyone can
contribute to and install from. Same model as Claude Code's plugin ecosystem.

**Outcome:** the plugin ecosystem grows through community contributions.
Building an agent for a new use case starts with "is there a plugin for that?"

### 2.5 Dev-Agent Template

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

- **GraphWeave CLI (`gw`)** — terminal interface for running, serving, and
  managing graphs. `gw run`, `gw serve` (MCP mode), `gw dev`. Separate
  packaging, separate release cycle.

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
