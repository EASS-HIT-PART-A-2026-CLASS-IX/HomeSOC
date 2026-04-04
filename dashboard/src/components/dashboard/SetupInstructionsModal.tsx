import { useEffect, useState } from "react";
import { Check, Copy, Terminal, X } from "lucide-react";
import { Platform } from "../../types/events";
import { api } from "../../api/client";

interface SetupCommand {
  label: string;
  description: string;
  cmd: string;
}

interface SetupData {
  api_key: string;
  backend_url: string;
  agent_id: string;
  platform: string;
  commands: SetupCommand[];
  notes: string[];
}

interface SetupInstructionsModalProps {
  agentId: string;
  platform: Platform;
  onClose: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 text-xs rounded text-soc-muted hover:text-soc-text hover:bg-soc-border transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-soc-success" />
          <span className="text-soc-success">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          Copy
        </>
      )}
    </button>
  );
}

export function SetupInstructionsModal({ agentId, platform, onClose }: SetupInstructionsModalProps) {
  const [setup, setSetup] = useState<SetupData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAgentSetup(agentId, platform)
      .then(setSetup)
      .catch(() => setError("Failed to load setup instructions. Is the backend running?"));
  }, [agentId, platform]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-soc-card border border-soc-border rounded-xl p-6 w-full max-w-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-soc-text flex items-center gap-2">
            <Terminal className="w-4 h-4 text-soc-accent" />
            Run Agent on This Machine
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-soc-danger/10 text-soc-muted hover:text-soc-danger transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <p className="text-sm text-soc-danger">{error}</p>
        )}

        {!setup && !error && (
          <p className="text-sm text-soc-muted">Loading instructions...</p>
        )}

        {setup && (
          <div className="space-y-4">
            <p className="text-sm text-soc-muted">
              From the <span className="text-soc-text font-medium">HomeSoc project root</span>, run each command in your terminal:
            </p>

            <div className="space-y-3">
              {setup.commands.map((step, i) => (
                <div key={i} className="rounded-lg bg-soc-bg border border-soc-border overflow-hidden">
                  {/* Step header with label and copy button */}
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-soc-border">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-soc-accent">Step {i + 1}</span>
                      <span className="text-xs text-soc-text">{step.label}</span>
                    </div>
                    <CopyButton text={step.cmd} />
                  </div>
                  {/* What this command does */}
                  <p className="px-3 pt-2 text-xs text-soc-muted">{step.description}</p>
                  {/* The command itself */}
                  <pre className="px-3 py-2.5 text-sm text-soc-text font-mono whitespace-pre-wrap break-all">
                    {step.cmd}
                  </pre>
                </div>
              ))}
            </div>

            {setup.notes.length > 0 && (
              <div className="rounded-lg bg-soc-bg/50 border border-soc-border p-3 space-y-1">
                <p className="text-xs font-medium text-soc-muted uppercase tracking-wide mb-2">Notes</p>
                {setup.notes.map((note, i) => (
                  <p key={i} className="text-xs text-soc-muted">• {note}</p>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm bg-soc-accent hover:bg-soc-accent/80 text-white rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
