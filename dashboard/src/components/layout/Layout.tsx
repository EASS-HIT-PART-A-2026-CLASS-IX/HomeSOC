import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import type { ConnectionStatus } from "../../hooks/useWebSocket";

interface LayoutProps {
  status: ConnectionStatus;
  onToggle: () => void;
}

// Pages that manage their own full-height layout (no padding)
const FULL_HEIGHT_ROUTES = ["/rules"];

export function Layout({ status, onToggle }: LayoutProps) {
  const { pathname } = useLocation();

  const isFullHeight = FULL_HEIGHT_ROUTES.includes(pathname);

  return (
    <div className="min-h-screen bg-soc-bg">
      <Sidebar />
      <div className="ml-14">
        <Header status={status} onToggle={onToggle} />
        <main className={isFullHeight ? "" : "p-6"}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
