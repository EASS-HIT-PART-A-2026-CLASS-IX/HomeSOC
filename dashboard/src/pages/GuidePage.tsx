import { useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Activity,
  AlertTriangle,
  Monitor,
  Shield,
  Settings,
  Globe,
  Cpu,
  Database,
  Terminal,
  HelpCircle,
  Workflow,
  Network,
  Eye,
  FileText,
  Bell,
  Zap,
  Lock,
  RefreshCw,
} from "lucide-react";

/* ────────────────────────────── Guide Data ────────────────────────────── */

interface FAQ {
  q: string;
  a: string;
}

interface GuideSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  intro: string;
  content: string[];
  faqs: FAQ[];
}

const sections: GuideSection[] = [
  /* ── 1. Overview ── */
  {
    id: "overview",
    icon: <BookOpen className="w-4 h-4" />,
    title: "What is HomeSOC?",
    intro:
      "HomeSOC (Home Security Operations Center) is a self-hosted system that monitors the security of your local devices in real time. Think of it as a mini enterprise security platform — but designed for your home network.",
    content: [
      "HomeSOC watches what happens on your Mac by running a lightweight **agent** that collects security-relevant events — things like processes being launched, network connections being made, files being created, and login attempts.",
      "Those events are sent to a central **backend server** running on your machine. The backend stores everything in a local database, runs **detection rules** to spot suspicious activity, and streams results to a live **dashboard** you can view in your browser.",
      "Everything runs locally on your network. No data leaves your home. There are no cloud dependencies, no subscriptions, and no third parties involved.",
      "The system is built with three main pieces:\n• **Agents** — Small Python programs that run on each device you want to monitor.\n• **Backend** — A FastAPI server that receives events, stores them, runs detections, and serves the dashboard API.\n• **Dashboard** — A React web app that shows you everything in real time.",
    ],
    faqs: [
      {
        q: "Do I need to be a security expert to use this?",
        a: "No. HomeSOC is designed to be approachable. The dashboard shows you plain-language information about what's happening. Detection rules are pre-configured to catch common suspicious patterns. You can learn as you go.",
      },
      {
        q: "Does HomeSOC send any data to the internet?",
        a: "No. Everything stays on your local network. The backend runs on your machine, agents communicate over your LAN, and the dashboard is served locally. No external servers are contacted.",
      },
      {
        q: "What devices can HomeSOC monitor?",
        a: "macOS. The agent uses Apple's Endpoint Security framework (eslogger) for process, file, and auth events, and lsof for network connection monitoring.",
      },
      {
        q: "Is this a replacement for antivirus software?",
        a: "No. HomeSOC is a visibility and detection tool — it helps you see what's happening and flags suspicious patterns. It does not block or quarantine threats. Think of it as a security camera system, not a guard. You should still use antivirus/EDR software alongside it.",
      },
    ],
  },

  /* ── 2. Dashboard ── */
  {
    id: "dashboard",
    icon: <LayoutDashboard className="w-4 h-4" />,
    title: "Dashboard Page",
    intro:
      "The Dashboard is your home screen — a real-time snapshot of the security posture across all your monitored devices.",
    content: [
      "**Stat Cards** — The four cards at the top give you instant numbers:\n• **Events (24h)** — Total security events collected in the last 24 hours. Click to go to the Events page.\n• **Open Alerts** — How many alerts need your attention. Red if > 0, green if clear. Click to go to Alerts.\n• **Agents Online** — How many of your agents are currently reporting in (e.g., \"1 / 2\" means 1 of 2 agents is online). Click to go to Agents.\n• **Detection Rules** — How many rules the detection engine currently has loaded. Click to go to Rules.",
      "**Event Timeline** — The area chart shows event volume over the last 60 minutes, broken into one-minute buckets. The blue area is total events, the red area is high/critical severity events. If the chart is flat, it means no events arrived in that time window. Spikes indicate bursts of activity — worth investigating if they're red.",
      "**Live Feed** — The left panel shows the most recent events as they arrive in real time. Each line shows:\n• A colored dot for severity (green = info, blue = low, yellow = medium, red = high, dark red = critical).\n• A timestamp.\n• A category tag (PROC, NET, FILE, AUTH, etc.).\n• A summary of what happened.\nThis is the raw pulse of your network — useful for watching activity as it happens.",
      "**Alerts Panel** — The right panel shows active (open) alerts. Each alert has a severity-colored left border, the rule that triggered it, a timestamp, and a description of what was detected. You can acknowledge alerts directly from here.",
      "**Agent Status** — Below the alerts panel, you can see which agents are online or offline and their hostname.",
      "**Category Breakdown** — The bar chart at the bottom shows how events are distributed across categories (Process, Network, File, Auth, etc.) over the last 24 hours. This helps you understand what type of activity dominates your environment.",
    ],
    faqs: [
      {
        q: "Why is the Event Timeline flat even though I have events?",
        a: "The timeline only shows the last 60 minutes. If your events are older than that, they won't appear on the chart. Try generating fresh test events or running your agent to produce new data.",
      },
      {
        q: "What do the severity colors mean?",
        a: "• Info (gray) — Normal activity, logged for visibility.\n• Low (blue) — Slightly unusual but probably harmless.\n• Medium (yellow) — Worth a look. Could be legitimate or suspicious.\n• High (red) — Likely suspicious. Investigate soon.\n• Critical (dark red) — Strongly indicates malicious or dangerous activity. Act immediately.",
      },
      {
        q: "How often does the dashboard refresh?",
        a: "The stat cards and category breakdown refresh automatically (default every 15 seconds — configurable in Settings). The live feed and timeline update instantly via WebSocket as events arrive.",
      },
    ],
  },

  /* ── 3. Events ── */
  {
    id: "events",
    icon: <Activity className="w-4 h-4" />,
    title: "Events Page",
    intro:
      "The Events page is your detailed log of every security event collected by your agents. This is where you go to investigate specific activity.",
    content: [
      "**What is an event?** An event is a single action recorded by an agent — a process being executed, a network connection being opened, a file being created, a login attempt, etc. Every event is normalized into a common format regardless of which platform it came from.",
      "**Event Table** — Each row shows:\n• **Time** — When the event occurred.\n• **Severity** — Color-coded badge (info / low / medium / high / critical).\n• **Category** — What kind of event it is (process, network, file, auth, service, system).\n• **Type** — The specific event sub-type (e.g., process_exec, network_connection, file_create).\n• **Process** — The name of the process involved (if applicable).\n• **Details** — A one-line summary (destination IP:port for network, file path for file events, success/failure for auth).\n• **Source** — Where the event data came from (eslogger, lsof, etc.).",
      "**Expanding a row** — Click any event row to expand it. This reveals the full raw JSON data, which includes every field the agent collected. This is useful for deep investigation.",
      "**Filters** — Use the Category and Severity dropdowns at the top to narrow down what you're looking at. For example, filter to \"network\" + \"high\" to see only suspicious network connections.",
      "**Clear All** — The red trash button clears all events from the database. This is permanent and cannot be undone. A confirmation dialog will appear first (unless you disabled it in Settings).",
      "**Refresh** — The blue refresh button re-fetches events from the backend. Useful after clearing or if you want to see the latest data without waiting.",
    ],
    faqs: [
      {
        q: "What are the event categories?",
        a: "• **Process** — A program was started, stopped, or signaled. Examples: bash launched, python executed, SIGKILL sent.\n• **Network** — A network connection was made or observed. Examples: curl connecting to an external IP, ssh session opened.\n• **File** — A file was created, opened, or renamed. Examples: new file in /tmp, .plist created in LaunchDaemons.\n• **Auth** — A login attempt occurred. Examples: password login succeeded, biometric authentication failed.\n• **Service** — A system service changed state.\n• **System** — General system-level events.",
      },
      {
        q: "Why do I see so many 'info' severity events?",
        a: "Most system activity is normal and harmless — that's info severity. HomeSOC logs it for visibility and forensic context. The important events are medium, high, and critical. Use the severity filter to focus on those if the volume is overwhelming.",
      },
      {
        q: "What does 'source: eslogger' mean?",
        a: "It means the event came from Apple's Endpoint Security framework via the eslogger tool. This is the primary data source on macOS for process, file, and authentication events. It requires sudo and Full Disk Access to run.",
      },
      {
        q: "How long are events retained?",
        a: "By default, the backend retains events for 7 days. This is configurable in the backend settings. INFO events may be pruned more aggressively in future versions.",
      },
    ],
  },

  /* ── 4. Alerts ── */
  {
    id: "alerts",
    icon: <AlertTriangle className="w-4 h-4" />,
    title: "Alerts Page",
    intro:
      "Alerts are generated automatically when incoming events match a detection rule. They represent activity that HomeSOC believes is suspicious or dangerous.",
    content: [
      "**How alerts are created** — Every event that arrives at the backend passes through the detection engine. The engine checks the event against all loaded YAML rules. If a rule matches, an alert is created and stored in the database. You are notified in real time via the dashboard.",
      "**Alert details** — Each alert card shows:\n• **Severity badge** — Critical, High, Medium, Low, or Info.\n• **Rule name** — Which detection rule triggered (e.g., \"Suspicious Shell Spawn\", \"Known C2 Port Connection\").\n• **Time** — When the alert was created.\n• **Description** — What happened, in plain language. For example: \"Process nc executed from /tmp/nc\" or \"Outbound connection to 203.0.113.50:4444\".",
      "**Alert lifecycle** — Alerts start as **Open**. You can click the **ACK** (Acknowledge) button to mark them as acknowledged, meaning you've seen them and are aware. Alerts can also be resolved or marked as false positives via the API.",
      "**Clear All** — Permanently removes all alerts. Be careful — this cannot be undone.",
      "**Two types of detection rules create alerts:**\n• **Single-event rules** — Match one event immediately. Example: a process named \"nmap\" is executed → instant alert.\n• **Threshold rules** — Count matching events over a time window. Example: 5 failed login attempts within 60 seconds → alert fires on the 5th failure.",
    ],
    faqs: [
      {
        q: "I got an alert — what should I do?",
        a: "Read the alert description carefully. Check the rule name to understand what pattern was detected. Then go to the Events page and look at the related events for more context. For example, if you see \"Suspicious Shell Spawn\", check what parent process launched the shell and whether you initiated it yourself.",
      },
      {
        q: "What does 'ACK' mean?",
        a: "ACK stands for Acknowledge. Clicking it tells HomeSOC \"I've seen this alert and I'm aware of it.\" It doesn't resolve the issue — it just moves the alert from 'open' to 'acknowledged' so it doesn't clutter your open alerts list.",
      },
      {
        q: "Can I get browser notifications for alerts?",
        a: "Yes! Go to Settings and enable \"Alert Notifications\" under the Notifications section. Your browser will ask for notification permission. Once granted, you'll get desktop pop-ups for high and critical severity alerts.",
      },
      {
        q: "Why am I getting false positive alerts?",
        a: "Detection rules are tuned for general use and may flag legitimate activity. For example, if you use nmap for your own network scanning, the \"Suspicious Recon Tool\" rule will trigger. You can mark alerts as false positives. In the future, rule tuning and whitelisting features will help reduce noise.",
      },
    ],
  },

  /* ── 5. Agents ── */
  {
    id: "agents",
    icon: <Monitor className="w-4 h-4" />,
    title: "Agents Page",
    intro:
      "Agents are the lightweight programs that run on each device you want to monitor. They collect security events and send them to the backend.",
    content: [
      "**What agents do** — The agent runs on your Mac and continuously collects security-relevant data using native macOS tools. It normalizes everything into a common event format and sends batches of events to the backend server over HTTP.",
      "**macOS agent** — Uses two collectors:\n• **eslogger** — Apple's Endpoint Security framework. Monitors process executions, file operations, authentication attempts, and signals. This is the most detailed data source. Requires running with `sudo` and the terminal app needs Full Disk Access.\n• **Network (lsof)** — Polls active network connections every 15 seconds. Shows which processes are connecting to which IP addresses and ports.",
      "**Agent status** — Each agent sends a heartbeat to the backend every 30 seconds. If no heartbeat is received for 60 seconds, the agent is marked offline. The green pulsing dot means online; gray means offline.",
      "**Buffering** — If the backend goes down, agents buffer events locally (up to 100,000 events). When the backend comes back, the agent drains the backlog automatically. No events are lost during temporary outages.",
      "**Removing agents** — Click the X button next to an agent to remove it from the backend. This deletes the agent's registration but does not stop the agent process itself. If the agent is still running, it will re-register on its next heartbeat.",
    ],
    faqs: [
      {
        q: "How do I start the macOS agent?",
        a: "Open a terminal and run:\n\n  cd agents/macos\n  sudo python main.py --backend-url http://localhost:8443 --agent-id <your-agent-id> --api-key <your-api-key>\n\nThe easiest way is to add the agent on the Agents page and click the Setup button — it shows the exact command with your API key pre-filled. You need sudo because eslogger requires root access. Your terminal app also needs Full Disk Access (System Settings → Privacy & Security → Full Disk Access).",
      },
      {
        q: "Why does the agent need sudo / root access?",
        a: "On macOS, the eslogger tool accesses the Endpoint Security framework, which is a kernel-level API. Apple restricts this to root processes for security reasons. Without sudo, eslogger won't start and the agent will only collect network data.",
      },
      {
        q: "What if an agent shows as offline?",
        a: "It means the backend hasn't received a heartbeat in the last 60 seconds. Common causes: the agent process crashed or was stopped, the device went to sleep, or there's a network issue between the agent and backend. Check that the agent process is still running.",
      },
      {
        q: "Can I run multiple agents on the same machine?",
        a: "Yes, but there's usually no reason to. Each agent generates a unique ID based on hostname + UUID. Running two would produce duplicate events. Use one agent per device.",
      },
      {
        q: "How much bandwidth do agents use?",
        a: "Very little. Events are batched (100 events per batch or every 5 seconds) and sent as compressed JSON over HTTP. On a typical home machine, this is a few kilobytes per batch — negligible on a local network.",
      },
    ],
  },

  /* ── 6. Rules ── */
  {
    id: "rules",
    icon: <Shield className="w-4 h-4" />,
    title: "Detection Rules Page",
    intro:
      "Detection rules define what HomeSOC considers suspicious. They are written in YAML and loaded by the backend on startup.",
    content: [
      "**How rules work** — Every event that arrives at the backend is checked against all loaded rules. If an event matches a rule's conditions, an alert is generated. Rules are grouped by their source YAML file.",
      "**Rule types:**\n• **Single-event** — Matches one event at a time. If the event's fields match the rule's conditions, it fires immediately. Example: \"Process name is nmap\" → alert.\n• **Threshold** — Counts matching events within a sliding time window. Fires only when the count exceeds the threshold. Example: \"5 failed login attempts within 60 seconds\" → alert on the 5th match.",
      "**Conditions explained:**\n• **category / event_type** — The event must be this category and type (e.g., process + process_exec).\n• **match** — An exact field match. Example: auth_success = false.\n• **match_any** — The field value must be one of the listed values. Example: process_name must be one of [bash, zsh, sh].\n• **not_match** — The field value must NOT be in the list. Used for exclusions. Example: exclude Terminal.app, iTerm2, VSCode from the suspicious shell rule.\n• **match_any_prefix** — The field starts with one of the listed prefixes. Supports wildcards. Example: process_path starts with /tmp/ or /var/tmp/.\n• **not_match_prefix** — The field must NOT start with any listed prefix.\n• **match_any_contains** — The field contains one of the listed substrings.",
      "**Default rules included:**\n1. **Suspicious Shell Spawn** (HIGH) — bash/zsh/sh started from a non-terminal process.\n2. **Execution from Temp Directory** (MEDIUM) — Process running from /tmp, /var/tmp, or ~/Downloads.\n3. **Suspicious Recon Tool** (HIGH) — nmap, nc, netcat, tcpdump, socat executed.\n4. **Launch Daemon Created** (HIGH) — New file in LaunchDaemons or LaunchAgents directories.\n5. **Unusual Outbound Port** (MEDIUM) — External connection on an uncommon port.\n6. **Known C2 Port** (CRITICAL) — Connection to ports commonly used by malware (4444, 1337, 6667, etc.).\n7. **Brute Force Auth** (CRITICAL) — 5+ failed logins in 60 seconds.",
      "**Expanding a rule** — Click any rule card to see its full details: rule ID, type, platform, time window (for threshold rules), threshold count, and the raw conditions JSON. This is useful for understanding exactly what the rule checks.",
    ],
    faqs: [
      {
        q: "Can I write my own detection rules?",
        a: "Yes! Rules are YAML files in the backend/rules/ directory. Create a new .yml file following the format of the existing ones. The backend loads all YAML files from that directory on startup. Restart the backend to pick up new rules.",
      },
      {
        q: "What is a YAML rule file structure?",
        a: "Each file contains a 'rules' array. Each rule has:\n• id — Unique identifier.\n• name — Human-readable name.\n• description — What it detects.\n• severity — info / low / medium / high / critical.\n• type — 'single' or 'threshold'.\n• platform — 'macos' or null (null means applies to all).\n• conditions — Field matching criteria.\n• window_seconds & threshold — Only for threshold rules.",
      },
      {
        q: "Why did a rule trigger when the activity was legitimate?",
        a: "Rules are generic by design — they flag patterns, not intent. For example, running nmap for your own network audit is legitimate but still matches the \"Suspicious Recon Tool\" rule. Review the alert and acknowledge or mark it as a false positive.",
      },
      {
        q: "What is a C2 port?",
        a: "C2 stands for Command and Control. Malware often communicates with attacker-controlled servers on specific ports like 4444, 1337, 6667, 5555, 9001, 8888, or 31337. If a process on your machine connects to one of these ports on an external IP, it could indicate a compromise. HomeSOC flags this as CRITICAL severity.",
      },
      {
        q: "What is a threshold rule?",
        a: "A threshold rule counts how many times a matching event occurs within a time window. It only fires an alert once the count exceeds the threshold. For example, the brute force rule watches for failed auth events. One failed login is normal (you mistyped your password). Five within 60 seconds suggests an automated attack.",
      },
    ],
  },

  /* ── 7. Settings ── */
  {
    id: "settings",
    icon: <Settings className="w-4 h-4" />,
    title: "Settings Page",
    intro:
      "The Settings page lets you customize the dashboard experience. All settings are saved in your browser and persist across page reloads.",
    content: [
      "**Appearance**\n• **Theme** — Switch between Dark and Light mode. Dark is the default and easier on the eyes for security monitoring. Light mode is available if you prefer a brighter interface.\n• **Accent Color** — Change the highlight color used throughout the dashboard. Choose from Blue (default), Purple, Emerald, Rose, Amber, or Cyan. This affects buttons, active navigation items, chart colors, and other interactive elements.\n• **Compact Mode** — Reduces padding and spacing for a denser information display. Useful on smaller screens.",
      "**Live Feed**\n• **Max Visible Events** — Controls how many events appear in the Live Feed panel on the Dashboard. Options: 50, 100 (default), 200, 500. Higher values use more memory.\n• **Auto-Scroll** — When enabled, the Live Feed automatically scrolls to show the newest events as they arrive.",
      "**Time & Display**\n• **Time Format** — Choose between 24-hour (default, e.g., 14:30:05) and 12-hour (e.g., 2:30:05 PM) format for timestamps.\n• **Show Seconds** — Toggle whether timestamps include seconds. Disabling this gives cleaner-looking timestamps.",
      "**Dashboard**\n• **Refresh Interval** — How often the dashboard summary (stat cards, category breakdown) auto-refreshes. Options: 5s, 10s, 15s (default), 30s, 60s. Lower values give fresher data but create more API requests.\n• **Confirm Before Clear** — When enabled (default), a confirmation dialog appears before clearing events or alerts. Disable if you find the prompts annoying.",
      "**Notifications**\n• **Alert Notifications** — Enable browser desktop notifications for high and critical severity alerts. When you toggle this on, your browser will ask for notification permission. If denied, the setting won't activate.",
      "**Reset to Defaults** — The link in the top-right corner resets all settings back to factory defaults.",
    ],
    faqs: [
      {
        q: "Where are my settings stored?",
        a: "In your browser's localStorage under the key 'homesoc_settings'. They are not synced across browsers or devices. Clearing your browser data will reset them.",
      },
      {
        q: "Why doesn't the accent color change the chart category colors?",
        a: "Chart category colors (blue for Process, purple for Network, cyan for File, etc.) are fixed semantic colors — they represent specific categories and stay consistent regardless of your accent color. The accent color affects interactive elements like buttons, navigation highlights, and the event timeline.",
      },
      {
        q: "I enabled notifications but don't see any pop-ups.",
        a: "Check your browser notification permissions. In Chrome: Settings → Privacy and Security → Site Settings → Notifications. Make sure localhost is allowed. Also, notifications only fire for high and critical alerts, not all alerts.",
      },
    ],
  },

  /* ── 8. WebSocket / Live Connection ── */
  {
    id: "connection",
    icon: <Globe className="w-4 h-4" />,
    title: "Live Connection (WebSocket)",
    intro:
      "The header shows a connection status indicator in the top-right corner. This reflects the real-time WebSocket connection between your browser and the backend.",
    content: [
      "**Connection states:**\n• **Live** (green Wifi icon) — Connected and receiving events in real time. Everything is working.\n• **Connecting...** (yellow spinner) — Attempting to establish or re-establish the WebSocket connection. This is normal during page load or after a network blip.\n• **Paused** (yellow pause icon) — You manually paused the live feed. No events are being received. Click to resume.\n• **Disconnected** (red WifiOff icon) — The connection to the backend is down. This usually means the backend server isn't running or isn't reachable.",
      "**Toggle button** — Click the connection indicator to toggle the live feed:\n• If live or connecting → pauses the feed (stops receiving events, stops auto-reconnect).\n• If paused or disconnected → resumes the feed (reconnects to the backend).",
      "**Auto-reconnect** — When the WebSocket connection drops unexpectedly (backend restart, network issue), HomeSOC automatically tries to reconnect with exponential backoff starting at 2 seconds, up to a maximum of 30 seconds between attempts. If you manually pause, auto-reconnect is disabled until you resume.",
      "**Keep-alive** — The dashboard sends a ping to the backend every 30 seconds to keep the WebSocket connection alive and detect stale connections.",
    ],
    faqs: [
      {
        q: "Why is the status stuck on 'Connecting...'?",
        a: "The backend is probably not running. Start it with: cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8443 --reload. The dashboard will connect automatically once the backend is up.",
      },
      {
        q: "What happens to events while I'm paused?",
        a: "Events are still being collected by agents and stored by the backend. You're just not seeing them in real time. When you resume, historical events are loaded from the API. You won't miss anything permanently — you just won't see the live stream.",
      },
      {
        q: "Does pausing stop the agents?",
        a: "No. Pausing only affects the browser's WebSocket connection to the backend. Agents continue running, collecting, and sending events to the backend regardless of the dashboard state.",
      },
    ],
  },

  /* ── 9. Backend & API ── */
  {
    id: "backend",
    icon: <Database className="w-4 h-4" />,
    title: "Backend Server",
    intro:
      "The backend is the brain of HomeSOC. It receives events from agents, stores them, runs detection, generates alerts, and serves both the REST API and the WebSocket feed.",
    content: [
      "**Technology** — Built with FastAPI (Python), running on uvicorn. The database is SQLite in WAL (Write-Ahead Logging) mode, which allows simultaneous reads and writes without locking.",
      "**Starting the backend:**\n  cd backend\n  python -m uvicorn main:app --host 0.0.0.0 --port 8443 --reload\n\nThe --reload flag enables auto-restart when you edit backend code. Remove it for production use.",
      "**Swagger UI** — Visit http://localhost:8443/docs in your browser. This is an interactive API documentation page generated automatically by FastAPI. You can explore all endpoints, see request/response schemas, and even test API calls directly from the browser. Useful for debugging and understanding the API.",
      "**Key API endpoints:**\n• POST /api/v1/events — Ingest a batch of events (used by agents).\n• GET /api/v1/events — Query stored events with filters.\n• GET /api/v1/alerts — List alerts.\n• PATCH /api/v1/alerts/{id} — Update alert status.\n• GET /api/v1/agents — List registered agents.\n• GET /api/v1/dashboard/summary — Get dashboard statistics.\n• GET /api/v1/rules — List loaded detection rules.\n• WS /ws/live — WebSocket for real-time streaming.",
      "**Database** — SQLite database stored at backend/data/events.db. WAL mode is enabled for performance. The database stores events, alerts, agents, and detection rule metadata. Events are indexed by timestamp, category, severity, and agent_id for fast queries.",
      "**Ingestion pipeline** — When events arrive via POST:\n1. Each event gets a received_at timestamp.\n2. Events are stored in the database.\n3. Each event passes through the detection engine.\n4. Matching rules generate alerts (stored in DB).\n5. Events and alerts are broadcast to WebSocket clients.",
    ],
    faqs: [
      {
        q: "What port does the backend run on?",
        a: "8443 by default. This is configured in backend/config.py. The dashboard's Vite dev server proxies API requests from localhost:5173 to localhost:8443 automatically.",
      },
      {
        q: "Can I access the API from other tools (curl, Postman)?",
        a: "Yes. The API is standard REST. For example:\n  curl http://localhost:8443/api/v1/events?limit=5\n  curl http://localhost:8443/api/v1/dashboard/summary\n\nNote: in zsh, you may need to quote URLs containing '?' to avoid glob expansion.",
      },
      {
        q: "How do I reset the database?",
        a: "Stop the backend, delete the file backend/data/events.db, and restart. A fresh database will be created automatically with the correct schema.",
      },
      {
        q: "What is WAL mode?",
        a: "WAL (Write-Ahead Logging) is a SQLite journaling mode that allows readers and writers to work simultaneously without blocking each other. This is important for HomeSOC because events can be written (by agents) and read (by the dashboard) at the same time without contention.",
      },
    ],
  },

  /* ── 10. Running & Testing ── */
  {
    id: "running",
    icon: <Terminal className="w-4 h-4" />,
    title: "Getting Started & Testing",
    intro:
      "How to start the system, generate test data, and verify everything works end to end.",
    content: [
      "**Quick start (all-in-one):**\n  ./scripts/dev.sh\n\nThis starts both the backend and dashboard in one command. The backend runs on port 8443, the dashboard on port 5173.",
      "**Manual start (separate terminals):**\nTerminal 1 (Backend):\n  cd backend\n  python -m uvicorn main:app --host 0.0.0.0 --port 8443 --reload\n\nTerminal 2 (Dashboard):\n  cd dashboard\n  npm run dev\n\nTerminal 3 (Agent — optional):\n  cd agents/macos\n  sudo python main.py",
      "**Test event generator** — To test without running real agents:\n  python scripts/generate_test_events.py\n\nThis sends realistic fake events to the backend including process executions, network connections, auth attempts, and file operations. Some events are designed to trigger detection rules so you'll see alerts too.\n\nOptions:\n• --count N — Events per batch (default: 20)\n• --batches M — Number of batches (default: 3)\n• --interval S — Seconds between batches (default: 2)\n• --url URL — Backend URL (default: http://localhost:8443)",
      "**Verification checklist:**\n1. Open http://localhost:5173 — Dashboard should load.\n2. Check the connection indicator — should show Live (green) or Connecting.\n3. Run the test event generator.\n4. Stat cards should update with event counts.\n5. Timeline should show spikes.\n6. Live Feed should show scrolling events.\n7. Alerts panel should show triggered rules.\n8. Check http://localhost:8443/docs — Swagger UI should load.",
    ],
    faqs: [
      {
        q: "The dashboard shows 'Disconnected' — what's wrong?",
        a: "The backend isn't running or isn't reachable. Make sure you started it with uvicorn on port 8443. Check for error messages in the terminal where you started the backend.",
      },
      {
        q: "I get 'command not found: uvicorn'",
        a: "The Python package isn't installed. Install it with: pip install fastapi uvicorn aiosqlite pyyaml pydantic-settings. Make sure you're using the right Python environment.",
      },
      {
        q: "Events are not appearing in the dashboard",
        a: "Check each link in the chain:\n1. Is the backend running? (Check terminal output)\n2. Is the WebSocket connected? (Check header indicator)\n3. Are events being sent? (Check the generator or agent terminal)\n4. Are events stored? Try: curl http://localhost:8443/api/v1/events?limit=5",
      },
      {
        q: "How do I stop everything?",
        a: "If you used dev.sh, press Ctrl+C once — it gracefully shuts down both processes. If you started manually, Ctrl+C each terminal. Agents also respond to Ctrl+C (SIGINT) with graceful shutdown, flushing any buffered events before exiting.",
      },
    ],
  },

  /* ── 11. Architecture Deep Dive ── */
  {
    id: "architecture",
    icon: <Workflow className="w-4 h-4" />,
    title: "Architecture & Data Flow",
    intro:
      "Understanding how data flows through HomeSOC from collection to visualization.",
    content: [
      "**End-to-end flow:**\n1. An agent collector (eslogger or lsof) observes a system event on your Mac.\n2. The collector normalizes it into a NormalizedEvent — a common format with fields for process, file, network, and auth data.\n3. The event is added to the agent's transport buffer.\n4. When the buffer reaches 100 events or 5 seconds elapse, the agent POSTs the batch to the backend's /api/v1/events endpoint.\n5. The backend stores events in SQLite.\n6. The detection engine evaluates each event against all loaded rules.\n7. If a rule matches, an alert is created and stored.\n8. Both events and alerts are broadcast via WebSocket to connected dashboards.\n9. The dashboard updates the Live Feed, Timeline, and Alert Panel in real time.",
      "**The NormalizedEvent** — This is the universal event format. Every collector on every platform converts its raw data into this format. Key fields:\n• id, timestamp, agent_id, platform, category, event_type, severity\n• Process fields: process_name, pid, ppid, path, user, args, hash\n• File fields: file_path, file_action\n• Network fields: src_ip, src_port, dst_ip, dst_port, protocol, dns_query\n• Auth fields: auth_user, auth_method, auth_success\n• raw — The original unmodified data for forensic analysis",
      "**Batching & reliability** — Agents don't send events one at a time. They batch them (100 per batch by default) and send every 5 seconds. If the backend is unreachable, events stay in the local buffer (up to 100,000) and are drained when connectivity returns. This ensures no data loss during backend downtime.",
      "**Detection pipeline** — The detection engine is synchronous and runs inline with ingestion. Every event passes through every rule. This is efficient enough for home-scale traffic (hundreds of events per second). Rules are loaded from YAML files on backend startup.",
    ],
    faqs: [
      {
        q: "What is the NormalizedEvent format?",
        a: "It's a universal schema that all events are converted into, regardless of which collector produced them. A process event from eslogger and a network event from lsof both become NormalizedEvents with the same field structure. This allows the detection engine and dashboard to process all event types consistently.",
      },
      {
        q: "What happens if the backend crashes?",
        a: "Agents buffer events locally and keep retrying. When the backend comes back up, the backlog is automatically drained. The SQLite database (in WAL mode) is crash-safe — partially written transactions are rolled back on restart. No data is lost.",
      },
      {
        q: "Can multiple dashboards connect at the same time?",
        a: "Yes. The WebSocket endpoint supports multiple simultaneous connections. Each connected browser receives the same broadcast events. There's no limit on the number of connected dashboards.",
      },
    ],
  },

  /* ── 12. Security & Privacy ── */
  {
    id: "security",
    icon: <Lock className="w-4 h-4" />,
    title: "Security & Privacy",
    intro:
      "HomeSOC is designed to be secure and privacy-respecting by default.",
    content: [
      "**Local only** — All data stays on your local network. No external servers are contacted. No telemetry is sent. No accounts are required. You own 100% of your data.",
      "**No authentication (MVP)** — The current version does not require API keys or login. This is fine for a home network behind a router/firewall. Future versions will add pre-shared API key authentication for agent-to-backend communication.",
      "**Data sensitivity** — The events collected can include sensitive information: process command-line arguments, file paths, network destinations, usernames, and authentication results. Treat the events.db database file and the dashboard as sensitive. Don't expose the backend port (8443) to the public internet.",
      "**Agent permissions** — The macOS agent requires sudo and Full Disk Access because it accesses kernel-level security APIs. This is the same level of access that commercial EDR (Endpoint Detection & Response) products require. Only run the agent from source code you trust.",
      "**Noise filtering** — Agents filter out known system noise (Apple system frameworks, temporary folder activity, common system processes) before sending events. This reduces volume without losing security-relevant data.",
    ],
    faqs: [
      {
        q: "Is it safe to run this on my home network?",
        a: "Yes, as long as you don't expose the backend port to the internet. Keep it behind your router's firewall. The system only listens on your local network.",
      },
      {
        q: "Can someone on my network see my events?",
        a: "If they can reach port 8443 on the machine running the backend, yes. The API has no authentication in the current version. If this concerns you, bind the backend to 127.0.0.1 instead of 0.0.0.0 so only the local machine can access it.",
      },
      {
        q: "What data does eslogger collect exactly?",
        a: "The HomeSOC agent subscribes to: exec (process execution), create (file creation), open (file opens), rename (file renames), authentication (login attempts), and signal (process signals like SIGKILL). It does NOT collect keystroke data, screen content, clipboard data, or file contents.",
      },
    ],
  },
];

/* ────────────────────────────── Components ────────────────────────────── */

function FAQItem({ faq }: { faq: FAQ }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-soc-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-soc-surface/50 transition-colors"
      >
        <HelpCircle className="w-4 h-4 text-soc-accent flex-shrink-0 mt-0.5" />
        <span className="text-sm font-medium text-soc-text flex-1">{faq.q}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-soc-muted flex-shrink-0 mt-0.5" />
        ) : (
          <ChevronRight className="w-4 h-4 text-soc-muted flex-shrink-0 mt-0.5" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-3 pl-11">
          <p className="text-sm text-soc-muted whitespace-pre-line leading-relaxed">{faq.a}</p>
        </div>
      )}
    </div>
  );
}

function SectionCard({ section, expanded, onToggle }: { section: GuideSection; expanded: boolean; onToggle: () => void }) {
  return (
    <div id={section.id} className="bg-soc-card border border-soc-border rounded-xl overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-soc-surface/30 transition-colors"
      >
        <span className="text-soc-accent">{section.icon}</span>
        <span className="text-sm font-semibold text-soc-text flex-1">{section.title}</span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-soc-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-soc-muted" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-soc-border">
          {/* Intro */}
          <div className="px-5 pt-4 pb-2">
            <p className="text-sm text-soc-text leading-relaxed">{section.intro}</p>
          </div>

          {/* Content blocks */}
          <div className="px-5 pb-4 space-y-3">
            {section.content.map((block, i) => (
              <div key={i} className="text-sm text-soc-muted leading-relaxed whitespace-pre-line">
                {renderBlock(block)}
              </div>
            ))}
          </div>

          {/* FAQ */}
          {section.faqs.length > 0 && (
            <div className="border-t border-soc-border px-5 py-4">
              <h4 className="text-xs font-semibold text-soc-muted uppercase tracking-wider mb-3">
                Frequently Asked Questions
              </h4>
              <div className="space-y-2">
                {section.faqs.map((faq, i) => (
                  <FAQItem key={i} faq={faq} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Render a text block with **bold** markers converted to styled spans */
function renderBlock(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={i} className="font-medium text-soc-text">
          {part.slice(2, -2)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/* ────────────────────────────── Page ────────────────────────────── */

export function GuidePage() {
  const [openId, setOpenId] = useState<string | null>(null);

  const jumpTo = (id: string) => {
    setOpenId(id);
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  return (
    <div className="max-w-3xl space-y-4">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-soc-text flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-soc-accent" />
            Guide & FAQ
          </h2>
          <p className="text-xs text-soc-muted mt-1">
            Everything you need to know about HomeSOC — click any section to expand.
          </p>
        </div>
      </div>

      {/* Quick nav */}
      <div className="bg-soc-card border border-soc-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-soc-muted uppercase tracking-wider mb-3">
          Jump to section
        </h3>
        <div className="flex flex-wrap gap-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => jumpTo(s.id)}
              className="flex items-center gap-1.5 text-xs text-soc-muted hover:text-soc-accent px-2.5 py-1.5 rounded-lg border border-soc-border hover:border-soc-accent/40 transition-colors"
            >
              {s.icon}
              {s.title.replace(/ Page$/, "")}
            </button>
          ))}
        </div>
      </div>

      {/* Sections */}
      {sections.map((section) => (
        <SectionCard
          key={section.id}
          section={section}
          expanded={openId === section.id}
          onToggle={() => setOpenId(openId === section.id ? null : section.id)}
        />
      ))}
    </div>
  );
}
