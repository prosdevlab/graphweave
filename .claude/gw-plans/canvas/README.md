# Canvas Layer -- Plans

React 19 + React Flow frontend phases. Depends on execution phases 3-4 for API surface.

## Phases

| Phase | Plan | Status |
|-------|------|--------|
| 1 | [Canvas core](phase-1-canvas-core/overview.md) -- Home view, Start/LLM/End nodes, edge wiring, config panel, save/load | Complete |
| 2 | [SSE run panel](phase-2-sse-run-panel/overview.md) -- SSE streaming, run panel, node highlighting, reconnection, resume | Complete |
| 3 | [Full node set](phase-3-full-node-set/overview.md) -- Tool/Condition/HumanInput nodes, settings page, run input dialog, graph traversal, auto-map | Complete |
| 4 | [State panel + LLM wiring](phase-4-state-panel/overview.md) -- LLM output_key clean break, LLM input_map/output_key config, state panel, model fetching | Complete |
| 5 | Error handling, run history, debug panel, JSON schema panel | Not started |
| 6 | Python export, JSON read/write, dark mode, polish | Not started |

## Phase 1 Parts

| Part | Plan | Summary | Status |
|------|------|---------|--------|
| 1.1 | [phase-1.1-test-infra-ui-base.md](phase-1-canvas-core/phase-1.1-test-infra-ui-base.md) | Test infra (Vitest), lucide-react, 9 shadcn UI components (Button, Input, Select, Textarea, Dialog, Sheet, Sidebar, Tooltip, Card), CanvasContext | Complete |
| 1.2 | [phase-1.2-node-components.md](phase-1-canvas-core/phase-1.2-node-components.md) | BaseNodeShell + Start/LLM/End node presenters | Complete |
| 1.3 | [phase-1.3-graph-canvas.md](phase-1-canvas-core/phase-1.3-graph-canvas.md) | GraphCanvas container, Toolbar with tooltips, connection validation, canvas hint, starter template | Complete |
| 1.4 | [phase-1.4-config-panel.md](phase-1-canvas-core/phase-1.4-config-panel.md) | NodeConfigPanel with slide transition + config forms | Complete |
| 1.5 | [phase-1.5-save-load.md](phase-1-canvas-core/phase-1.5-save-load.md) | HomeView, GraphCard, NewGraphDialog, editable graph name, save/load, view routing | Complete |
| 1.6 | [phase-1.6-floating-toolbar.md](phase-1-canvas-core/phase-1.6-floating-toolbar.md) | Floating toolbar with stamp mode, replaces sidebar toolbar | Complete |
