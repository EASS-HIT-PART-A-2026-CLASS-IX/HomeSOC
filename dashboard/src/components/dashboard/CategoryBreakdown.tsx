import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { DashboardSummary } from "../../types/events";
import { useMemo } from "react";
import { socVar } from "../../utils/themeColors";

interface CategoryBreakdownProps {
  summary: DashboardSummary | null;
}

const categoryColors: Record<string, string> = {
  process: "#3b82f6",
  network: "#8b5cf6",
  file: "#06b6d4",
  auth: "#f59e0b",
  authz: "#ef4444",
  service: "#10b981",
  system: "#6b7280",
};

const categoryLabels: Record<string, string> = {
  process: "Process",
  network: "Network",
  file: "File",
  auth: "Auth",
  authz: "Authz",
  service: "Service",
  system: "System",
};

export function CategoryBreakdown({ summary }: CategoryBreakdownProps) {
  const colors = useMemo(
    () => ({
      border: socVar("border"),
      card: socVar("card"),
      text: socVar("text"),
      muted: socVar("muted"),
    }),
    // CSS variables are static; read once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const data = useMemo(() => {
    const entries = Object.entries(summary?.events_by_category || {});
    return entries
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({
        name: categoryLabels[name] || name,
        value,
        key: name,
      }))
      .sort((a, b) => b.value - a.value);
  }, [summary]);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="bg-soc-card border border-soc-border rounded-lg p-3">
      <h3 className="text-xs font-medium text-soc-text mb-3">
        Events by Category (24h)
      </h3>
      {data.length === 0 ? (
        <p className="text-soc-muted text-xs text-center py-4">No data</p>
      ) : (
        <div className="flex items-center gap-4">
          {/* Pie chart */}
          <div className="flex-shrink-0" style={{ width: 130, height: 130 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={32}
                  outerRadius={56}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {data.map((entry) => (
                    <Cell
                      key={entry.key}
                      fill={categoryColors[entry.key] || "#6b7280"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: colors.card,
                    border: `1px solid ${colors.border}`,
                    borderRadius: "8px",
                    fontSize: "11px",
                    color: colors.text,
                  }}
                  formatter={(value: number) => [
                    `${value} (${((value / total) * 100).toFixed(1)}%)`,
                    "Events",
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-1">
            {data.map((entry) => {
              const pct = ((entry.value / total) * 100).toFixed(1);
              return (
                <div key={entry.key} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: categoryColors[entry.key] || "#6b7280" }}
                  />
                  <span className="text-xs text-soc-text flex-1">{entry.name}</span>
                  <span className="text-xs font-medium text-soc-text tabular-nums">
                    {entry.value}
                  </span>
                  <span className="text-xs text-soc-muted w-10 text-right tabular-nums">
                    {pct}%
                  </span>
                </div>
              );
            })}
            <div className="border-t border-soc-border pt-1 mt-1 flex items-center gap-2">
              <div className="w-2 h-2 flex-shrink-0" />
              <span className="text-xs text-soc-muted flex-1">Total</span>
              <span className="text-xs font-medium text-soc-text tabular-nums">{total}</span>
              <span className="text-xs text-soc-muted w-10 text-right">100%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
