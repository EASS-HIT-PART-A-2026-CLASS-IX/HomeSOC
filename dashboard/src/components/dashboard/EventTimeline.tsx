import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SecurityEvent, AgentInfo } from "../../types/events";
import { useState, useMemo, useEffect, useRef } from "react";
import { socVar } from "../../utils/themeColors";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { api } from "../../api/client";

type RangeKey = "1h" | "today" | "7d" | "30d" | "custom";
type SeverityFilter = "all" | "critical" | "high" | "medium" | "low" | "info";

const RANGE_LABELS: Record<RangeKey, string> = {
  "1h": "Last Hour",
  today: "Today",
  "7d": "7 Days",
  "30d": "30 Days",
  custom: "Custom",
};

// Each severity's display config — hex colors so they work in SVG attrs too
const SEVERITY_SERIES = [
  { key: "critical" as SeverityFilter, label: "Critical", hex: "#ef4444", gradId: "critGrad",  opacity: 0.5 },
  { key: "high"     as SeverityFilter, label: "High",     hex: "#f97316", gradId: "highGrad",  opacity: 0.45 },
  { key: "medium"   as SeverityFilter, label: "Medium",   hex: "#eab308", gradId: "medGrad",   opacity: 0.4 },
  { key: "low"      as SeverityFilter, label: "Low",      hex: "#3b82f6", gradId: "lowGrad",   opacity: 0.45 },
  { key: "info"     as SeverityFilter, label: "Info",     hex: "#94a3b8", gradId: "infoGrad",  opacity: 0.3 },
] as const;

const SEVERITY_BUTTON_COLORS: Record<SeverityFilter, string> = {
  all:      "text-foreground",
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-yellow-400",
  low:      "text-blue-400",
  info:     "text-slate-400",
};

interface BucketConfig {
  count: number;
  ms: number;
  fmt: (d: Date) => string;
}

function getBucketConfig(range: RangeKey, customStart?: Date, customEnd?: Date): BucketConfig {
  switch (range) {
    case "1h":
      return { count: 60, ms: 60_000, fmt: (d) => `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}` };
    case "today":
      return { count: 24, ms: 3_600_000, fmt: (d) => `${d.getHours().toString().padStart(2, "0")}:00` };
    case "7d":
      return { count: 7, ms: 86_400_000, fmt: (d) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) };
    case "30d":
      return { count: 30, ms: 86_400_000, fmt: (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) };
    case "custom": {
      if (!customStart || !customEnd) return { count: 1, ms: 86_400_000, fmt: () => "" };
      const diffMs = customEnd.getTime() - customStart.getTime();
      const diffDays = Math.max(1, Math.ceil(diffMs / 86_400_000));
      const bucketMs = diffDays <= 1 ? 3_600_000 : 86_400_000;
      const count = diffDays <= 1 ? 24 : diffDays;
      const fmt =
        diffDays <= 1
          ? (d: Date) => `${d.getHours().toString().padStart(2, "0")}:00`
          : (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      return { count, ms: bucketMs, fmt };
    }
  }
}

function getRangeStart(range: RangeKey, customStart?: Date): Date {
  switch (range) {
    case "1h":
      return new Date(Date.now() - 3_600_000);
    case "today": {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d":
      return new Date(Date.now() - 7 * 86_400_000);
    case "30d":
      return new Date(Date.now() - 30 * 86_400_000);
    case "custom":
      return customStart ?? new Date(Date.now() - 86_400_000);
  }
}

type BucketRow = { time: string; critical: number; high: number; medium: number; low: number; info: number };

function buildChartData(
  events: SecurityEvent[],
  range: RangeKey,
  customStart?: Date,
  customEnd?: Date
): BucketRow[] {
  const cfg = getBucketConfig(range, customStart, customEnd);
  const end = range === "custom" && customEnd ? customEnd : new Date();
  const start = getRangeStart(range, customStart);

  const zero = () => ({ critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  const buckets: BucketRow[] = [];
  const bucketMap = new Map<number, ReturnType<typeof zero>>();

  for (let i = cfg.count - 1; i >= 0; i--) {
    const t = new Date(end.getTime() - i * cfg.ms);
    const key = Math.floor(t.getTime() / cfg.ms);
    bucketMap.set(key, zero());
    buckets.push({ time: cfg.fmt(t), ...zero() });
  }

  const keys = Array.from(bucketMap.keys());

  for (const ev of events) {
    const ts = new Date(ev.timestamp).getTime();
    if (ts < start.getTime() || ts > end.getTime()) continue;
    const key = Math.floor(ts / cfg.ms);
    const bucket = bucketMap.get(key);
    if (bucket) {
      const sev = ev.severity as keyof ReturnType<typeof zero>;
      if (sev in bucket) bucket[sev]++;
    }
  }

  keys.forEach((key, i) => {
    const data = bucketMap.get(key);
    if (data) Object.assign(buckets[i], data);
  });

  return buckets;
}

interface EventTimelineProps {
  events: SecurityEvent[]; // live feed — used only for "1h" range
}

export function EventTimeline({ events }: EventTimelineProps) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [fetchedEvents, setFetchedEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    api.getAgents().then(setAgents).catch(() => {});
  }, []);

  const colors = useMemo(
    () => ({
      border: socVar("border"),
      muted: socVar("muted"),
      card: socVar("card"),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (range === "1h") {
      setFetchedEvents([]);
      return;
    }
    if (range === "custom" && (!customStart || !customEnd)) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setLoading(true);

    const since =
      range === "custom"
        ? new Date(customStart).toISOString()
        : getRangeStart(range).toISOString();

    api
      .getEvents({ since, limit: 1000 }, abortRef.current.signal)
      .then((data) => setFetchedEvents(data))
      .catch((err) => { if (err?.name !== "AbortError") console.error("EventTimeline fetch failed:", err); })
      .finally(() => setLoading(false));
  }, [range, customStart, customEnd]);

  const rawEvents = useMemo(() => {
    const base = range === "1h" ? events : fetchedEvents;
    if (agentFilter === "all") return base;
    return base.filter((e) => e.agent_id === agentFilter);
  }, [range, events, fetchedEvents, agentFilter]);

  const chartData = useMemo(() => {
    const cs = customStart ? new Date(customStart) : undefined;
    const ce = customEnd ? new Date(customEnd) : undefined;
    return buildChartData(rawEvents, range, cs, ce);
  }, [rawEvents, range, customStart, customEnd]);

  // Which series to render
  const visibleSeries = severityFilter === "all"
    ? SEVERITY_SERIES.filter((s) => s.key !== "info")
    : SEVERITY_SERIES.filter((s) => s.key === severityFilter);

  const totalEvents = useMemo(() => {
    if (severityFilter === "all") return rawEvents.length;
    return rawEvents.filter((e) => e.severity === severityFilter).length;
  }, [rawEvents, severityFilter]);

  const maxValue = useMemo(() => {
    const keys = visibleSeries.map((s) => s.key) as (keyof BucketRow)[];
    return Math.max(1, ...chartData.map((d) => keys.reduce((sum, k) => sum + (d[k] as number), 0)));
  }, [chartData, visibleSeries]);

  const xInterval = useMemo(() => {
    if (range === "1h") return 9;
    if (range === "today") return 0;
    return 0;
  }, [range]);

  return (
    <Card>
      <CardHeader className="pb-2 px-4 pt-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle>Event Timeline</CardTitle>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Range preset buttons */}
              <div className="flex items-center rounded-md border border-border/50 overflow-hidden text-xs">
                {(["1h", "today", "7d", "30d", "custom"] as RangeKey[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`px-2.5 py-1.5 transition-colors ${
                      range === r
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
                    }`}
                  >
                    {RANGE_LABELS[r]}
                  </button>
                ))}
              </div>

              {/* Custom date+time inputs */}
              {range === "custom" && (
                <div className="flex items-center gap-1.5 text-xs">
                  <input
                    type="datetime-local"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="bg-card border border-border/60 rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:dark]"
                  />
                  <span className="text-muted-foreground">→</span>
                  <input
                    type="datetime-local"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="bg-card border border-border/60 rounded-md px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-ring [color-scheme:dark]"
                  />
                </div>
              )}

              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {loading ? "Loading..." : `${totalEvents} events`}
              </span>
            </div>
          </div>

          {/* Agent + Severity filters */}
          <div className="flex items-center gap-4 flex-wrap">

          {/* Agent filter */}
          {agents.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Agent:</span>
              <div className="flex items-center rounded-md border border-border/50 overflow-hidden text-xs">
                <button
                  onClick={() => setAgentFilter("all")}
                  className={`px-2.5 py-1 transition-colors border-r border-border/30 ${
                    agentFilter === "all"
                      ? "bg-primary/20 text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
                  }`}
                >
                  All Agents
                </button>
                {agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAgentFilter(a.id)}
                    className={`px-2.5 py-1 transition-colors border-r border-border/30 last:border-r-0 ${
                      agentFilter === a.id
                        ? "bg-primary/20 text-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
                    }`}
                  >
                    {a.hostname}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Severity filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-0.5">Severity:</span>
            <div className="flex items-center rounded-md border border-border/50 overflow-hidden text-xs">
              {(["all", "critical", "high", "medium", "low", "info"] as SeverityFilter[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setSeverityFilter(key)}
                  className={`px-2.5 py-1 transition-colors border-r border-border/30 last:border-r-0 capitalize
                    ${SEVERITY_BUTTON_COLORS[key]}
                    ${severityFilter === key
                      ? "bg-primary/20 font-semibold"
                      : "opacity-50 hover:opacity-100 hover:bg-primary/10"
                    }`}
                >
                  {key === "all" ? "All" : key.charAt(0).toUpperCase() + key.slice(1)}
                </button>
              ))}
            </div>
          </div>

          </div> {/* end agent+severity row */}
        </div>
      </CardHeader>

      <CardContent className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {SEVERITY_SERIES.map(({ gradId, hex, opacity }) => (
                <linearGradient key={gradId} id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={hex} stopOpacity={opacity} />
                  <stop offset="100%" stopColor={hex} stopOpacity={0.03} />
                </linearGradient>
              ))}
            </defs>
            <XAxis
              dataKey="time"
              stroke={colors.muted}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval={xInterval}
              tick={{ fill: colors.muted }}
            />
            <YAxis
              stroke="transparent"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              domain={[0, Math.ceil(maxValue * 1.3)]}
              allowDecimals={false}
              tick={{ fill: colors.muted }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: "8px",
                fontSize: "12px",
              }}
              cursor={{ stroke: colors.muted, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            {visibleSeries.map(({ key, label, hex, gradId }) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId="events"
                stroke={hex}
                fill={`url(#${gradId})`}
                strokeWidth={2}
                name={label}
                dot={false}
                activeDot={{ r: 4, fill: hex }}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
