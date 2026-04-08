import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { AgentInfo, Platform, DetectionRule, WhitelistEntry, WhitelistMatchType } from "../types/events";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { SetupInstructionsModal } from "../components/dashboard/SetupInstructionsModal";
import { useWebSocket } from "../hooks/useWebSocket";
import {
  Cpu, FileText, Globe, Lock, Monitor, Shield,
  Trash2, Wifi, Terminal, ChevronDown, ChevronRight,
  Save, Plus, Square, Play, X, Settings2, AlertTriangle, Ban,
} from "lucide-react";

const AGENT_POLL_INTERVAL_MS = 15_000;

// ── Collector group definitions ──────────────────────────────────────────────

interface CollectorGroup {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  category: "process" | "file" | "network" | "auth" | "system";
}

const COLLECTOR_GROUPS: CollectorGroup[] = [
  { key: "process_exec",         label: "Process Execution",    description: "Every binary launched — name, path, arguments",                         icon: Cpu,      iconColor: "text-violet-400",  category: "process" },
  { key: "process_signals",      label: "Process Signals",      description: "SIGKILL and other signals sent between processes",                       icon: Cpu,      iconColor: "text-violet-400",  category: "process" },
  { key: "process_injection",    label: "Process Injection",    description: "Remote thread creation and task port inspection (injection indicators)", icon: Cpu,      iconColor: "text-red-400",     category: "process" },
  { key: "privilege_escalation", label: "Privilege Escalation", description: "setuid/setgid calls that change process privileges",                     icon: Shield,   iconColor: "text-red-400",     category: "process" },
  { key: "file_events",          label: "File Access",          description: "File opens, creates, and renames",                                       icon: FileText, iconColor: "text-orange-400",  category: "file"    },
  { key: "file_deletion",        label: "File Deletion",        description: "Files deleted from disk (unlink events)",                                 icon: Trash2,   iconColor: "text-orange-400",  category: "file"    },
  { key: "network_connections",  label: "Network Connections",  description: "Active outbound connections polled via lsof every 15s",                  icon: Globe,    iconColor: "text-blue-400",    category: "network" },
  { key: "auth",                 label: "Authentication",       description: "macOS local authentication events (Touch ID, password)",                  icon: Lock,     iconColor: "text-emerald-400", category: "auth"    },
  { key: "sudo_su",              label: "Sudo / Su",            description: "sudo and su command usage — who ran what as root",                       icon: Terminal, iconColor: "text-emerald-400", category: "auth"    },
  { key: "ssh",                  label: "SSH Logins",           description: "Inbound SSH sessions — login and logout events",                          icon: Wifi,     iconColor: "text-emerald-400", category: "auth"    },
  { key: "volume_mounts",        label: "Volume Mounts",        description: "USB drives, SD cards, and external disks plugged in/out",                icon: Monitor,  iconColor: "text-sky-400",     category: "system"  },
  { key: "kernel_extensions",    label: "Kernel Extensions",    description: "kext load/unload — drivers and potential rootkits",                       icon: Monitor,  iconColor: "text-sky-400",     category: "system"  },
  { key: "screen_sharing",       label: "Screen Sharing",       description: "Remote screen sharing sessions attached to this machine",                 icon: Monitor,  iconColor: "text-sky-400",     category: "system"  },
  { key: "malware_detection",    label: "XProtect / Malware",   description: "Apple XProtect detections and remediations",                              icon: Shield,   iconColor: "text-red-400",     category: "system"  },
];

const CATEGORY_LABELS: Record<string, string> = {
  process: "Process", file: "File System", network: "Network", auth: "Authentication", system: "System",
};
const CATEGORY_ORDER = ["process", "file", "network", "auth", "system"];

function defaultGroups(): Record<string, boolean> {
  return Object.fromEntries(COLLECTOR_GROUPS.map((g) => [g.key, true]));
}

// ── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{ height: "26px", width: "52px", minWidth: "52px" }}
      className={`relative flex-shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
        enabled ? "bg-primary" : "bg-muted-foreground/20 border border-border"
      }`}
      role="switch"
      aria-checked={enabled}
    >
      <span className={`absolute inset-0 flex items-center text-[9px] font-bold select-none pointer-events-none ${
        enabled ? "justify-start pl-[8px] text-white" : "justify-end pr-[8px] text-muted-foreground"
      }`}>
        {enabled ? "ON" : "OFF"}
      </span>
      <span
        style={{ top: "4px", width: "18px", height: "18px" }}
        className={`absolute rounded-full shadow-md transition-all duration-200 pointer-events-none bg-white ${
          enabled ? "left-[30px]" : "left-[4px]"
        }`}
      />
    </button>
  );
}

const RULE_CATEGORY_ORDER = ["process", "network", "authentication", "system", "file"];
const RULE_SEVERITY_COLORS: Record<string, string> = {
  critical: "text-red-400", high: "text-orange-400", medium: "text-yellow-400",
  low: "text-blue-400", info: "text-slate-400",
};

// ── Per-agent collector settings panel ──────────────────────────────────────

function CollectorPanel({ agent }: { agent: AgentInfo }) {
  const [tab, setTab] = useState<"collectors" | "rules" | "whitelist">("collectors");
  const [groups, setGroups] = useState<Record<string, boolean>>(defaultGroups);
  const [enabledRules, setEnabledRules] = useState<Record<string, boolean>>({});
  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [newField, setNewField] = useState("process_name");
  const [newValue, setNewValue] = useState("");
  const [newMatchType, setNewMatchType] = useState<WhitelistMatchType>("exact");
  const [newNote, setNewNote] = useState("");
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>(
    Object.fromEntries(CATEGORY_ORDER.map((c) => [c, false]))
  );

  useEffect(() => {
    const existing = agent.config?.event_groups;
    setGroups(existing ? { ...defaultGroups(), ...existing } : defaultGroups());
    const existingRules = agent.config?.enabled_rules ?? {};
    setEnabledRules(existingRules);
    setWhitelist(agent.config?.whitelist ?? []);
  }, [agent.id]);

  useEffect(() => {
    api.getRules().then(setRules).catch(() => {});
  }, []);

  const toggle = (key: string) => { setGroups((p) => ({ ...p, [key]: !p[key] })); setSaved(false); };
  const toggleRule = (id: string) => {
    setEnabledRules((p) => ({ ...p, [id]: !(p[id] ?? true) }));
    setSaved(false);
  };
  const toggleCat = (cat: string) => setOpenCategories((p) => ({ ...p, [cat]: !p[cat] }));

  const save = async () => {
    setSaving(true);
    try {
      await api.updateAgentConfig(agent.id, { event_groups: groups, enabled_rules: enabledRules, whitelist });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    finally { setSaving(false); }
  };

  const enabledGroupCount = Object.values(groups).filter(Boolean).length;
  const enabledRuleCount = rules.filter((r) => enabledRules[r.id] !== false).length;

  // Group rules by category
  const rulesByCategory = rules.reduce<Record<string, DetectionRule[]>>((acc, r) => {
    const cat = (r.conditions as Record<string, string>)?.category ?? "system";
    (acc[cat] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="border-t border-border/40 bg-background/30">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-1 rounded-md border border-border/50 overflow-hidden text-xs">
          <button
            onClick={() => setTab("collectors")}
            className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${tab === "collectors" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-primary/10"}`}
          >
            <Settings2 className="w-3 h-3" />
            Collectors
            <span className={`text-[10px] ${tab === "collectors" ? "opacity-80" : "opacity-60"}`}>{enabledGroupCount}/{COLLECTOR_GROUPS.length}</span>
          </button>
          <button
            onClick={() => setTab("rules")}
            className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${tab === "rules" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-primary/10"}`}
          >
            <AlertTriangle className="w-3 h-3" />
            Detection Rules
            <span className={`text-[10px] ${tab === "rules" ? "opacity-80" : "opacity-60"}`}>{enabledRuleCount}/{rules.length}</span>
          </button>
          <button
            onClick={() => setTab("whitelist")}
            className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${tab === "whitelist" ? "bg-primary text-primary-foreground font-medium" : "text-muted-foreground hover:text-foreground hover:bg-primary/10"}`}
          >
            <Ban className="w-3 h-3" />
            Whitelist
            {whitelist.length > 0 && <span className={`text-[10px] ${tab === "whitelist" ? "opacity-80" : "opacity-60"}`}>{whitelist.length}</span>}
          </button>
        </div>
        <Button size="sm" onClick={save} disabled={saving} className="h-7 px-2.5 text-xs gap-1">
          <Save className="w-3 h-3" />
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </Button>
      </div>

      {tab === "collectors" && (
        <div className="px-4 pb-4 space-y-1.5">
          {CATEGORY_ORDER.map((cat) => {
            const items = COLLECTOR_GROUPS.filter((g) => g.category === cat);
            const isOpen = openCategories[cat] ?? false;
            const enabledInCat = items.filter((g) => groups[g.key]).length;
            return (
              <div key={cat} className="border border-border/40 rounded-lg overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-3 py-2 bg-background/40 hover:bg-primary/5 transition-colors text-left"
                  onClick={() => toggleCat(cat)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{CATEGORY_LABELS[cat]}</span>
                    <span className="text-[11px] text-muted-foreground">{enabledInCat}/{items.length}</span>
                  </div>
                  {isOpen ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </button>
                {isOpen && (
                  <div className="divide-y divide-border/30">
                    {items.map((group) => {
                      const Icon = group.icon;
                      const enabled = groups[group.key] ?? true;
                      return (
                        <div key={group.key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 transition-colors">
                          <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${enabled ? group.iconColor : "text-muted-foreground/30"}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>{group.label}</p>
                            <p className="text-[11px] text-muted-foreground truncate">{group.description}</p>
                          </div>
                          <Toggle enabled={enabled} onToggle={() => toggle(group.key)} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground pt-1">
            Changes apply on next heartbeat (~30s). The agent keeps running — disabled groups just stop sending events.
          </p>
        </div>
      )}

      {tab === "rules" && (
        <div className="px-4 pb-4 space-y-1.5">
          {RULE_CATEGORY_ORDER.map((cat) => {
            const items = rulesByCategory[cat] ?? [];
            if (!items.length) return null;
            const enabledInCat = items.filter((r) => enabledRules[r.id] !== false).length;
            return (
              <div key={cat} className="border border-border/40 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-background/40">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground capitalize">{cat}</span>
                    <span className="text-[11px] text-muted-foreground">{enabledInCat}/{items.length}</span>
                  </div>
                </div>
                <div className="divide-y divide-border/30">
                  {items.map((rule) => {
                    const enabled = enabledRules[rule.id] !== false;
                    return (
                      <div key={rule.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 transition-colors">
                        <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${enabled ? (RULE_SEVERITY_COLORS[rule.severity] ?? "text-muted-foreground") : "text-muted-foreground/30"}`} />
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${enabled ? "text-foreground" : "text-muted-foreground"}`}>{rule.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{rule.description}</p>
                        </div>
                        <Toggle enabled={enabled} onToggle={() => toggleRule(rule.id)} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-muted-foreground pt-1">
            Disabled rules won't generate alerts for this agent. Events are still collected.
          </p>
        </div>
      )}

      {tab === "whitelist" && (
        <div className="px-4 pb-4 space-y-3">
          {/* Add new entry */}
          <div className="border border-border/40 rounded-lg p-3 space-y-2 bg-background/40">
            <p className="text-xs font-medium text-foreground">Add Whitelist Entry</p>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
                className="appearance-none bg-card border border-border/60 rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="process_name">Process Name</option>
                <option value="process_path">Process Path</option>
                <option value="file_path">File Path</option>
                <option value="dst_ip">Destination IP</option>
                <option value="event_type">Event Type</option>
                <option value="category">Category</option>
              </select>
              <select
                value={newMatchType}
                onChange={(e) => setNewMatchType(e.target.value as WhitelistMatchType)}
                className="appearance-none bg-card border border-border/60 rounded px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="exact">Exact</option>
                <option value="prefix">Starts with</option>
                <option value="contains">Contains</option>
              </select>
              <input
                type="text"
                placeholder="Value..."
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                className="bg-card border border-border/60 rounded px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Note (optional, e.g. 'redis self-inspection')"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                className="flex-1 bg-card border border-border/60 rounded px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={() => {
                  if (!newValue.trim()) return;
                  const entry: WhitelistEntry = {
                    id: crypto.randomUUID(),
                    field: newField,
                    value: newValue.trim(),
                    match_type: newMatchType,
                    note: newNote.trim() || undefined,
                  };
                  setWhitelist((p) => [...p, entry]);
                  setNewValue("");
                  setNewNote("");
                  setSaved(false);
                }}
                disabled={!newValue.trim()}
                className="px-3 py-1.5 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Add
              </button>
            </div>
          </div>

          {/* Current entries */}
          {whitelist.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center py-3">No whitelist entries. Matching events will be suppressed entirely.</p>
          ) : (
            <div className="border border-border/40 rounded-lg overflow-hidden divide-y divide-border/30">
              {whitelist.map((entry) => (
                <div key={entry.id} className="flex items-center gap-3 px-3 py-2 hover:bg-primary/5 transition-colors">
                  <Ban className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/50" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono text-foreground">
                      <span className="text-primary">{entry.field}</span>
                      <span className="text-muted-foreground mx-1">{entry.match_type === "exact" ? "=" : entry.match_type === "prefix" ? "starts with" : "contains"}</span>
                      <span className="text-orange-300">{entry.value}</span>
                    </p>
                    {entry.note && <p className="text-[11px] text-muted-foreground">{entry.note}</p>}
                  </div>
                  <button
                    onClick={() => { setWhitelist((p) => p.filter((e) => e.id !== entry.id)); setSaved(false); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Matching events are dropped before storage — they won't appear in the feed, events table, or trigger alerts.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Agent row ────────────────────────────────────────────────────────────────

function AgentRow({
  agent,
  onRemove,
  onStop,
  onResume,
  onSetup,
  showControls,
}: {
  agent: AgentInfo;
  onRemove: () => void;
  onStop: () => void;
  onResume: () => void;
  onSetup: () => void;
  showControls: boolean;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const statusConfig: Record<string, { dot: string; text: string; label: string }> = {
    online:  { dot: "bg-soc-success animate-pulse", text: "text-soc-success", label: "online" },
    stopped: { dot: "bg-soc-danger",                text: "text-soc-danger",  label: "stopped" },
    offline: { dot: "bg-soc-muted",                 text: "text-soc-muted",   label: "offline" },
    unknown: { dot: "bg-soc-muted",                 text: "text-soc-muted",   label: "unknown" },
  };

  const sc = statusConfig[agent.status] ?? statusConfig.unknown;
  const isOnline  = agent.status === "online";
  const isStopped = agent.status === "stopped";
  const isOffline = agent.status === "offline";

  return (
    <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Monitor className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{agent.hostname}</p>
          <p className="text-xs text-muted-foreground">{agent.platform} · {agent.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
            <span className={`text-xs ${sc.text}`}>{sc.label}</span>
          </div>

          {/* Collector settings toggle */}
          <button
            onClick={() => setSettingsOpen((o) => !o)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors ${
              settingsOpen
                ? "bg-primary/20 text-primary border-primary/40"
                : "text-muted-foreground hover:text-foreground border-border/50 hover:bg-primary/10"
            }`}
            title="Collector settings"
          >
            <Settings2 className="w-3 h-3" />
            Settings
            {settingsOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>

          {isOffline && showControls && (
            <button onClick={onSetup} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-soc-accent hover:bg-soc-accent/10 border border-soc-accent/30 transition-colors">
              <Terminal className="w-3 h-3" /> Setup
            </button>
          )}
          {isOnline && (
            <button onClick={onStop} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-soc-danger hover:bg-soc-danger/10 border border-soc-danger/30 transition-colors">
              <Square className="w-3 h-3" /> Stop
            </button>
          )}
          {isStopped && (
            <button onClick={onResume} className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-soc-success hover:bg-soc-success/10 border border-soc-success/30 transition-colors">
              <Play className="w-3 h-3" /> Resume
            </button>
          )}
          {showControls && (
            <button onClick={onRemove} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable collector settings — per agent */}
      {settingsOpen && <CollectorPanel agent={agent} />}
    </div>
  );
}

// ── Add agent modal (inline, minimal) ────────────────────────────────────────

function AddAgentModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [hostname, setHostname] = useState("");
  const [agentId, setAgentId] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  if (createdId) {
    return <SetupInstructionsModal agentId={createdId} platform="macos" onClose={onClose} />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostname.trim()) { setError("Hostname is required"); return; }
    setSubmitting(true); setError(null);
    try {
      const id = agentId.trim() || `macos-${hostname.trim().toLowerCase().replace(/\s+/g, "-")}`;
      await api.registerAgent({ agent_id: id, hostname: hostname.trim(), platform: "macos", ip_address: ipAddress.trim() || undefined });
      onAdded();
      setCreatedId(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add agent";
      setError(msg.includes("409") ? "An agent with this ID already exists" : msg);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-foreground mb-4">Add Agent</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Hostname *</label>
            <input type="text" value={hostname} onChange={(e) => setHostname(e.target.value)} placeholder="e.g. gals-macbook"
              className="w-full px-3 py-2 rounded-md bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" autoFocus />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">IP Address <span className="opacity-50">(optional)</span></label>
            <input type="text" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} placeholder="e.g. 192.168.1.10"
              className="w-full px-3 py-2 rounded-md bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
          </div>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">Agent ID <span className="opacity-50">(optional)</span></label>
            <input type="text" value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="Auto-generated from hostname"
              className="w-full px-3 py-2 rounded-md bg-background border border-border text-foreground text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-md border border-border hover:bg-background transition-colors">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-md transition-colors">
              {submitting ? "Adding..." : "Add Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [setupAgent, setSetupAgent] = useState<{ id: string; platform: Platform } | null>(null);
  const { agentVersion } = useWebSocket();

  const load = useCallback(async () => {
    try { setAgents(await api.getAgents()); } catch {}
  }, []);

  useEffect(() => { load(); const t = setInterval(load, AGENT_POLL_INTERVAL_MS); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (agentVersion > 0) load(); }, [agentVersion, load]);

  const handleRemove = async (id: string, hostname: string) => {
    if (!confirm(`Remove agent "${hostname}"?`)) return;
    try { await api.deleteAgent(id); load(); } catch {}
  };
  const handleStop = async (id: string, hostname: string) => {
    if (!confirm(`Stop agent "${hostname}"? It will stop collecting logs.`)) return;
    try { await api.stopAgent(id); load(); } catch {}
  };
  const handleResume = async (id: string) => {
    try { await api.resumeAgent(id); load(); } catch {}
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Agents</h2>
        <Button size="sm" onClick={() => setShowAddModal(true)} className="gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add Agent
        </Button>
      </div>

      <Card>
        <CardContent className="px-4 py-4">
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No agents registered</p>
          ) : (
            <div className="space-y-3">
              {agents.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  showControls
                  onRemove={() => handleRemove(agent.id, agent.hostname)}
                  onStop={() => handleStop(agent.id, agent.hostname)}
                  onResume={() => handleResume(agent.id)}
                  onSetup={() => setSetupAgent({ id: agent.id, platform: agent.platform })}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {showAddModal && <AddAgentModal onClose={() => setShowAddModal(false)} onAdded={load} />}
      {setupAgent && <SetupInstructionsModal agentId={setupAgent.id} platform={setupAgent.platform} onClose={() => setSetupAgent(null)} />}
    </div>
  );
}
