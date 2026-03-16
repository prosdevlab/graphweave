# Part 1.6 — Floating Canvas Toolbar with Stamp Mode

## Summary

Replaced the collapsible left sidebar toolbar (Sidebar.tsx + Toolbar.tsx) with a
Whimsical-style floating toolbar that lives *on* the canvas. Added stamp mode for
click-to-place node creation alongside existing drag-to-place.

## Changes

### Extracted utilities (commit 1)
- `utils/nodeDefaults.ts` — NODE_DEFAULTS, SINGLETON_TYPES, geometry functions
- `constants/toolbarItems.ts` — ToolbarItem interface + TOOLBAR_ITEMS array with accentBg
- `hooks/useNodePlacement.ts` — shared placeNode(type, position) hook
- `hooks/useNodeDrop.ts` — refactored to use useNodePlacement

### Floating toolbar + stamp mode (commit 2)
- `contexts/CanvasContext.tsx` — added stampNodeType + setStampNodeType
- `components/canvas/FloatingToolbar.tsx` — 3-state toolbar (default → expanded → stamp active)
- `components/canvas/StampGhost.tsx` — mouse-following ghost when stamp is active
- `components/canvas/GraphCanvas.tsx` — rewired layout, stamp click handling, pan disambiguation
- `components/canvas/CanvasHint.tsx` — updated hint text
- Deleted: Toolbar.tsx, Sidebar.tsx + their tests

## Toolbar UX States

1. **Default**: Pointer (active) + CircuitBoard (expand)
2. **Expanded**: Pointer + X (close) + Start/LLM/End icons
3. **Stamp active**: Same as expanded, selected node highlighted with accent bg

## Key interactions
- Click node icon → stamp mode (click canvas to place, repeatable)
- Click same icon → deselect stamp
- Click Pointer → deselect + collapse
- Click X → collapse + clear stamp
- Escape → clear stamp (stay expanded) or collapse (if no stamp)
- Drag from icon → existing drag-to-place preserved

## Tests
- FloatingToolbar: 11 tests covering all states and interactions
- StampGhost: 2 tests
- useNodePlacement: 4 tests (placement, singletons, edge splitting)
- CanvasHint: updated for new text

## Status: Complete
