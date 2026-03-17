import {
  cancelRun,
  connectStream,
  getRunStatus,
  resumeRun,
  startRun,
} from "../runs";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../client", () => ({
  apiUrl: (path: string) => `/api${path}`,
  request: vi.fn(),
}));

const { request } = await import("../client");

class MockEventSource {
  url: string;
  listeners = new Map<string, ((e: MessageEvent) => void)[]>();
  onerror: ((e: Event) => void) | null = null;
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    mockEventSourceInstances.push(this);
  }

  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(fn);
    this.listeners.set(type, existing);
  }

  emit(type: string, data: unknown, id?: string) {
    const fns = this.listeners.get(type);
    if (!fns) return;
    for (const fn of fns) {
      fn({ data: JSON.stringify(data), lastEventId: id ?? "" } as MessageEvent);
    }
  }
}

let mockEventSourceInstances: MockEventSource[] = [];
vi.stubGlobal("EventSource", MockEventSource);

function latestSource(): MockEventSource {
  const s = mockEventSourceInstances[mockEventSourceInstances.length - 1];
  if (!s) throw new Error("No EventSource created");
  return s;
}

function lastRequestBody(): unknown {
  const calls = vi.mocked(request).mock.calls;
  const call = calls[calls.length - 1];
  if (!call) throw new Error("No request calls");
  const opts = call[1] as RequestInit | undefined;
  return JSON.parse(opts?.body as string);
}

function lastRequestPath(): string {
  const calls = vi.mocked(request).mock.calls;
  const call = calls[calls.length - 1];
  if (!call) throw new Error("No request calls");
  return call[0] as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEventSourceInstances = [];
});

// ---------------------------------------------------------------------------
// REST endpoints
// ---------------------------------------------------------------------------

describe("startRun", () => {
  it("calls correct URL with encoded graph ID", async () => {
    vi.mocked(request).mockResolvedValue({ run_id: "r1", status: "running" });
    await startRun("my graph#1", { key: "val" });
    expect(request).toHaveBeenCalledWith(
      "/graphs/my%20graph%231/run",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("wraps input in { input } body", async () => {
    vi.mocked(request).mockResolvedValue({ run_id: "r1", status: "running" });
    await startRun("g1", { foo: "bar" });
    expect(lastRequestBody()).toEqual({ input: { foo: "bar" } });
  });

  it("defaults input to empty object", async () => {
    vi.mocked(request).mockResolvedValue({ run_id: "r1", status: "running" });
    await startRun("g1");
    expect(lastRequestBody()).toEqual({ input: {} });
  });
});

describe("resumeRun", () => {
  it("wraps input in { input } body", async () => {
    vi.mocked(request).mockResolvedValue({ status: "resumed" });
    await resumeRun("r1", "user response");
    expect(lastRequestPath()).toBe("/runs/r1/resume");
    expect(lastRequestBody()).toEqual({ input: "user response" });
  });
});

describe("cancelRun", () => {
  it("sends POST to correct URL", async () => {
    vi.mocked(request).mockResolvedValue(undefined);
    await cancelRun("r1");
    expect(request).toHaveBeenCalledWith(
      "/runs/r1/cancel",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("getRunStatus", () => {
  it("calls correct URL and returns response", async () => {
    const status = { run_id: "r1", status: "running" };
    vi.mocked(request).mockResolvedValue(status);
    const result = await getRunStatus("r1");
    expect(request).toHaveBeenCalledWith("/runs/r1/status");
    expect(result).toEqual(status);
  });
});

// ---------------------------------------------------------------------------
// SSE stream
// ---------------------------------------------------------------------------

describe("connectStream", () => {
  it("creates EventSource with correct URL through apiUrl", () => {
    connectStream("r1", { onEvent: vi.fn(), onError: vi.fn() });
    expect(latestSource().url).toBe("/api/runs/r1/stream");
  });

  it("encodes run ID in URL", () => {
    connectStream("run #1", { onEvent: vi.fn(), onError: vi.fn() });
    expect(latestSource().url).toBe("/api/runs/run%20%231/stream");
  });

  it("adds last_event_id query param when > 0", () => {
    connectStream("r1", { onEvent: vi.fn(), onError: vi.fn() }, 5);
    expect(latestSource().url).toBe("/api/runs/r1/stream?last_event_id=5");
  });

  it("omits query param when lastEventId is 0", () => {
    connectStream("r1", { onEvent: vi.fn(), onError: vi.fn() }, 0);
    expect(latestSource().url).toBe("/api/runs/r1/stream");
  });

  it("listens for all 7 event types", () => {
    connectStream("r1", { onEvent: vi.fn(), onError: vi.fn() });
    const types = [...latestSource().listeners.keys()];
    expect(types).toEqual([
      "run_started",
      "node_started",
      "node_completed",
      "edge_traversed",
      "graph_paused",
      "graph_completed",
      "error",
    ]);
  });

  it("passes parsed event and eventId to onEvent", () => {
    const onEvent = vi.fn();
    connectStream("r1", { onEvent, onError: vi.fn() });
    latestSource().emit("node_started", { node_id: "n1", timestamp: "t" }, "3");
    expect(onEvent).toHaveBeenCalledWith(
      { event: "node_started", data: { node_id: "n1", timestamp: "t" } },
      3,
    );
  });

  it("passes null eventId when lastEventId is empty", () => {
    const onEvent = vi.fn();
    connectStream("r1", { onEvent, onError: vi.fn() });
    latestSource().emit("run_started", { run_id: "r1", timestamp: "t" });
    expect(onEvent).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("handles JSON parse errors without crashing", () => {
    const onEvent = vi.fn();
    connectStream("r1", { onEvent, onError: vi.fn() });
    const fns = latestSource().listeners.get("node_started") ?? [];
    const handler = fns[0];
    if (!handler) throw new Error("Expected listener");
    handler({ data: "not json", lastEventId: "" } as MessageEvent);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("calls onError and closes source on onerror", () => {
    const onError = vi.fn();
    connectStream("r1", { onEvent: vi.fn(), onError });
    const source = latestSource();
    source.onerror?.(new Event("error"));
    expect(source.close).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it("cleanup function closes EventSource", () => {
    const cleanup = connectStream("r1", {
      onEvent: vi.fn(),
      onError: vi.fn(),
    });
    const source = latestSource();
    cleanup();
    expect(source.close).toHaveBeenCalled();
  });
});
