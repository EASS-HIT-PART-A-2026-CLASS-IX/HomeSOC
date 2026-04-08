import { useEffect, useCallback, useState, createContext, useContext } from "react";
import { wsManager } from "../api/websocket";
import { SecurityEvent, Alert, WebSocketMessage } from "../types/events";
import { api } from "../api/client";
import { useSettings } from "../contexts/SettingsContext";

const MAX_EVENTS = 500;
const MAX_ALERTS = 50;

export type ConnectionStatus = "live" | "connecting" | "disconnected" | "paused";

interface WebSocketState {
  liveEvents: SecurityEvent[];
  liveAlerts: Alert[];
  connected: boolean;
  status: ConnectionStatus;
  agentVersion: number;
  toggle: () => void;
}

const WebSocketContext = createContext<WebSocketState>({
  liveEvents: [],
  liveAlerts: [],
  connected: false,
  status: "disconnected",
  agentVersion: 0,
  toggle: () => {},
});

export const WebSocketProvider = WebSocketContext.Provider;

export function useWebSocketProvider(): WebSocketState {
  const [liveEvents, setLiveEvents] = useState<SecurityEvent[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<Alert[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [agentVersion, setAgentVersion] = useState(0);
  const { settings } = useSettings();

  // Load historical events and alerts on mount
  useEffect(() => {
    const loadHistorical = async () => {
      try {
        const [events, alerts] = await Promise.all([
          api.getEvents({ limit: 200 }),
          api.getAlerts({ limit: 50 }),
        ]);
        setLiveEvents(events);
        setLiveAlerts(alerts);
      } catch (e) {
        console.error("Failed to load historical data:", e);
      }
    };
    loadHistorical();
  }, []);

  const handleMessage = useCallback(
    (msg: WebSocketMessage) => {
      if (msg.type === "event") {
        setLiveEvents((prev) => {
          const next = [msg.data as SecurityEvent, ...prev];
          return next.slice(0, MAX_EVENTS);
        });
      } else if (msg.type === "agent_status") {
        setAgentVersion((v) => v + 1);
      } else if (msg.type === "alert") {
        const alert = msg.data as Alert;
        setLiveAlerts((prev) => {
          const next = [alert, ...prev];
          return next.slice(0, MAX_ALERTS);
        });

        // Browser notification for high/critical alerts
        if (
          settings.notifyOnHighAlerts &&
          (alert.severity === "high" || alert.severity === "critical") &&
          Notification.permission === "granted"
        ) {
          new Notification(`HomeSOC Alert: ${alert.severity.toUpperCase()}`, {
            body: alert.rule_name + (alert.description ? `\n${alert.description}` : ""),
            icon: "/favicon.svg",
          });
        }
      }
    },
    [settings.notifyOnHighAlerts]
  );

  // Subscribe/unsubscribe the message handler whenever it changes
  useEffect(() => {
    const unsub = wsManager.subscribe(handleMessage);
    return () => unsub();
  }, [handleMessage]);

  // Connect once on mount, disconnect on unmount
  // Use resume() instead of connect() so _paused is always reset first —
  // this handles React Strict Mode's double-invoke (mount→cleanup→remount).
  useEffect(() => {
    const unsubStatus = wsManager.onStatusChange(setStatus);
    wsManager.resume();
    const pingInterval = setInterval(() => wsManager.sendPing(), 30000);
    return () => {
      unsubStatus();
      clearInterval(pingInterval);
      wsManager.disconnect();
    };
  }, []);

  const toggle = useCallback(() => {
    if (wsManager.paused) {
      wsManager.resume();
      setStatus("connecting");
    } else {
      wsManager.pause();
      setStatus("paused");
    }
  }, []);

  return {
    liveEvents,
    liveAlerts,
    connected: status === "live",
    status,
    agentVersion,
    toggle,
  };
}

export function useWebSocket(): WebSocketState {
  return useContext(WebSocketContext);
}
