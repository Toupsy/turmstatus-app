import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useStore } from "./store";
import { connectWs, disconnectWs } from "./ws";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import MapView from "./pages/MapView";
import Dashboard from "./pages/Dashboard";
import GuardPanel from "./pages/GuardPanel";
import TowerPanel from "./pages/TowerPanel";
import AdminUsers from "./pages/AdminUsers";
import AdminTowers from "./pages/AdminTowers";
import AuditView from "./pages/AuditView";

function Protected({ children, roles }) {
  const user = useStore((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loadMe, refreshAll } = useStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      if (localStorage.getItem("token")) {
        const me = await loadMe();
        if (me) await refreshAll();
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (user) {
      connectWs();
      return () => disconnectWs();
    }
  }, [user]);

  if (!ready) return null;

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route index element={<MapView />} />
        <Route
          path="dashboard"
          element={
            <Protected roles={["HAUPTWACHE"]}>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="meine-wache"
          element={
            <Protected roles={["WACHGAENGER"]}>
              <GuardPanel />
            </Protected>
          }
        />
        <Route
          path="mein-turm"
          element={
            <Protected roles={["TURMFUEHRER"]}>
              <TowerPanel />
            </Protected>
          }
        />
        <Route
          path="turme-boote"
          element={
            <Protected roles={["HAUPTWACHE"]}>
              <AdminTowers />
            </Protected>
          }
        />
        <Route
          path="benutzer"
          element={
            <Protected roles={["HAUPTWACHE"]}>
              <AdminUsers />
            </Protected>
          }
        />
        <Route
          path="audit"
          element={
            <Protected roles={["HAUPTWACHE"]}>
              <AuditView />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
