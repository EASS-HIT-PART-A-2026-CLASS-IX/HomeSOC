import { SecurityEvent, AgentInfo } from "../../types/events";
import { useState, useMemo, useCallback, useEffect } from "react";
import { useSettings } from "../../contexts/SettingsContext";
import { formatDateTime } from "../../utils/formatTime";
import { severityBadge } from "../../utils/severity";
import { ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "../ui/card";

const PAGE_SIZE = 75;

interface EventTableProps {
  events: SecurityEvent[];
  loading?: boolean;
  agents?: AgentInfo[];
}

type SortDir = "asc" | "desc" | null;

export function EventTable({ events, loading, agents = [] }: EventTableProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [page, setPage] = useState(1);
  const { settings } = useSettings();

  const agentMap = useMemo(() => {
    const m = new Map<string, string>();
    agents.forEach((a) => m.set(a.id, a.hostname));
    return m;
  }, [agents]);

  const toggleSort = useCallback(() => {
    setSortDir((prev) => {
      if (prev === null) return "desc";
      if (prev === "desc") return "asc";
      return null;
    });
  }, []);

  const sortedEvents = useMemo(() => {
    if (!sortDir) return events;
    return [...events].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return sortDir === "desc" ? tb - ta : ta - tb;
    });
  }, [events, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedEvents.length / PAGE_SIZE));

  // Reset to page 1 when events or filters change
  useEffect(() => { setPage(1); }, [events]);

  const pageEvents = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedEvents.slice(start, start + PAGE_SIZE);
  }, [sortedEvents, page]);

  if (loading) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground">Loading events...</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th
              className="px-4 py-3 text-xs text-muted-foreground font-medium cursor-pointer select-none hover:text-foreground transition-colors"
              onClick={toggleSort}
            >
              <span className="flex items-center gap-1.5">
                Date & Time
                {sortDir === "desc" ? (
                  <ArrowDown className="w-3 h-3 text-primary" />
                ) : sortDir === "asc" ? (
                  <ArrowUp className="w-3 h-3 text-primary" />
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-40" />
                )}
              </span>
            </th>
            <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Severity</th>
            <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Category</th>
            <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Type</th>
            <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Process</th>
            <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Details</th>
            <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Agent</th>
            <th className="px-4 py-3 text-xs text-muted-foreground font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {pageEvents.map((ev) => (
            <>
              <tr
                key={ev.id}
                className="border-b border-border/50 hover:bg-background/50 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}
              >
                <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {formatDateTime(ev.timestamp, settings)}
                </td>
                <td className="px-4 py-2.5">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full ${severityBadge[ev.severity]}`}>
                    {ev.severity}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-foreground">{ev.category}</td>
                <td className="px-4 py-2.5 text-xs text-foreground font-mono">{ev.event_type}</td>
                <td className="px-4 py-2.5 text-xs text-primary">{ev.process_name || "—"}</td>
                <td className="px-4 py-2.5 text-xs text-foreground truncate max-w-[200px]">
                  {getEventDetail(ev)}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                  {agentMap.get(ev.agent_id) ?? ev.agent_id}
                </td>
                <td className="px-4 py-2.5">
                  {isTestEvent(ev.source) ? (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-violet-500/40 bg-violet-500/10 text-violet-400 tracking-wide">
                      TEST
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{ev.source}</span>
                  )}
                </td>
              </tr>
              {expanded === ev.id && (
                <tr key={`${ev.id}-detail`}>
                  <td colSpan={8} className="px-4 py-3 bg-background/80">
                    <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                      {JSON.stringify(ev, null, 2)}
                    </pre>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
      {events.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8">No events found</p>
      )}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} &middot; {sortedEvents.length} events
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-foreground hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(p);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item as number)}
                    className={`min-w-[28px] px-2 py-1 text-xs rounded transition-colors ${
                      page === item
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-primary/10"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded text-muted-foreground hover:text-foreground hover:bg-primary/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function isTestEvent(source: string): boolean {
  return source === "demo" || source.startsWith("[TEST]");
}

function getEventDetail(ev: SecurityEvent): string {
  if (ev.dst_ip) return `${ev.dst_ip}:${ev.dst_port}`;
  if (ev.file_path) return ev.file_path;
  if (ev.auth_user) return `${ev.auth_user} ${ev.auth_success ? "OK" : "FAIL"}`;
  if (ev.process_path) return ev.process_path;
  return "—";
}
