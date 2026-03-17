import type { GraphEvent } from "@shared/events";
import { useRunStore } from "../runSlice";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@api/runs", () => ({
  startRun: vi.fn(),
  connectStream: vi.fn(() => vi.fn()),
  cancelRun: vi.fn(),
  resumeRun: vi.fn(),
  getRunStatus: vi.fn(),
}));

vi.mock("@api/client", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@store/uiSlice", () => ({
  useUIStore: { getState: () => ({ showToast: vi.fn() }) },
}));

const runsApi = await import("@api/runs");

let mockCleanup: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockCleanup = vi.fn();
  vi.mocked(runsApi.connectStream).mockReturnValue(mockCleanup as () => void);
  useRunStore.setState({
    activeRunId: null,
    runStatus: "idle",
    activeNodeId: null,
    runOutput: [],
    reconnectAttempts: 0,
    lastEventId: 0,
    finalState: null,
    durationMs: null,
    errorMessage: null,
    pausedPrompt: null,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function event<E extends GraphEvent["event"]>(
  type: E,
  data: Extract<GraphEvent, { event: E }>["data"],
): GraphEvent {
  return { event: type, data } as GraphEvent;
}

// ---------------------------------------------------------------------------
// startRun
// ---------------------------------------------------------------------------

describe("startRun", () => {
  it("transitions idle → running and sets activeRunId", async () => {
    vi.mocked(runsApi.startRun).mockResolvedValue({
      run_id: "r1",
      status: "running",
    });
    await useRunStore.getState().startRun("g1");
    const s = useRunStore.getState();
    expect(s.runStatus).toBe("running");
    expect(s.activeRunId).toBe("r1");
  });

  it("connects SSE stream after API call", async () => {
    vi.mocked(runsApi.startRun).mockResolvedValue({
      run_id: "r1",
      status: "running",
    });
    await useRunStore.getState().startRun("g1");
    expect(runsApi.connectStream).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ onEvent: expect.any(Function) }),
    );
  });

  it("sets error status and message on API failure", async () => {
    const { ApiError } = await import("@api/client");
    vi.mocked(runsApi.startRun).mockRejectedValue(
      new ApiError("Validation failed", 422),
    );
    await useRunStore.getState().startRun("g1");
    const s = useRunStore.getState();
    expect(s.runStatus).toBe("error");
    expect(s.errorMessage).toBe("Validation failed");
  });

  it("passes graphId raw to API (no double-encoding)", async () => {
    vi.mocked(runsApi.startRun).mockResolvedValue({
      run_id: "r1",
      status: "running",
    });
    await useRunStore.getState().startRun("my graph#1");
    expect(runsApi.startRun).toHaveBeenCalledWith("my graph#1", undefined);
  });
});

// ---------------------------------------------------------------------------
// _handleEvent
// ---------------------------------------------------------------------------

describe("_handleEvent", () => {
  it("run_started sets running status", () => {
    useRunStore.setState({ runStatus: "running" });
    useRunStore
      .getState()
      ._handleEvent(event("run_started", { run_id: "r1", timestamp: "t" }), 1);
    expect(useRunStore.getState().runStatus).toBe("running");
    expect(useRunStore.getState().runOutput).toHaveLength(1);
  });

  it("node_started sets activeNodeId", () => {
    useRunStore.setState({ runStatus: "running" });
    useRunStore
      .getState()
      ._handleEvent(
        event("node_started", { node_id: "n1", timestamp: "t" }),
        2,
      );
    expect(useRunStore.getState().activeNodeId).toBe("n1");
  });

  it("node_completed appends to output", () => {
    useRunStore.setState({ runStatus: "running", activeNodeId: "n1" });
    useRunStore.getState()._handleEvent(
      event("node_completed", {
        node_id: "n1",
        output: {},
        state_snapshot: {},
        duration_ms: 100,
      }),
      3,
    );
    // activeNodeId stays until next node_started
    expect(useRunStore.getState().activeNodeId).toBe("n1");
    expect(useRunStore.getState().runOutput).toHaveLength(1);
  });

  it("graph_paused sets paused status and prompt", () => {
    useRunStore.setState({ runStatus: "running" });
    useRunStore.getState()._handleEvent(
      event("graph_paused", {
        node_id: "n1",
        prompt: "What next?",
        run_id: "r1",
      }),
      4,
    );
    const s = useRunStore.getState();
    expect(s.runStatus).toBe("paused");
    expect(s.pausedPrompt).toBe("What next?");
    expect(s.activeNodeId).toBe("n1");
  });

  it("graph_completed sets completed status with final state", () => {
    useRunStore.setState({ runStatus: "running" });
    useRunStore.getState()._handleEvent(
      event("graph_completed", {
        final_state: { result: "ok" },
        duration_ms: 500,
      }),
      5,
    );
    const s = useRunStore.getState();
    expect(s.runStatus).toBe("completed");
    expect(s.activeNodeId).toBeNull();
    expect(s.finalState).toEqual({ result: "ok" });
    expect(s.durationMs).toBe(500);
  });

  it("non-recoverable error sets error status", () => {
    useRunStore.setState({ runStatus: "running", activeNodeId: "n1" });
    useRunStore.getState()._handleEvent(
      event("error", {
        node_id: "n1",
        message: "LLM failed",
        recoverable: false,
      }),
      6,
    );
    const s = useRunStore.getState();
    expect(s.runStatus).toBe("error");
    expect(s.errorMessage).toBe("LLM failed");
  });

  it("recoverable error does not change status", () => {
    useRunStore.setState({ runStatus: "running" });
    useRunStore.getState()._handleEvent(
      event("error", {
        message: "Rate limited, retrying",
        recoverable: true,
      }),
      7,
    );
    expect(useRunStore.getState().runStatus).toBe("running");
    expect(useRunStore.getState().runOutput).toHaveLength(1);
  });

  it("tracks lastEventId", () => {
    useRunStore.setState({ runStatus: "running" });
    useRunStore
      .getState()
      ._handleEvent(event("run_started", { run_id: "r1", timestamp: "t" }), 5);
    expect(useRunStore.getState().lastEventId).toBe(5);
  });

  it("onerror after graph_completed does not change status", () => {
    useRunStore.setState({ runStatus: "running" });
    // Terminal event
    useRunStore.getState()._handleEvent(
      event("graph_completed", {
        final_state: {},
        duration_ms: 100,
      }),
      10,
    );
    expect(useRunStore.getState().runStatus).toBe("completed");
    // onerror fires after EventSource.close()
    useRunStore.getState()._handleStreamError(new Error("connection lost"));
    expect(useRunStore.getState().runStatus).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// cancelRun
// ---------------------------------------------------------------------------

describe("cancelRun", () => {
  it("sends cancel and resets to idle", async () => {
    vi.mocked(runsApi.cancelRun).mockResolvedValue(undefined);
    useRunStore.setState({ activeRunId: "r1", runStatus: "running" });
    await useRunStore.getState().cancelRun();
    expect(runsApi.cancelRun).toHaveBeenCalledWith("r1");
    expect(useRunStore.getState().runStatus).toBe("idle");
  });

  it("does nothing when no active run", async () => {
    await useRunStore.getState().cancelRun();
    expect(runsApi.cancelRun).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// resumeRun
// ---------------------------------------------------------------------------

describe("resumeRun", () => {
  it("opens SSE before calling resume API (race condition fix)", async () => {
    vi.mocked(runsApi.resumeRun).mockResolvedValue({ status: "resumed" });
    useRunStore.setState({ activeRunId: "r1", runStatus: "paused" });

    const callOrder: string[] = [];
    vi.mocked(runsApi.connectStream).mockImplementation(() => {
      callOrder.push("connectStream");
      return vi.fn();
    });
    vi.mocked(runsApi.resumeRun).mockImplementation(async () => {
      callOrder.push("resumeRun");
      return { status: "resumed" };
    });

    await useRunStore.getState().resumeRun("user input");
    expect(callOrder).toEqual(["connectStream", "resumeRun"]);
  });

  it("sets running status and clears pausedPrompt", async () => {
    vi.mocked(runsApi.resumeRun).mockResolvedValue({ status: "resumed" });
    useRunStore.setState({
      activeRunId: "r1",
      runStatus: "paused",
      pausedPrompt: "What?",
    });
    await useRunStore.getState().resumeRun("answer");
    expect(useRunStore.getState().runStatus).toBe("running");
    expect(useRunStore.getState().pausedPrompt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resetRun
// ---------------------------------------------------------------------------

describe("resetRun", () => {
  it("cleans up everything", () => {
    useRunStore.setState({
      activeRunId: "r1",
      runStatus: "running",
      activeNodeId: "n1",
      runOutput: [event("run_started", { run_id: "r1", timestamp: "t" })],
    });
    useRunStore.getState().resetRun();
    const s = useRunStore.getState();
    expect(s.runStatus).toBe("idle");
    expect(s.activeRunId).toBeNull();
    expect(s.activeNodeId).toBeNull();
    expect(s.runOutput).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// _handleStreamError
// ---------------------------------------------------------------------------

describe("_handleStreamError", () => {
  it("sets reconnecting and attempts status recovery", async () => {
    vi.useFakeTimers();
    vi.mocked(runsApi.getRunStatus).mockResolvedValue({
      run_id: "r1",
      graph_id: "g1",
      status: "completed",
      node_id: null,
      prompt: null,
      final_state: { done: true },
      duration_ms: 500,
      error: null,
    });
    useRunStore.setState({ activeRunId: "r1", runStatus: "running" });
    const promise = useRunStore
      .getState()
      ._handleStreamError(new Error("lost"));
    expect(useRunStore.getState().runStatus).toBe("reconnecting");
    expect(useRunStore.getState().reconnectAttempts).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    expect(useRunStore.getState().runStatus).toBe("completed");
    expect(useRunStore.getState().finalState).toEqual({ done: true });
    vi.useRealTimers();
  });

  it("gives up after 3 failed attempts", async () => {
    vi.useFakeTimers();
    vi.mocked(runsApi.getRunStatus).mockRejectedValue(new Error("network"));
    useRunStore.setState({ activeRunId: "r1", runStatus: "running" });

    // Attempt 1
    const promise = useRunStore
      .getState()
      ._handleStreamError(new Error("lost"));
    await vi.advanceTimersByTimeAsync(1000);
    await promise;
    // Attempt 2 (recursive from catch)
    await vi.advanceTimersByTimeAsync(2000);
    // Attempt 3
    await vi.advanceTimersByTimeAsync(4000);
    // Allow all microtasks
    await vi.advanceTimersByTimeAsync(10000);

    expect(useRunStore.getState().runStatus).toBe("connection_lost");
    vi.useRealTimers();
  });

  it("ignores error when already completed", () => {
    useRunStore.setState({ runStatus: "completed" });
    useRunStore.getState()._handleStreamError(new Error("lost"));
    expect(useRunStore.getState().runStatus).toBe("completed");
  });

  it("ignores error when no activeRunId", () => {
    useRunStore.setState({ runStatus: "running", activeRunId: null });
    useRunStore.getState()._handleStreamError(new Error("lost"));
    expect(useRunStore.getState().runStatus).toBe("running");
  });
});
