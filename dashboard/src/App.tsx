import React from "react";
import { Navigate, BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { EventsPage } from "./pages/EventsPage";
import { AlertsPage } from "./pages/AlertsPage";
import { AgentsPage } from "./pages/AgentsPage";
import { RulesPage } from "./pages/RulesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { GuidePage } from "./pages/GuidePage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsProvider } from "./contexts/SettingsContext";
import { useWebSocketProvider, WebSocketProvider } from "./hooks/useWebSocket";

function RequireAuth({ children }: { children: React.ReactNode }) {
  return localStorage.getItem("homesoc_token")
    ? <>{children}</>
    : <Navigate to="/login" replace />;
}

function AppInner() {
  const wsState = useWebSocketProvider();

  return (
    <WebSocketProvider value={wsState}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={
            <RequireAuth>
              <Layout status={wsState.status} onToggle={wsState.toggle} />
            </RequireAuth>
          }>
            <Route index element={<DashboardPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/agents" element={<AgentsPage />} />
            <Route path="/rules" element={<RulesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/guide" element={<GuidePage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WebSocketProvider>
  );
}

export default function App() {
  return (
    <SettingsProvider>
      <AppInner />
    </SettingsProvider>
  );
}
