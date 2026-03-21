import { type ReactFlowInstance, useReactFlow } from "@xyflow/react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

export type SidePanelId = "config" | "state" | "history" | "schema";
export type BottomTab = "timeline" | "debug";

interface CanvasContextValue {
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  reactFlowInstance: ReactFlowInstance | null;
  stampNodeType: string | null;
  setStampNodeType: (type: string | null) => void;

  // Panel state
  activeSidePanel: SidePanelId | null;
  sidePanelVisible: boolean;
  bottomPanelVisible: boolean;
  bottomPanelMinimized: boolean;
  activeBottomTab: BottomTab;

  // Panel actions
  toggleSidePanel: (panel: SidePanelId) => void;
  openSidePanel: (panel: SidePanelId) => void;
  closeSidePanel: () => void;
  setSidePanelVisible: (visible: boolean) => void;
  setBottomPanelVisible: (visible: boolean) => void;
  setBottomPanelMinimized: (minimized: boolean) => void;
  setActiveBottomTab: (tab: BottomTab) => void;
}

const CanvasContext = createContext<CanvasContextValue | null>(null);

export function CanvasProvider({ children }: { children: ReactNode }) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [stampNodeType, setStampNodeType] = useState<string | null>(null);
  const reactFlowInstance = useReactFlow();

  const [activeSidePanel, setActiveSidePanel] = useState<SidePanelId | null>(
    null,
  );
  const [sidePanelVisible, setSidePanelVisible] = useState(false);
  const [bottomPanelVisible, setBottomPanelVisible] = useState(false);
  const [bottomPanelMinimized, setBottomPanelMinimized] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<BottomTab>("timeline");

  const toggleSidePanel = useCallback(
    (panel: SidePanelId) => {
      if (activeSidePanel === panel && sidePanelVisible) {
        setSidePanelVisible(false);
      } else {
        setActiveSidePanel(panel);
        setSidePanelVisible(true);
      }
    },
    [activeSidePanel, sidePanelVisible],
  );

  const openSidePanel = useCallback((panel: SidePanelId) => {
    setActiveSidePanel(panel);
    setSidePanelVisible(true);
  }, []);

  const closeSidePanel = useCallback(() => {
    setSidePanelVisible(false);
  }, []);

  return (
    <CanvasContext
      value={{
        selectedNodeId,
        setSelectedNodeId,
        reactFlowInstance,
        stampNodeType,
        setStampNodeType,
        activeSidePanel,
        sidePanelVisible,
        bottomPanelVisible,
        bottomPanelMinimized,
        activeBottomTab,
        toggleSidePanel,
        openSidePanel,
        closeSidePanel,
        setSidePanelVisible,
        setBottomPanelVisible,
        setBottomPanelMinimized,
        setActiveBottomTab,
      }}
    >
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
