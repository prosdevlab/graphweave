import { useUIStore } from "../uiSlice";

beforeEach(() => {
  useUIStore.setState({
    newGraphDialogOpen: false,
    toastMessage: null,
    toastVariant: "info",
  });
});

describe("uiSlice", () => {
  it("initial newGraphDialogOpen is false", () => {
    expect(useUIStore.getState().newGraphDialogOpen).toBe(false);
  });

  it("setNewGraphDialogOpen toggles dialog state", () => {
    useUIStore.getState().setNewGraphDialogOpen(true);
    expect(useUIStore.getState().newGraphDialogOpen).toBe(true);
    useUIStore.getState().setNewGraphDialogOpen(false);
    expect(useUIStore.getState().newGraphDialogOpen).toBe(false);
  });

  it("showToast sets message and default variant", () => {
    useUIStore.getState().showToast("Hello");
    expect(useUIStore.getState().toastMessage).toBe("Hello");
    expect(useUIStore.getState().toastVariant).toBe("info");
  });

  it("showToast sets message with custom variant", () => {
    useUIStore.getState().showToast("Oops", "error");
    expect(useUIStore.getState().toastMessage).toBe("Oops");
    expect(useUIStore.getState().toastVariant).toBe("error");
  });

  it("dismissToast clears the message", () => {
    useUIStore.getState().showToast("Hello");
    useUIStore.getState().dismissToast();
    expect(useUIStore.getState().toastMessage).toBeNull();
  });
});
