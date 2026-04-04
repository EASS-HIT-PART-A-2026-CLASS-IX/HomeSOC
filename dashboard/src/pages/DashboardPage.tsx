import { useState } from "react";
import { useDashboardSummary } from "../hooks/useEvents";
import { useWebSocket } from "../hooks/useWebSocket";
import { StatCards } from "../components/dashboard/StatCards";
import { EventTimeline } from "../components/dashboard/EventTimeline";
import { AlertsPanel } from "../components/dashboard/AlertsPanel";
import { AgentStatus } from "../components/dashboard/AgentStatus";
import { LiveFeed } from "../components/dashboard/LiveFeed";
import { CategoryBreakdown } from "../components/dashboard/CategoryBreakdown";
import { api } from "../api/client";

export function DashboardPage() {
  const { summary, refresh } = useDashboardSummary();
  const { liveEvents, liveAlerts } = useWebSocket();
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenResult(null);
    try {
      const result = await api.generateTestEvents(10);
      setGenResult(`Generated ${result.events_generated} events, ${result.alerts_triggered} alerts`);
      refresh();
    } catch {
      setGenResult("Failed to generate events");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-soc-text">Security Overview</h2>
        <div className="flex items-center gap-3">
          {genResult && <span className="text-xs text-soc-text/60">{genResult}</span>}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md transition-colors"
          >
            {generating ? "Generating..." : "Generate Test Events"}
          </button>
        </div>
      </div>

      <StatCards summary={summary} />

      <EventTimeline events={liveEvents} />

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <LiveFeed events={liveEvents} />
        </div>
        <div className="space-y-4">
          <AlertsPanel alerts={liveAlerts.length > 0 ? liveAlerts : summary?.recent_alerts || []} />
          <AgentStatus />
        </div>
      </div>

      <CategoryBreakdown summary={summary} />
    </div>
  );
}
