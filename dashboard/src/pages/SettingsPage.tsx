import { Bell, Layout, RotateCcw, Clock, Columns2 } from "lucide-react";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { useSettings } from "../contexts/SettingsContext";

const refreshOptions = [5, 10, 15, 30, 60];

export function SettingsPage() {
  const { settings, update, reset } = useSettings();

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Settings</h2>
        <Button variant="ghost" size="sm" onClick={reset} className="text-muted-foreground hover:text-destructive gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to defaults
        </Button>
      </div>

      {/* Time & Display */}
      <Section icon={<Clock className="w-4 h-4" />} title="Time & Display">
        <SettingRow label="Time Format" description="How timestamps are displayed across the dashboard">
          <div className="flex gap-2">
            {(["24h", "12h"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => update("timeFormat", fmt)}
                className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                  settings.timeFormat === fmt
                    ? "border-soc-accent bg-soc-accent/10 text-soc-accent"
                    : "border-soc-border text-soc-muted hover:text-soc-text"
                }`}
              >
                {fmt === "24h" ? "24-hour" : "12-hour"}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="Show Seconds" description="Include seconds in event timestamps">
          <Toggle checked={settings.showTimestampSeconds} onChange={(v) => update("showTimestampSeconds", v)} />
        </SettingRow>
      </Section>

      {/* Dashboard */}
      <Section icon={<Layout className="w-4 h-4" />} title="Dashboard">
        <SettingRow label="Refresh Interval" description="How often the dashboard summary auto-refreshes (seconds)">
          <SegmentedControl
            options={refreshOptions.map((n) => ({ value: n, label: `${n}s` }))}
            selected={settings.refreshInterval}
            onChange={(v) => update("refreshInterval", v)}
          />
        </SettingRow>

        <SettingRow label="Confirm Before Clear" description="Ask for confirmation before clearing events or alerts">
          <Toggle checked={settings.confirmBeforeClear} onChange={(v) => update("confirmBeforeClear", v)} />
        </SettingRow>
      </Section>

      {/* Notifications */}
      <Section icon={<Bell className="w-4 h-4" />} title="Notifications">
        <SettingRow
          label="Alert Notifications"
          description="Show browser notifications for high and critical severity alerts"
        >
          <Toggle
            checked={settings.notifyOnHighAlerts}
            onChange={(v) => {
              if (v && Notification.permission !== "granted") {
                Notification.requestPermission().then((perm) => {
                  update("notifyOnHighAlerts", perm === "granted");
                });
              } else {
                update("notifyOnHighAlerts", v);
              }
            }}
          />
        </SettingRow>
      </Section>

      {/* About */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Columns2 className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">HomeSOC v0.1.0</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Home Security Operations Center — Local network security monitoring
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ── Reusable sub-components ── */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </Card>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 gap-6">
      <div className="min-w-0">
        <p className="text-sm text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5.5 rounded-full transition-colors ${
        checked ? "bg-soc-accent" : "bg-soc-border"
      }`}
      style={{ width: 40, height: 22 }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform"
        style={{ transform: checked ? "translateX(18px)" : "translateX(0)" }}
      />
    </button>
  );
}

function SegmentedControl<T extends number>({
  options,
  selected,
  onChange,
}: {
  options: { value: T; label: string }[];
  selected: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md border border-soc-border overflow-hidden bg-soc-surface/50">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 text-xs transition-colors ${
            selected === opt.value
              ? "bg-soc-card text-soc-text shadow-sm"
              : "text-soc-muted hover:text-soc-text hover:bg-soc-surface"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
