import { useCanvasContext } from "@contexts/CanvasContext";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CanvasProvider } from "@contexts/CanvasContext";
import { useGraphStore } from "@store/graphSlice";
import { useRunStore } from "@store/runSlice";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { useBeforeUnload } from "../../hooks/useBeforeUnload";
import { NodeConfigPanel } from "../panels/NodeConfigPanel";
import { RunHistoryPanel } from "../panels/RunHistoryPanel";
import { RunPanel } from "../panels/RunPanel";
import { SchemaPanel } from "../panels/SchemaPanel";
import { StateInspector } from "../panels/StateInspector";
import { StatePanel } from "../panels/StatePanel";
import { ResizeHandle } from "../ui/ResizeHandle";
import { ActivityBar } from "./ActivityBar";
import { BottomPanel } from "./BottomPanel";
import { CanvasHeader } from "./CanvasHeader";
import { GraphCanvas } from "./GraphCanvas";
import { SidePanel } from "./SidePanel";

// ── Panel size persistence ──────────────────────────────────────────

const STORAGE_KEY = "gw-panel-sizes";
const DEFAULT_SIDE_WIDTH = 320;
const DEFAULT_BOTTOM_HEIGHT = 256;
const MIN_SIDE_WIDTH = 240;
const MAX_SIDE_WIDTH = 480;
const MIN_BOTTOM_HEIGHT = 120;
const MAX_BOTTOM_HEIGHT = 600;

function loadPanelSizes(): { sideWidth: number; bottomHeight: number } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sideWidth: Math.max(
          MIN_SIDE_WIDTH,
          Math.min(MAX_SIDE_WIDTH, parsed.sideWidth ?? DEFAULT_SIDE_WIDTH),
        ),
        bottomHeight: Math.max(
          MIN_BOTTOM_HEIGHT,
          Math.min(
            MAX_BOTTOM_HEIGHT,
            parsed.bottomHeight ?? DEFAULT_BOTTOM_HEIGHT,
          ),
        ),
      };
    }
  } catch {
    // ignore parse errors
  }
  return { sideWidth: DEFAULT_SIDE_WIDTH, bottomHeight: DEFAULT_BOTTOM_HEIGHT };
}

function savePanelSizes(sizes: { sideWidth: number; bottomHeight: number }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // ignore quota errors
  }
}

// ── CanvasRoute (outer) ─────────────────────────────────────────────

export function CanvasRoute() {
  const { id } = useParams<{ id: string }>();
  const graph = useGraphStore((s) => s.graph);
  const saveError = useGraphStore((s) => s.saveError);
  const loadGraph = useGraphStore((s) => s.loadGraph);
  const [loading, setLoading] = useState(true);

  useBeforeUnload();

  const resetRun = useRunStore((s) => s.resetRun);
  const prevIdRef = useRef(id);
  useEffect(() => {
    if (prevIdRef.current !== id) {
      resetRun();
    }
    prevIdRef.current = id;
  }, [id, resetRun]);

  useEffect(() => {
    if (!id) return;
    if (graph?.id === id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadGraph(id).finally(() => setLoading(false));
  }, [id, graph?.id, loadGraph]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-100">
        <span className="text-sm text-zinc-500">Loading graph...</span>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-zinc-950 text-zinc-100">
        <p className="mb-4 text-sm text-zinc-400">
          {saveError || "Graph not found"}
        </p>
        <Link to="/" className="text-sm text-indigo-400 hover:text-indigo-300">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <CanvasProvider>
        <CanvasWorkspace />
      </CanvasProvider>
    </ReactFlowProvider>
  );
}

// ── CanvasWorkspace (inner, uses CanvasContext) ──────────────────────

function CanvasWorkspace() {
  const {
    activeSidePanel,
    sidePanelVisible,
    bottomPanelVisible,
    bottomPanelMinimized,
    activeBottomTab,
    toggleSidePanel,
    setBottomPanelVisible,
    setBottomPanelMinimized,
  } = useCanvasContext();

  const runStatus = useRunStore((s) => s.runStatus);

  // Panel sizes with localStorage persistence (parse once)
  const [sizes] = useState(loadPanelSizes);
  const [sideWidth, setSideWidth] = useState(sizes.sideWidth);
  const [bottomHeight, setBottomHeight] = useState(sizes.bottomHeight);
  const sideWidthRef = useRef(sideWidth);
  const bottomHeightRef = useRef(bottomHeight);
  useEffect(() => {
    sideWidthRef.current = sideWidth;
  }, [sideWidth]);
  useEffect(() => {
    bottomHeightRef.current = bottomHeight;
  }, [bottomHeight]);

  // Auto-open bottom panel on run start
  const prevRunStatus = useRef(runStatus);
  useEffect(() => {
    if (prevRunStatus.current === "idle" && runStatus !== "idle") {
      setBottomPanelVisible(true);
      setBottomPanelMinimized(false);
    }
    prevRunStatus.current = runStatus;
  }, [runStatus, setBottomPanelVisible, setBottomPanelMinimized]);

  // Keyboard shortcuts: Cmd+1-4 for side panels, Cmd+J for bottom
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.metaKey && !e.ctrlKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      const panels = ["config", "state", "history", "schema"] as const;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < panels.length) {
        e.preventDefault();
        const panel = panels[idx];
        if (panel) toggleSidePanel(panel);
        return;
      }
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setBottomPanelVisible(!bottomPanelVisible);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidePanel, bottomPanelVisible, setBottomPanelVisible]);

  // Resize handlers
  const handleSideResize = useCallback((delta: number) => {
    setSideWidth((w) =>
      Math.max(MIN_SIDE_WIDTH, Math.min(MAX_SIDE_WIDTH, w - delta)),
    );
  }, []);

  const handleBottomResize = useCallback((delta: number) => {
    setBottomHeight((h) => {
      const maxH = window.innerHeight * 0.5;
      return Math.max(MIN_BOTTOM_HEIGHT, Math.min(maxH, h - delta));
    });
  }, []);

  const handleResizeEnd = useCallback(() => {
    savePanelSizes({
      sideWidth: sideWidthRef.current,
      bottomHeight: bottomHeightRef.current,
    });
  }, []);

  const showSidePanel = sidePanelVisible && activeSidePanel !== null;
  const showBottomPanel = bottomPanelVisible;

  return (
    <div className="h-screen w-screen bg-zinc-950 text-zinc-100">
      <CanvasHeader />
      <main className="flex h-[calc(100vh-3rem)]">
        <ActivityBar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1">
            <GraphCanvas />
          </div>
          {showBottomPanel && !bottomPanelMinimized && (
            <ResizeHandle
              direction="horizontal"
              onResize={handleBottomResize}
              onResizeEnd={handleResizeEnd}
            />
          )}
          {showBottomPanel && (
            <BottomPanel height={bottomHeight}>
              {activeBottomTab === "timeline" && <RunPanel />}
              {activeBottomTab === "debug" && <StateInspector />}
            </BottomPanel>
          )}
        </div>
        {showSidePanel && (
          <>
            <ResizeHandle
              direction="vertical"
              onResize={handleSideResize}
              onResizeEnd={handleResizeEnd}
            />
            <SidePanel width={sideWidth}>
              {activeSidePanel === "config" && <NodeConfigPanel />}
              {activeSidePanel === "state" && <StatePanel />}
              {activeSidePanel === "history" && <RunHistoryPanel />}
              {activeSidePanel === "schema" && <SchemaPanel />}
            </SidePanel>
          </>
        )}
      </main>
    </div>
  );
}
