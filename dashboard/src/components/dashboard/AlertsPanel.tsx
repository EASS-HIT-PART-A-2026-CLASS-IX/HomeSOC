import { AlertTriangle, CheckCircle } from "lucide-react";
import { Alert, Severity } from "../../types/events";
import { useSettings } from "../../contexts/SettingsContext";
import { formatDateTime } from "../../utils/formatTime";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Badge, type BadgeProps } from "../ui/badge";
import { Button } from "../ui/button";

interface AlertsPanelProps {
  alerts: Alert[];
  onAcknowledge?: (id: string) => void;
  className?: string;
}

const severityVariant: Record<Severity, BadgeProps["variant"]> = {
  critical: "destructive",
  high: "destructive",
  medium: "default",
  low: "secondary",
  info: "secondary",
};

const severityBorderStyle: Record<Severity, string> = {
  critical: "border-l-soc-critical bg-soc-critical/5",
  high: "border-l-soc-danger bg-soc-danger/5",
  medium: "border-l-soc-warning bg-soc-warning/5",
  low: "border-l-soc-accent bg-soc-accent/5",
  info: "border-l-soc-muted bg-soc-muted/5",
};

export function AlertsPanel({ alerts, onAcknowledge, className }: AlertsPanelProps) {
  const { settings } = useSettings();

  return (
    <Card className={`flex flex-col${className ? ` ${className}` : ""}`}>
      <CardHeader className="pb-3 px-4 pt-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-soc-warning" />
            Active Alerts
          </CardTitle>
          <span className="text-xs text-muted-foreground">{alerts.length} open</span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 flex-1 min-h-0">
        <div className="space-y-2 h-full overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-soc-success opacity-50" />
              No active alerts
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`border-l-2 rounded-r-lg p-3 ${severityBorderStyle[alert.severity]}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={severityVariant[alert.severity]}>
                        {alert.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(alert.created_at, settings)}
                      </span>
                    </div>
                    <p className="text-sm text-foreground truncate">
                      {alert.rule_name}
                    </p>
                    {alert.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {alert.description}
                      </p>
                    )}
                  </div>
                  {onAcknowledge && alert.status === "open" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onAcknowledge(alert.id)}
                    >
                      ACK
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
