import { Navigate, Route, Routes } from "react-router";
import { CanvasRoute } from "./components/canvas/CanvasRoute";
import { HomeView } from "./components/home/HomeView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeView />} />
      <Route path="/graph/:id" element={<CanvasRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
