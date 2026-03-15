import { useUIStore } from "../uiSlice";

beforeEach(() => {
  useUIStore.setState({
    currentView: "home",
    newGraphDialogOpen: false,
  });
});

describe("uiSlice", () => {
  it('initial currentView is "home"', () => {
    expect(useUIStore.getState().currentView).toBe("home");
  });

  it("setView changes currentView", () => {
    useUIStore.getState().setView("canvas");
    expect(useUIStore.getState().currentView).toBe("canvas");
  });

  it("initial newGraphDialogOpen is false", () => {
    expect(useUIStore.getState().newGraphDialogOpen).toBe(false);
  });

  it("setNewGraphDialogOpen toggles dialog state", () => {
    useUIStore.getState().setNewGraphDialogOpen(true);
    expect(useUIStore.getState().newGraphDialogOpen).toBe(true);
    useUIStore.getState().setNewGraphDialogOpen(false);
    expect(useUIStore.getState().newGraphDialogOpen).toBe(false);
  });
});
