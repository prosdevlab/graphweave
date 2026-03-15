import { PanelLeft } from "lucide-react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

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

export function SidebarProvider({
  children,
  defaultCollapsed = false,
}: SidebarProviderProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const toggle = useCallback(() => setCollapsed((c) => !c), []);

  return (
    <SidebarContext value={{ collapsed, toggle }}>{children}</SidebarContext>
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
  return <div className="flex-1 overflow-y-auto p-2">{children}</div>;
}

export function SidebarFooter({ children }: { children: ReactNode }) {
  return <div className="border-t border-zinc-800 p-2">{children}</div>;
}

export function SidebarTrigger() {
  const { toggle, collapsed } = useSidebar();
  return (
    <button
      onClick={toggle}
      className="flex w-full items-center justify-center rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      type="button"
    >
      <PanelLeft size={14} />
    </button>
  );
}
