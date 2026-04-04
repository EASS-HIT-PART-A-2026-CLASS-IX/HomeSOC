import { Monitor, X, Square, Play, Plus, Terminal } from "lucide-react";
import { AgentInfo, Platform } from "../../types/events";
import { useEffect, useState, useCallback } from "react";
import { api } from "../../api/client";
import { useWebSocket } from "../../hooks/useWebSocket";
import { SetupInstructionsModal } from "./SetupInstructionsModal";

interface AgentStatusProps {
  showRemove?: boolean;
}

function AddAgentModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [hostname, setHostname] = useState("");
  const [platform, setPlatform] = useState<Platform>("macos");
  const [ipAddress, setIpAddress] = useState("");
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostname.trim()) {
      setError("Hostname is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const id = agentId.trim() || `${platform}-${hostname.trim().toLowerCase().replace(/\s+/g, "-")}`;
      await api.registerAgent({
        agent_id: id,
        hostname: hostname.trim(),
        platform,
        ip_address: ipAddress.trim() || undefined,
      });
      onAdded();
      setCreatedId(id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to add agent";
      setError(msg.includes("409") ? "An agent with this ID already exists" : msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: show setup instructions after successful registration
  if (createdId) {
    return (
      <SetupInstructionsModal
        agentId={createdId}
        platform={platform}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-soc-card border border-soc-border rounded-xl p-6 w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-soc-text mb-4">Add Agent</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-soc-muted mb-1">Hostname *</label>
            <input
              type="text"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="e.g. gals-macbook"
              className="w-full px-3 py-2 rounded-lg bg-soc-bg border border-soc-border text-soc-text text-sm focus:outline-none focus:border-soc-accent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm text-soc-muted mb-1">Platform *</label>
            <select
              value={platform}
              onChange={() => setPlatform("macos")}
              className="w-full px-3 py-2 rounded-lg bg-soc-bg border border-soc-border text-soc-text text-sm focus:outline-none focus:border-soc-accent"
            >
              <option value="macos">macOS</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-soc-muted mb-1">IP Address <span className="text-soc-muted/50">(optional)</span></label>
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              placeholder="e.g. 192.168.1.10"
              className="w-full px-3 py-2 rounded-lg bg-soc-bg border border-soc-border text-soc-text text-sm focus:outline-none focus:border-soc-accent"
            />
            <p className="text-xs text-soc-muted mt-1">Optional — used for display only, does not affect agent connectivity.</p>
          </div>
          <div>
            <label className="block text-sm text-soc-muted mb-1">Agent ID</label>
            <input
              type="text"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="Auto-generated from hostname"
              className="w-full px-3 py-2 rounded-lg bg-soc-bg border border-soc-border text-soc-text text-sm focus:outline-none focus:border-soc-accent"
            />
            <p className="text-xs text-soc-muted mt-1">Leave blank to auto-generate</p>
          </div>

          {error && <p className="text-sm text-soc-danger">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-soc-muted hover:text-soc-text rounded-lg border border-soc-border hover:bg-soc-bg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm bg-soc-accent hover:bg-soc-accent/80 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {submitting ? "Adding..." : "Add Agent"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function AgentStatus({ showRemove = false }: AgentStatusProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [setupAgent, setSetupAgent] = useState<{ id: string; platform: Platform } | null>(null);
  const { agentVersion } = useWebSocket();

  const load = useCallback(async () => {
    try {
      const data = await api.getAgents();
      setAgents(data as unknown as AgentInfo[]);
    } catch (e) {
      console.error("Failed to load agents:", e);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  // Re-fetch agents instantly when an agent_status WebSocket message arrives
  useEffect(() => {
    if (agentVersion > 0) load();
  }, [agentVersion, load]);

  const handleRemove = async (id: string, hostname: string) => {
    if (!confirm(`Remove agent "${hostname}" (${id})?`)) return;
    try {
      await api.deleteAgent(id);
      load();
    } catch (e) {
      console.error("Failed to remove agent:", e);
    }
  };

  const handleStop = async (id: string, hostname: string) => {
    if (!confirm(`Stop agent "${hostname}"? It will stop collecting logs.`)) return;
    try {
      await api.stopAgent(id);
      load();
    } catch (e) {
      console.error("Failed to stop agent:", e);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await api.resumeAgent(id);
      load();
    } catch (e) {
      console.error("Failed to resume agent:", e);
    }
  };

  const platformIcon: Record<string, string> = {
    macos: "",
  };

  const statusConfig: Record<string, { dot: string; text: string; label: string }> = {
    online: { dot: "bg-soc-success animate-pulse", text: "text-soc-success", label: "online" },
    stopped: { dot: "bg-soc-danger", text: "text-soc-danger", label: "stopped" },
    offline: { dot: "bg-soc-muted", text: "text-soc-muted", label: "offline" },
    unknown: { dot: "bg-soc-muted", text: "text-soc-muted", label: "unknown" },
  };

  return (
    <div className="bg-soc-card border border-soc-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-soc-text flex items-center gap-2">
          <Monitor className="w-4 h-4 text-soc-accent" />
          Agents
        </h3>
        {showRemove && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-soc-accent hover:bg-soc-accent/80 text-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Agent
          </button>
        )}
      </div>

      {showAddModal && (
        <AddAgentModal onClose={() => setShowAddModal(false)} onAdded={load} />
      )}

      {setupAgent && (
        <SetupInstructionsModal
          agentId={setupAgent.id}
          platform={setupAgent.platform}
          onClose={() => setSetupAgent(null)}
        />
      )}

      <div className="space-y-3">
        {agents.length === 0 ? (
          <p className="text-sm text-soc-muted text-center py-4">
            No agents registered
          </p>
        ) : (
          agents.map((agent) => {
            const sc = statusConfig[agent.status] || statusConfig.unknown;
            const isOnline = agent.status === "online";
            const isStopped = agent.status === "stopped";
            const isOffline = agent.status === "offline";

            return (
              <div
                key={agent.id}
                className="flex items-center justify-between p-3 bg-soc-bg/50 rounded-lg border border-soc-border"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {platformIcon[agent.platform] || "💻"}
                  </span>
                  <div>
                    <p className="text-sm text-soc-text font-medium">
                      {agent.hostname}
                    </p>
                    <p className="text-xs text-soc-muted">
                      {agent.platform} &middot; {agent.id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                    <span className={`text-xs ${sc.text}`}>{sc.label}</span>
                  </div>

                  {/* Setup button — shown on offline agents */}
                  {isOffline && showRemove && (
                    <button
                      onClick={() => setSetupAgent({ id: agent.id, platform: agent.platform })}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-soc-accent hover:bg-soc-accent/10 border border-soc-accent/30 transition-colors"
                      title="Show setup instructions"
                    >
                      <Terminal className="w-3 h-3" />
                      Setup
                    </button>
                  )}

                  {/* Stop button — shown when agent is online */}
                  {isOnline && (
                    <button
                      onClick={() => handleStop(agent.id, agent.hostname)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-soc-danger hover:bg-soc-danger/10 border border-soc-danger/30 transition-colors"
                      title="Stop agent — signals the agent to shut down on its next heartbeat (up to 30s). To stop immediately, press Ctrl+C in the terminal where the agent is running."
                    >
                      <Square className="w-3 h-3" />
                      Stop
                    </button>
                  )}

                  {/* Resume button — shown when agent is stopped */}
                  {isStopped && (
                    <button
                      onClick={() => handleResume(agent.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs text-soc-success hover:bg-soc-success/10 border border-soc-success/30 transition-colors"
                      title="Resume agent — start collecting logs again"
                    >
                      <Play className="w-3 h-3" />
                      Resume
                    </button>
                  )}

                  {showRemove && (
                    <button
                      onClick={() => handleRemove(agent.id, agent.hostname)}
                      className="p-1 rounded hover:bg-soc-danger/10 text-soc-muted hover:text-soc-danger transition-colors"
                      title="Remove agent"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
