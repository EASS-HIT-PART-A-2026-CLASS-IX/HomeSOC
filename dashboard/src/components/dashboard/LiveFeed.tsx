import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { SecurityEvent } from "../../types/events";
import { useSettings } from "../../contexts/SettingsContext";
import { formatDateTime } from "../../utils/formatTime";
import { severityDot } from "../../utils/severity";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";

const FEED_LIMITS = [25, 50, 75] as const;
type FeedLimit = typeof FEED_LIMITS[number];

interface LiveFeedProps {
  events: SecurityEvent[];
  className?: string;
}

const categoryLabel: Record<string, string> = {
  process: "PROC",
  network: "NET",
  file: "FILE",
  auth: "AUTH",
  authz: "AUTHZ",
  service: "SVC",
  system: "SYS",
};

export function LiveFeed({ events, className }: LiveFeedProps) {
  const { settings } = useSettings();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState<FeedLimit>(25);
  const [cappedHeight, setCappedHeight] = useState<number | null>(null);

  const visibleEvents = events.slice(0, limit);

  // Capture the natural height when exactly at the 25-row limit, use it to cap larger limits
  useEffect(() => {
    if (limit === 25 && scrollRef.current && visibleEvents.length > 0) {
      setCappedHeight(scrollRef.current.scrollHeight);
    }
  }, [limit, visibleEvents.length]);


  return (
    <Card className={className}>
      <CardHeader className="pb-3 px-4 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-soc-success" />
            Live Event Feed
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-md border border-border/50 overflow-hidden text-xs">
              {FEED_LIMITS.map((n) => (
                <button
                  key={n}
                  onClick={() => setLimit(n)}
                  className={`px-2.5 py-1 transition-colors border-r border-border/30 last:border-r-0 ${
                    limit === n
                      ? "bg-primary/20 text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-soc-success animate-pulse" />
              <span className="text-xs text-muted-foreground">{events.length} events</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4">
        <div
          ref={scrollRef}
          className="overflow-y-auto font-mono text-xs space-y-1"
          style={limit === 25 ? undefined : cappedHeight ? { height: cappedHeight, overflowY: "auto" } : undefined}
        >
          {visibleEvents.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm font-sans">
              Waiting for events...
            </p>
          ) : (
            visibleEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-background/50 rounded transition-colors"
              >
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${severityDot[ev.severity]}`} />
                <span className="text-muted-foreground w-28 flex-shrink-0">
                  {formatDateTime(ev.timestamp, settings)}
                </span>
                <Badge variant="outline" className="w-10 flex-shrink-0 justify-center text-[9px] font-bold px-1 py-0 h-4">
                  {categoryLabel[ev.category] || ev.category.toUpperCase()}
                </Badge>
                {(ev.source === "demo" || ev.source.startsWith("[TEST]")) && (
                  <span className="flex-shrink-0 text-[9px] font-bold uppercase px-1 py-0 h-4 flex items-center rounded border border-violet-500/40 bg-violet-500/10 text-violet-400 tracking-wide">
                    TEST
                  </span>
                )}
                <span className="text-foreground truncate flex-1">
                  {formatEventSummary(ev)}
                </span>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatEventSummary(ev: SecurityEvent): string {
  switch (ev.category) {
    case "process":
      return `${ev.process_name || "?"} (PID:${ev.process_pid || "?"}) ${ev.process_path || ""}`;
    case "network":
      return `${ev.process_name || "?"} → ${ev.dst_ip || "?"}:${ev.dst_port || "?"} (${ev.protocol || "?"})`;
    case "file":
      return `${ev.file_action || "?"} ${ev.file_path || "?"}`;
    case "auth":
      return `${ev.auth_user || "?"} ${ev.auth_success ? "✓" : "✗"} via ${ev.auth_method || "?"}`;
    default:
      return ev.event_type;
  }
}
