import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";

export function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(u: string, p: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: u, password: p }),
      });
      if (!res.ok) {
        setError("Invalid username or password.");
        return;
      }
      const data = await res.json();
      localStorage.setItem("homesoc_token", data.access_token);
      navigate("/", { replace: true });
    } catch {
      setError("Cannot reach the backend. Is it running?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-soc-bg flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-xl border border-border/50 bg-background/60">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">HomeSOC</h1>
          <p className="text-sm text-muted-foreground">Security Operations Center</p>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit(username, password)}
              className="w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="username"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit(username, password)}
              className="w-full rounded-md border border-border bg-background/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="password"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            className="w-full"
            onClick={() => submit(username, password)}
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign In"}
          </Button>
        </div>

        <div className="border-t border-border/40 pt-4 space-y-2">
          <p className="text-xs text-center text-muted-foreground">
            No account? Try the demo:
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => submit("demo", "demo")}
            disabled={loading}
          >
            Enter as Demo
          </Button>
          <p className="text-xs text-center text-muted-foreground/60">
            demo · demo — viewer access
          </p>
        </div>
      </div>
    </div>
  );
}
