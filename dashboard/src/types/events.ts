export type Platform = "macos" | "network";
export type EventCategory = "process" | "file" | "network" | "auth" | "authz" | "service" | "system";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved" | "false_positive";
export type AgentStatus = "online" | "offline" | "stopped" | "unknown";

export interface SecurityEvent {
  id: string;
  timestamp: string;
  received_at: string;
  agent_id: string;
  platform: Platform;
  category: EventCategory;
  event_type: string;
  severity: Severity;
  process_name?: string;
  process_pid?: number;
  process_ppid?: number;
  process_path?: string;
  process_user?: string;
  process_args?: string[];
  process_hash?: string;
  file_path?: string;
  file_action?: string;
  src_ip?: string;
  src_port?: number;
  dst_ip?: string;
  dst_port?: number;
  protocol?: string;
  dns_query?: string;
  auth_user?: string;
  auth_method?: string;
  auth_success?: boolean;
  raw?: Record<string, unknown>;
  source: string;
}

export interface Alert {
  id: string;
  rule_id: string;
  rule_name: string;
  severity: Severity;
  title: string;
  description?: string;
  event_ids: string[];
  status: AlertStatus;
  created_at: string;
  resolved_at?: string;
}

export interface AgentInfo {
  id: string;
  hostname: string;
  platform: Platform;
  ip_address?: string;
  version: string;
  last_heartbeat?: string;
  status: AgentStatus;
}

export interface DashboardSummary {
  total_events_24h: number;
  total_alerts_open: number;
  agents_online: number;
  agents_total: number;
  events_by_category: Record<string, number>;
  events_by_severity: Record<string, number>;
  recent_alerts: Alert[];
  rules_count: number;
}

export interface WebSocketMessage {
  type: "event" | "alert" | "agent_status";
  data: SecurityEvent | Alert | AgentInfo;
}
