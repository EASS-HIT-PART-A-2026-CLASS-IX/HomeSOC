import { useState, useRef, useEffect } from "react";
import { useDashboardSummary } from "../hooks/useEvents";
import { useWebSocket } from "../hooks/useWebSocket";
import { StatCards } from "../components/dashboard/StatCards";
import { EventTimeline } from "../components/dashboard/EventTimeline";
import { AlertsPanel } from "../components/dashboard/AlertsPanel";
import { AgentStatus } from "../components/dashboard/AgentStatus";
import { LiveFeed } from "../components/dashboard/LiveFeed";
import { CategoryBreakdown } from "../components/dashboard/CategoryBreakdown";
import { Button } from "../components/ui/button";
import { api } from "../api/client";

export function DashboardPage() {
  const { summary, refresh } = useDashboardSummary();
  const { liveEvents, liveAlerts } = useWebSocket();
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<string | null>(null);
  const leftColRef = useRef<HTMLDivElement>(null);
  const [leftColHeight, setLeftColHeight] = useState<number | undefined>();

  useEffect(() => {
    if (!leftColRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setLeftColHeight(entry.borderBoxSize[0].blockSize);
    });
    ro.observe(leftColRef.current);
    return () => ro.disconnect();
  }, []);

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
        <h2 className="text-lg font-semibold text-foreground">Security Overview</h2>
        <div className="flex items-center gap-3">
          {genResult && <span className="text-xs text-soc-text/60">{genResult}</span>}
          <Button
            onClick={handleGenerate}
            disabled={generating}
            size="sm"
          >
            {generating ? "Generating..." : "Generate Test Events"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_200px] gap-4 items-stretch">
        <EventTimeline events={liveEvents} />
        <StatCards summary={summary} />
      </div>

      <div className="grid grid-cols-3 gap-4 items-start">
        <div className="col-span-2" ref={leftColRef}>
          <LiveFeed events={liveEvents} />
        </div>
        <div
          className="flex flex-col gap-3"
          style={leftColHeight ? { height: leftColHeight } : undefined}
        >
          <AlertsPanel
            alerts={liveAlerts.length > 0 ? liveAlerts : summary?.recent_alerts || []}
            className="flex-1 min-h-0"
          />
          <AgentStatus />
          <CategoryBreakdown summary={summary} />
        </div>
      </div>
    </div>
  );
}
