# Plugin System — Design Overview

**Status: Draft**

## Goal

Two layers of extensibility:

1. **Tools** — individual functions users create and share. The atom.
2. **Plugins** — bundles of tools + templates + config. The molecule.

Tools are the immediate value — users can add their own tools without learning
a plugin framework. Plugins are the distribution layer — structure for sharing
coherent capability sets with the community.

Inspired by [SDK Kit](https://github.com/lytics/sdk-kit)'s capability-based
plugin architecture, adapted for Python and LangGraph.

---

## Custom tools (standalone, no plugin required)

A tool is a Python function with a parameter schema. Three creation modes:

### HTTP Request builder (no code)

Most tools are API calls. The form builder handles these:

```
Tool Name:    slack_send
Description:  Send a message to a Slack channel

Parameters:
  channel     string    required
  message     string    required

Request:
  POST  https://slack.com/api/chat.postMessage
  Headers:
    Authorization: Bearer ${SLACK_BOT_TOKEN}
    Content-Type: application/json
  Body:
    { "channel": {{channel}}, "text": {{message}} }

Response mapping:
  success: response.ok
  result:  response.message.text
```

The engine generates the Python implementation from the form. Exports cleanly
because the structure is known.

### SQL Query builder (no code)

For database tools:

```
Tool Name:    get_user_orders
Description:  Fetch recent orders for a user

Parameters:
  user_id     string    required
  limit       number    default=10

Connection:   ${DATABASE_URL}
Query:        SELECT * FROM orders WHERE user_id = {{user_id}}
              ORDER BY created_at DESC LIMIT {{limit}}

Response mapping:
  success: true if rows returned
  result:  rows as list of dicts
```

### Code editor (advanced)

Monaco editor with syntax highlighting. Function signature pre-filled:

```python
def semantic_search(query: str, top_k: int = 5) -> dict:
    """Search codebase by meaning."""
    import chromadb
    client = chromadb.Client()
    collection = client.get_collection("code")
    results = collection.query(query_texts=[query], n_results=top_k)
    return {"success": True, "result": results}
```

### Tool categories

Tools in the registry are browsable by category:

| Category | Examples | Typical builder |
|----------|---------|----------------|
| Communication | Slack, Discord, Teams, Email, SMS, Webhook | HTTP Request |
| Developer | GitHub, GitLab, CI/CD, code search | HTTP Request |
| Project Management | Jira, Linear, Asana, Trello, Notion | HTTP Request |
| Data & Storage | SQL, MongoDB, Redis, S3, Sheets | SQL / Code |
| AI & Search | Vector DB, embeddings, web scrape, RSS | Code |
| CRM & Support | Salesforce, HubSpot, Zendesk, Intercom | HTTP Request |
| Content | Image gen, TTS, translation, CMS | HTTP Request |
| Finance | Stripe, QuickBooks, invoice | HTTP Request |
| System | File ops, shell commands, cron | Code |

Most categories are dominated by HTTP Request tools — REST APIs are the
lingua franca of integrations.

### Tool sharing

Tools are portable as `.json` files:

```json
{
  "name": "slack_send",
  "description": "Send a message to a Slack channel",
  "category": "communication",
  "builder": "http_request",
  "params": [...],
  "config": {
    "method": "POST",
    "url": "https://slack.com/api/chat.postMessage",
    "headers": {"Authorization": "Bearer ${SLACK_BOT_TOKEN}"},
    "body_template": "..."
  }
}
```

Export a tool, hand it to someone, they import it. No plugin system required.

---

## Plugin anatomy

A plugin is a Python function that receives a `Plugin` capability object:

```python
from graphweave import Plugin, ToolParam

def slack_plugin(plugin: Plugin):
    plugin.namespace = "slack"
    plugin.version = "0.1.0"
    plugin.description = "Slack messaging tools for GraphWeave agents"

    plugin.defaults({
        "slack_token": "${SLACK_BOT_TOKEN}",
        "default_channel": "#general",
    })

    @plugin.tool(
        name="slack_send",
        description="Send a message to a Slack channel",
        params=[
            ToolParam("channel", "string", required=True),
            ToolParam("message", "string", required=True),
        ],
    )
    def slack_send(inputs: dict, config: dict) -> dict:
        import requests
        resp = requests.post("https://slack.com/api/chat.postMessage", ...)
        return {"success": True, "result": f"Sent to {inputs['channel']}"}

    @plugin.tool(
        name="slack_search",
        description="Search Slack messages",
        params=[
            ToolParam("query", "string", required=True),
            ToolParam("channel", "string", required=False),
        ],
    )
    def slack_search(inputs: dict, config: dict) -> dict:
        ...

    plugin.template(
        name="Customer Support Agent",
        path="templates/customer-support.json",
    )
```

Key: plugins are **functions, not classes**. No inheritance, no hidden state.
State lives in closures. Capabilities are injected, not inherited.

---

## Plugin capabilities

Adapted from SDK Kit's 6-capability model:

| Capability | SDK Kit equivalent | Purpose |
|---|---|---|
| `plugin.namespace` | `plugin.ns()` | Identity — scopes config, events, tool names |
| `plugin.defaults()` | `plugin.defaults()` | Config defaults (env var refs, user config wins) |
| `plugin.tool()` | `plugin.expose()` | Register a tool in the engine's tool registry |
| `plugin.node_type()` | `plugin.expose()` | Register a custom node type (Future) |
| `plugin.template()` | `plugin.expose()` | Register a graph template |
| `plugin.provider()` | `plugin.expose()` | Register an LLM provider (Future) |
| `plugin.emit()` | `plugin.emit()` | Emit lifecycle events |
| `plugin.on()` | `plugin.on()` | Listen for events from engine or other plugins |
| `plugin.provides()` | `plugin.hold()` | Offer a capability other plugins can use |
| `plugin.has_capability()` | `plugin.hasCapability()` | Check if a capability exists |
| `plugin.require()` | `plugin.mustEnable()` | Declare hard dependency on another plugin |
| `plugin.log` | `plugin.log` | Logging (provided by engine, available to all plugins) |

---

## Plugin loading

```python
# In the engine startup
engine = GraphWeaveEngine()

# Core tools become a plugin
engine.use(core_tools_plugin)      # calculator, datetime, url_fetch, etc.

# Community plugins
engine.use(slack_plugin)
engine.use(github_plugin)

# User's custom plugins
engine.use(my_custom_tools)

await engine.init()
```

**Load order matters** — provider plugins before consumers (same as SDK Kit).
Plugins registered via `engine.use()` get their capabilities injected and
tools/templates/nodes added to the registries.

---

## Plugin distribution formats

### 1. Single file (simplest)

```
slack_plugin.py
```

Drop into `plugins/` directory or upload via UI. Good for personal tools.

### 2. Directory (with templates)

```
graphweave-plugin-slack/
  plugin.py              # entry point
  tools/
    slack_send.py
    slack_search.py
  templates/
    customer-support.json
  requirements.txt       # pip deps (requests, etc.)
  plugin.json            # manifest
```

### 3. pip package (for community registry)

```
pip install graphweave-plugin-slack
```

Registers via entry point:

```toml
# pyproject.toml
[project.entry-points."graphweave.plugins"]
slack = "graphweave_plugin_slack:slack_plugin"
```

Engine discovers plugins via `importlib.metadata.entry_points()`.

---

## Plugin manifest (`plugin.json`)

```json
{
  "name": "slack",
  "version": "0.1.0",
  "description": "Slack messaging tools for GraphWeave agents",
  "author": "community",
  "license": "MIT",
  "requires": [],
  "provides": {
    "tools": ["slack_send", "slack_search", "slack_read"],
    "templates": ["customer-support-agent"],
    "capabilities": ["slack_api"]
  },
  "config": {
    "slack_token": {
      "env": "SLACK_BOT_TOKEN",
      "required": true,
      "description": "Slack Bot OAuth token"
    },
    "default_channel": {
      "default": "#general",
      "required": false
    }
  },
  "python_requires": ">=3.11",
  "dependencies": ["requests>=2.28"]
}
```

---

## How plugins integrate with existing architecture

### Tool registry

Today: hardcoded `TOOL_REGISTRY` dict in `app/tools/registry.py` with 8 tools.

After: registry is populated by plugins at startup. Core tools are just the
first plugin loaded. Custom tools appear in the same registry.

```python
# Before
TOOL_REGISTRY = {
    "calculator": CalculatorTool(),
    "url_fetch": UrlFetchTool(),
    ...
}

# After
class ToolRegistry:
    def __init__(self):
        self._tools: dict[str, BaseTool] = {}

    def register(self, name: str, tool: BaseTool, plugin_ns: str):
        self._tools[f"{plugin_ns}.{name}"] = tool
        self._tools[name] = tool  # shorthand if unique

    def get(self, name: str) -> BaseTool:
        return self._tools[name]
```

### Canvas UI

Tool dropdown in node config currently shows the 8 built-in tools. After
plugins: dropdown is populated from `GET /v1/settings/tools` which returns
all registered tools grouped by plugin namespace.

```
Core
  calculator
  datetime
  url_fetch
  ...
Slack
  slack_send
  slack_search
GitHub
  gh_issues
  gh_pr_create
```

### Exporter

Today: tool nodes export as stubs. After: the exporter pulls the tool's
function body from the plugin and inlines it. Custom tools export the same
way — the function body is stored and can be serialized.

### Config / settings

Plugin config surfaces in the settings UI. Env var references (`${SLACK_BOT_TOKEN}`)
resolve from `.env` at runtime. The settings page shows which plugins are
loaded, their config, and their status.

---

## Mapping to SDK Kit patterns

| SDK Kit pattern | GraphWeave equivalent |
|---|---|
| `sdk.use(plugin)` | `engine.use(plugin)` |
| Pure function plugins | Same — `def my_plugin(plugin: Plugin)` |
| `plugin.hold()` for capabilities | `plugin.provides()` — e.g. a "database" plugin provides `query()` that other plugins can use |
| `plugin.hasCapability()` | `plugin.has_capability()` |
| `plugin.expose()` merges onto SDK | `plugin.tool()` / `plugin.node_type()` register in engine registries |
| Config underwrite (user wins) | Same — `plugin.defaults()` fills gaps, `.env` / user config wins |
| Event emitter with wildcards | Same — `plugin.emit("slack:send")`, `plugin.on("tool:*")` |
| Module augmentation for types | Python `Protocol` classes for capability type hints |
| Load order = dependency order | Same — provider plugins loaded before consumers |
| Closure-captured state | Same — plugin function body captures state in closure |

---

## Core tools as a plugin

The existing 8 tools become `core_tools_plugin`:

```python
def core_tools_plugin(plugin: Plugin):
    plugin.namespace = "core"
    plugin.version = "1.0.0"
    plugin.description = "Built-in GraphWeave tools"

    @plugin.tool(name="calculator", ...)
    def calculator(inputs, config):
        from simpleeval import simple_eval
        return {"success": True, "result": simple_eval(inputs["expression"])}

    @plugin.tool(name="url_fetch", ...)
    def url_fetch(inputs, config):
        ...

    # ... all 8 tools
```

This is a refactor of existing code, not new functionality. It validates the
plugin interface works before community plugins are built.

---

## Security considerations

- Plugin function bodies execute in the same process as the engine. No
  sandboxing in v1 — same trust model as pip packages.
- Config values with `${ENV_VAR}` syntax resolve from environment only, never
  from user input.
- Plugins from the community registry should be reviewed via PR (same as
  npm packages, Claude Code plugins).
- Future: optional sandboxing via subprocess/container per plugin execution.

---

## Phases

| Phase | What | Depends on |
|---|---|---|
| **P1: Plugin interface** | `Plugin` class, `engine.use()`, `@plugin.tool()` decorator, tool registry refactor | Nothing |
| **P2: Core tools migration** | Refactor 8 built-in tools into `core_tools_plugin` | P1 |
| **P3: Plugin loading** | Load from `plugins/` directory, single-file and directory formats | P1 |
| **P4: Canvas integration** | Grouped tool dropdown, plugin settings page | P2, P3 |
| **P5: Export support** | Exporter inlines plugin tool bodies into generated code | P2 |
| **P6: pip distribution** | Entry point discovery, `pip install graphweave-plugin-*` | P3 |
| **P7: Community registry** | `graphweave/community-plugins` repo, browse/install from UI | P6 |

P1-P3 are the foundation. P4-P5 make plugins usable end-to-end. P6-P7 are
distribution and community.

---

## Open questions

- Should plugin tool names be namespaced (`slack.send`) or flat (`slack_send`)?
  Flat is simpler for graph schemas; namespaced avoids collisions.
- Should we support async tool functions? Current tools are sync, wrapped in
  `asyncio.to_thread()` by the executor. Async-native tools would be more
  efficient for I/O-heavy plugins.
- How do plugin dependencies work? If `analytics_plugin` requires
  `storage_plugin`, do we auto-load or error? SDK Kit errors — we should
  probably do the same.
- Should plugins be able to define custom node types in v1, or defer to v2?
  Tools alone cover most use cases. Custom nodes add complexity to the canvas,
  the builder, and the exporter.
