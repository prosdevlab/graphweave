# C1.1: Test Infrastructure, Base UI Components, CanvasContext

## Commit

```
feat(canvas): add test infra, base UI components, and CanvasContext

- Add Vitest + @testing-library/react + @testing-library/user-event
- Add vitest.config.ts and test setup file
- Add lucide-react for icons
- Create 9 shadcn-style UI components: Button, Input, Select, Textarea, Dialog, Sheet, Sidebar, Tooltip, Card
- Create CanvasContext (selectedNodeId + ReactFlow instance ref)
- Add tests for UI components and CanvasContext
```

## Files Touched

| Action | File |
|--------|------|
| modify | `packages/canvas/package.json` |
| create | `packages/canvas/vitest.config.ts` |
| create | `packages/canvas/src/test/setup.ts` |
| create | `packages/canvas/src/components/ui/Button.tsx` |
| create | `packages/canvas/src/components/ui/Input.tsx` |
| create | `packages/canvas/src/components/ui/Select.tsx` |
| create | `packages/canvas/src/components/ui/Textarea.tsx` |
| create | `packages/canvas/src/components/ui/Dialog.tsx` |
| create | `packages/canvas/src/components/ui/Sheet.tsx` |
| create | `packages/canvas/src/components/ui/Sidebar.tsx` |
| create | `packages/canvas/src/components/ui/Tooltip.tsx` |
| create | `packages/canvas/src/components/ui/Card.tsx` |
| create | `packages/canvas/src/contexts/CanvasContext.tsx` |
| create | `packages/canvas/src/types/canvas.ts` |
| create | `packages/canvas/src/components/ui/__tests__/Button.test.tsx` |
| create | `packages/canvas/src/contexts/__tests__/CanvasContext.test.tsx` |
| modify | `packages/canvas/tsconfig.json` |
| delete | `packages/canvas/src/components/ui/.gitkeep` |

---

## Detailed Todolist

### 1. Install test dependencies

- [ ] Run: `cd /Users/prosdev/workspace/graphweave && pnpm --filter @graphweave/canvas add -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom`
- [ ] Run: `cd /Users/prosdev/workspace/graphweave && pnpm --filter @graphweave/canvas add lucide-react`
- [ ] Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `packages/canvas/package.json`
- [ ] Verify `pnpm.onlyBuiltDependencies` is set in root `package.json` (add if missing per memory note)

### 2. Create Vitest config

- [ ] Create `packages/canvas/vitest.config.ts`:
  ```typescript
  import path from "node:path";
  import react from "@vitejs/plugin-react";
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    plugins: [react()],
    resolve: {
      alias: {
        "@store": path.resolve(__dirname, "./src/store"),
        "@ui": path.resolve(__dirname, "./src/components/ui"),
        "@shared": path.resolve(__dirname, "../../packages/shared/src"),
        "@api": path.resolve(__dirname, "./src/api"),
        "@contexts": path.resolve(__dirname, "./src/contexts"),
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      globals: true,
      css: false,
    },
  });
  ```
- [ ] Create `packages/canvas/src/test/setup.ts`:
  ```typescript
  import "@testing-library/jest-dom/vitest";
  ```
  This provides custom matchers like `toBeInTheDocument()`.

### 3. Update tsconfig and vite configs for test types and `@contexts` alias

- [ ] Add `"types": ["vitest/globals"]` to `compilerOptions` in `packages/canvas/tsconfig.json`
- [ ] Add path alias `@contexts/*` pointing to `./src/contexts/*` in **all three** config files:
  - **tsconfig.json** `paths`: `"@contexts/*": ["./src/contexts/*"]`
  - **vite.config.ts** `resolve.alias`: `"@contexts": path.resolve(__dirname, "./src/contexts")`
  - **vitest.config.ts** `resolve.alias`: `"@contexts": path.resolve(__dirname, "./src/contexts")`

  **CRITICAL**: All three files must have the alias. If `vite.config.ts` is missing it, `pnpm dev` will fail even though tests pass.

### 4. Create canvas types

- [ ] Create `packages/canvas/src/types/canvas.ts`:
  ```typescript
  import type { Node, Edge } from "@xyflow/react";
  import type { NodeSchema, EdgeSchema } from "@shared/schema";

  /** React Flow node with full NodeSchema as data */
  export type CanvasNode = Node<NodeSchema>;

  /** React Flow edge -- structurally same as EdgeSchema for C1 */
  export type CanvasEdge = Edge;

  /** Supported node types for C1 */
  export type C1NodeType = "start" | "llm" | "end";
  ```
- [ ] Delete `packages/canvas/src/types/.gitkeep`

### 5. Create CanvasContext

- [ ] Create `packages/canvas/src/contexts/CanvasContext.tsx`:
  ```typescript
  import { createContext, useContext, useState, type ReactNode } from "react";
  import { useReactFlow, type ReactFlowInstance } from "@xyflow/react";

  interface CanvasContextValue {
    selectedNodeId: string | null;
    setSelectedNodeId: (id: string | null) => void;
    reactFlowInstance: ReactFlowInstance | null;
  }

  const CanvasContext = createContext<CanvasContextValue | null>(null);

  export function CanvasProvider({ children }: { children: ReactNode }) {
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const reactFlowInstance = useReactFlow();

    return (
      <CanvasContext value={{
        selectedNodeId,
        setSelectedNodeId,
        reactFlowInstance,
      }}>
        {children}
      </CanvasContext>
    );
  }

  export function useCanvasContext(): CanvasContextValue {
    const ctx = useContext(CanvasContext);
    if (!ctx) {
      throw new Error("useCanvasContext must be used within a CanvasProvider");
    }
    return ctx;
  }
  ```

  Note: `useReactFlow()` requires `ReactFlowProvider` ancestor. The component tree in
  App.tsx already has `<ReactFlowProvider>` wrapping everything, and `<CanvasProvider>`
  will be nested inside it.

### 6. Create base UI components

All UI components follow the pattern: forward ref, accept standard HTML attributes
via spread, apply Tailwind classes, support `className` override via concatenation.
Dark theme default (zinc palette).

- [ ] Delete `packages/canvas/src/components/ui/.gitkeep`

- [ ] Create `packages/canvas/src/components/ui/Button.tsx`:
  ```typescript
  import { type ButtonHTMLAttributes, forwardRef } from "react";

  type ButtonVariant = "primary" | "secondary" | "ghost";

  interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
  }

  const variantClasses: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",
    secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700",
    ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800",
  };

  export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ variant = "secondary", className = "", ...props }, ref) => (
      <button
        ref={ref}
        className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${variantClasses[variant]} ${className}`}
        {...props}
      />
    ),
  );
  Button.displayName = "Button";
  ```

- [ ] Create `packages/canvas/src/components/ui/Input.tsx`:
  ```typescript
  import { type InputHTMLAttributes, forwardRef } from "react";

  export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
    ({ className = "", ...props }, ref) => (
      <input
        ref={ref}
        className={`w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${className}`}
        {...props}
      />
    ),
  );
  Input.displayName = "Input";
  ```

- [ ] Create `packages/canvas/src/components/ui/Select.tsx`:
  ```typescript
  import { type SelectHTMLAttributes, forwardRef } from "react";

  export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
    ({ className = "", children, ...props }, ref) => (
      <select
        ref={ref}
        className={`w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${className}`}
        {...props}
      >
        {children}
      </select>
    ),
  );
  Select.displayName = "Select";
  ```

- [ ] Create `packages/canvas/src/components/ui/Textarea.tsx`:
  ```typescript
  import { type TextareaHTMLAttributes, forwardRef } from "react";

  export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
    ({ className = "", ...props }, ref) => (
      <textarea
        ref={ref}
        className={`w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 ${className}`}
        {...props}
      />
    ),
  );
  Textarea.displayName = "Textarea";
  ```

- [ ] Create `packages/canvas/src/components/ui/Dialog.tsx`:

  shadcn-style dialog with backdrop overlay. Uses a `<dialog>` element for
  native accessibility (Escape to close, focus trap). Controlled via `open` prop.

  ```typescript
  import { useEffect, useRef, type ReactNode } from "react";
  import { X } from "lucide-react";

  interface DialogProps {
    open: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
  }

  export function Dialog({ open, onClose, title, children }: DialogProps) {
    const ref = useRef<HTMLDialogElement>(null);

    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      if (open && !el.open) el.showModal();
      if (!open && el.open) el.close();
    }, [open]);

    return (
      <dialog
        ref={ref}
        onClose={onClose}
        className="w-full max-w-md rounded-lg border border-zinc-700 bg-zinc-900 p-0 text-zinc-100 shadow-xl backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </dialog>
    );
  }
  ```

  Uses native `<dialog>` element because:
  - Built-in focus trap and Escape handling (no extra JS)
  - `backdrop:` pseudo-element for overlay (no extra DOM node)
  - `showModal()` blocks interaction with content behind
  - Matches shadcn Dialog semantics without Radix dependency

- [ ] Create `packages/canvas/src/components/ui/Sheet.tsx`:

  shadcn-style slide-over panel. Used for the config panel (temporary, contextual
  content that slides in from the right). No backdrop overlay — the canvas stays
  visible and interactive behind it.

  ```typescript
  import { type ReactNode } from "react";
  import { X } from "lucide-react";

  type SheetSide = "left" | "right";

  interface SheetProps {
    open: boolean;
    onClose: () => void;
    title: string;
    side?: SheetSide;
    children: ReactNode;
  }

  const sideClasses: Record<SheetSide, { position: string; transform: string }> = {
    left: { position: "left-0", transform: "-translate-x-full" },
    right: { position: "right-0", transform: "translate-x-full" },
  };

  export function Sheet({ open, onClose, title, side = "right", children }: SheetProps) {
    const { position, transform } = sideClasses[side];

    return (
      <div
        className={`absolute ${position} top-0 z-20 h-full w-80 border-l border-zinc-800 bg-zinc-900 shadow-xl transition-transform duration-200 ease-in-out ${open ? "translate-x-0" : transform}`}
        role="dialog"
        aria-label={title}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-sm p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close panel"
          >
            <X size={14} />
          </button>
        </div>
        <div className="overflow-y-auto p-4" style={{ height: "calc(100% - 49px)" }}>
          {children}
        </div>
      </div>
    );
  }
  ```

  Key differences from a full shadcn Sheet:
  - No Radix dependency — pure CSS transition
  - No backdrop overlay — canvas stays interactive (this is intentional;
    the config panel is a side panel, not a modal)
  - Scrollable content area
  - Matches shadcn Sheet semantics: slide-in, title, close button

- [ ] Create `packages/canvas/src/components/ui/Sidebar.tsx`:

  Simplified shadcn-style sidebar. Persistent layout panel that can collapse to
  icon-only mode. Used for the node toolbar (always visible, grows with node types).

  ```typescript
  import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
  import { PanelLeft } from "lucide-react";

  interface SidebarContextValue {
    collapsed: boolean;
    toggle: () => void;
  }

  const SidebarContext = createContext<SidebarContextValue>({
    collapsed: false,
    toggle: () => {},
  });

  export function useSidebar() {
    return useContext(SidebarContext);
  }

  interface SidebarProviderProps {
    children: ReactNode;
    defaultCollapsed?: boolean;
  }

  export function SidebarProvider({ children, defaultCollapsed = false }: SidebarProviderProps) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const toggle = useCallback(() => setCollapsed((c) => !c), []);

    return (
      <SidebarContext value={{ collapsed, toggle }}>
        {children}
      </SidebarContext>
    );
  }

  interface SidebarProps {
    children: ReactNode;
    className?: string;
  }

  export function Sidebar({ children, className = "" }: SidebarProps) {
    const { collapsed } = useSidebar();

    return (
      <aside
        className={`flex h-full flex-col border-r border-zinc-800 bg-zinc-900/90 backdrop-blur-sm transition-[width] duration-200 ${collapsed ? "w-12" : "w-48"} ${className}`}
      >
        {children}
      </aside>
    );
  }

  export function SidebarContent({ children }: { children: ReactNode }) {
    return (
      <div className="flex-1 overflow-y-auto p-2">
        {children}
      </div>
    );
  }

  export function SidebarFooter({ children }: { children: ReactNode }) {
    return (
      <div className="border-t border-zinc-800 p-2">
        {children}
      </div>
    );
  }

  /** Standard collapse toggle button for the sidebar footer. */
  export function SidebarTrigger() {
    const { toggle, collapsed } = useSidebar();
    return (
      <button
        onClick={toggle}
        className="flex w-full items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <PanelLeft size={14} />
      </button>
    );
  }
  ```

  Key differences from the full shadcn Sidebar:
  - No Radix dependency — pure React Context + CSS transition
  - Only the subcomponents we need: Sidebar, SidebarContent, SidebarFooter, SidebarTrigger, SidebarProvider
  - No SidebarMenu/MenuItem/SidebarGroup — our toolbar items are drag sources, not nav links
  - Collapse transitions width with `transition-[width] duration-200`
  - Collapse hides labels, shows only icons (handled by consumers via `useSidebar().collapsed`)

- [ ] Create `packages/canvas/src/components/ui/Tooltip.tsx`:

  Simple hover tooltip. CSS-only positioning (no Floating UI dependency for C1).

  ```typescript
  import { type ReactNode } from "react";

  interface TooltipProps {
    content: string;
    children: ReactNode;
    side?: "top" | "right" | "bottom" | "left";
  }

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
  };

  export function Tooltip({ content, children, side = "right" }: TooltipProps) {
    return (
      <div className="group relative inline-flex">
        {children}
        <div
          role="tooltip"
          className={`pointer-events-none absolute ${sideClasses[side]} z-50 whitespace-nowrap rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-200 opacity-0 shadow-md transition-opacity group-hover:opacity-100`}
        >
          {content}
        </div>
      </div>
    );
  }
  ```

- [ ] Create `packages/canvas/src/components/ui/Card.tsx`:

  shadcn-style card with optional hover effect for interactive cards.

  ```typescript
  import { forwardRef, type HTMLAttributes } from "react";

  interface CardProps extends HTMLAttributes<HTMLDivElement> {
    interactive?: boolean;
  }

  export const Card = forwardRef<HTMLDivElement, CardProps>(
    ({ interactive = false, className = "", children, ...props }, ref) => (
      <div
        ref={ref}
        className={`rounded-lg border border-zinc-800 bg-zinc-900 ${interactive ? "cursor-pointer transition-colors hover:border-zinc-600 hover:bg-zinc-800/80" : ""} ${className}`}
        {...props}
      >
        {children}
      </div>
    ),
  );
  Card.displayName = "Card";

  export function CardHeader({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
      <div className={`px-4 pt-4 ${className}`} {...props}>
        {children}
      </div>
    );
  }

  export function CardContent({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
      <div className={`px-4 py-3 ${className}`} {...props}>
        {children}
      </div>
    );
  }

  export function CardFooter({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
      <div className={`px-4 pb-4 text-xs text-zinc-500 ${className}`} {...props}>
        {children}
      </div>
    );
  }
  ```

### 7. Write tests

- [ ] Create `packages/canvas/src/components/ui/__tests__/Button.test.tsx`:
  - Test: renders with default variant (secondary)
  - Test: renders with primary variant
  - Test: renders with ghost variant
  - Test: disabled state applies opacity and prevents clicks
  - Test: forwards ref
  - Test: spreads additional HTML attributes
  - Test: click handler fires

- [ ] Create `packages/canvas/src/components/ui/__tests__/Dialog.test.tsx`:
  - Test: renders title and children when open
  - Test: calls onClose when Escape is pressed
  - Test: calls onClose when close button is clicked
  - Test: does not render content when open is false

  Note: jsdom doesn't fully support `<dialog>` `showModal()`. Mock it:
  ```typescript
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
  ```

- [ ] Create `packages/canvas/src/components/ui/__tests__/Sheet.test.tsx`:
  - Test: renders title and children when open
  - Test: applies translate-x-0 when open, translate-x-full when closed
  - Test: calls onClose when close button clicked
  - Test: has role="dialog" and aria-label

- [ ] Create `packages/canvas/src/components/ui/__tests__/Sidebar.test.tsx`:
  - Test: renders children
  - Test: default width is w-48 (expanded)
  - Test: collapsed width is w-12
  - Test: SidebarTrigger toggles collapsed state
  - Test: useSidebar returns collapsed state and toggle function

- [ ] Create `packages/canvas/src/components/ui/__tests__/Tooltip.test.tsx`:
  - Test: renders children
  - Test: tooltip text has role="tooltip"
  - Test: tooltip is hidden by default (opacity-0)
  - Test: applies correct side class

- [ ] Create `packages/canvas/src/components/ui/__tests__/Card.test.tsx`:
  - Test: renders children
  - Test: applies interactive hover classes when interactive=true
  - Test: CardHeader, CardContent, CardFooter render in correct order
  - Test: forwards ref

- [ ] Create `packages/canvas/src/contexts/__tests__/CanvasContext.test.tsx`:
  - Test: throws when used outside CanvasProvider
  - Test: provides selectedNodeId (initially null)
  - Test: setSelectedNodeId updates the value
  - Test: setSelectedNodeId(null) clears selection

  Note: These tests need to mock `useReactFlow` from `@xyflow/react`. Use
  `vi.mock("@xyflow/react", ...)` to return a mock instance. The mock only needs
  to return an object -- we do not test RF-specific behavior here.

  ```typescript
  vi.mock("@xyflow/react", () => ({
    useReactFlow: () => ({ screenToFlowPosition: vi.fn() }),
  }));
  ```

### 8. Verify

- [ ] Run `pnpm --filter @graphweave/canvas typecheck`
- [ ] Run `pnpm --filter @graphweave/canvas lint`
- [ ] Run `pnpm --filter @graphweave/canvas test`
- [ ] All three must pass before committing
