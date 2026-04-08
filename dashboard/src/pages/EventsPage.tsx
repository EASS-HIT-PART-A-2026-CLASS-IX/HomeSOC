import { useState, useEffect } from "react";
import { useEvents } from "../hooks/useEvents";
import { EventTable } from "../components/events/EventTable";
import { api } from "../api/client";
import { useClearData } from "../hooks/useClearData";
import { RefreshCw, Trash2 } from "lucide-react";
import { Button } from "../components/ui/button";
import { ChevronDown } from "lucide-react";
import { AgentInfo } from "../types/events";

export function EventsPage() {
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    api.getAgents().then(setAgents).catch(() => {});
  }, []);

  const params: Record<string, string | number> = { limit: 1000 };
  if (category) params.category = category;
  if (severity) params.severity = severity;

  const { events, loading, refresh } = useEvents(params);
  const { clearing, handleClear } = useClearData(api.clearEvents, refresh, "events");

  const filteredEvents = agentFilter
    ? events.filter((e) => e.agent_id === agentFilter)
    : events;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Security Events</h2>
        <div className="flex items-center gap-2">
          <Button variant="destructive" size="sm" onClick={handleClear} disabled={clearing}>
            <Trash2 className="w-3 h-3" />
            {clearing ? "Clearing..." : "Clear All"}
          </Button>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="w-3 h-3" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        {/* Category filter */}
        <div className="relative">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="appearance-none bg-card border border-border rounded-md px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer h-9"
          >
            <option value="">All Categories</option>
            <option value="process">Process</option>
            <option value="network">Network</option>
            <option value="file">File</option>
            <option value="auth">Auth</option>
            <option value="service">Service</option>
            <option value="system">System</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {/* Severity filter */}
        <div className="relative">
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="appearance-none bg-card border border-border rounded-md px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer h-9"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        </div>

        {/* Agent filter */}
        {agents.length > 0 && (
          <div className="relative">
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="appearance-none bg-card border border-border rounded-md px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer h-9"
            >
              <option value="">All Agents</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.hostname}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          </div>
        )}
      </div>

      <EventTable events={filteredEvents} loading={loading} agents={agents} />
    </div>
  );
}
