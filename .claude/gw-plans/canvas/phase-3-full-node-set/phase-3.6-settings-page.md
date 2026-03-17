# Phase 3.6 — Settings Page

## Goal

Add a `/settings` route showing which LLM providers are configured and which
tools are available. Accessible from the home view via a gear icon.

## Files to modify

| File | Action |
|------|--------|
| `packages/canvas/src/components/settings/SettingsPage.tsx` | New |
| `packages/canvas/src/App.tsx` | Add `/settings` route |
| `packages/canvas/src/components/home/HomeView.tsx` | Add settings link |

Note: `settings.ts` API client and `settingsSlice` are created in Part 3.2.

## Design

### Page layout

```
  +------------------------------------------------------------+
  |  [<- Home]  Settings                                        |
  +------------------------------------------------------------+
  |                                                              |
  |  LLM Providers                                               |
  |  +----------------+  +----------------+  +----------------+  |
  |  |    OpenAI       |  |    Gemini       |  |   Anthropic    |  |
  |  |  [check] Ready  |  |  [check] Ready  |  |  [x] Not set   |  |
  |  +----------------+  +----------------+  +----------------+  |
  |                                                              |
  |  Available Tools (8)                                         |
  |  +------------------------------------------------------+   |
  |  | calculator    Evaluate mathematical expressions       |   |
  |  | datetime      Get current date and time               |   |
  |  | url_fetch     Fetch content from a URL                |   |
  |  | web_search    Search the web                          |   |
  |  | wikipedia     Search Wikipedia                        |   |
  |  | file_read     Read a file                             |   |
  |  | file_write    Write a file                            |   |
  |  | weather       Get weather information                 |   |
  |  +------------------------------------------------------+   |
  |                                                              |
  +------------------------------------------------------------+
```

### Provider cards

Each uses the `Card` UI component:
- **Configured:** green `CheckCircle` icon + "Configured"
- **Not configured:** amber `AlertTriangle` icon + "Not configured" + hint
  "Set `{PROVIDER}_API_KEY` in .env"
- Never display actual key values (CLAUDE.md rule)

### Home view link

Add a gear icon (`Settings` from lucide-react) in the HomeView header,
linking to `/settings`.

### Loading and error states

```
  Loading state:
  +------------------------------------------------------------+
  |  [<- Home]  Settings                                        |
  +------------------------------------------------------------+
  |                                                              |
  |  LLM Providers                                               |
  |  [spinner] Loading provider status...                        |
  |                                                              |
  +------------------------------------------------------------+

  Error state (execution server down):
  +------------------------------------------------------------+
  |  [<- Home]  Settings                                        |
  +------------------------------------------------------------+
  |                                                              |
  |  +------------------------------------------------------+   |
  |  | [!] Could not connect to execution server.            |   |
  |  |     Check that Docker is running.                     |   |
  |  +------------------------------------------------------+   |
  |                                                              |
  +------------------------------------------------------------+
```

### Home view with settings link

```
  Before:
  +--------------------------------------------+
  |  GraphWeave               [+ New Graph]    |
  +--------------------------------------------+

  After:
  +--------------------------------------------+
  |  GraphWeave          [gear] [+ New Graph]  |
  +--------------------------------------------+
```

## Verification

- `tsc --noEmit` passes
- Navigate to `/settings` — provider cards show correct status
- Tool list populated from execution server
- Settings gear icon visible on home page
- Back arrow navigates to home
- If execution server is down, shows graceful error message
