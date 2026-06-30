import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Calendar,
  Mail,
  FileText,
  CheckSquare,
  Shield,
  Check,
  LogOut,
  Moon,
  Sun,
  Monitor,
  Database,
  Trash2,
  Download,
  RefreshCw,
  Brain,
  Sliders,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown
} from "lucide-react";
import { API_URL } from "../api";

interface SettingsPageProps {
  onLogout: () => void | Promise<void>;
  userProfile: {
    name: string;
    email: string;
    picture?: string;
  } | null;
}

export default function SettingsPage({ onLogout, userProfile }: SettingsPageProps) {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");

  // Account sync states
  const [connections, setConnections] = useState({
    calendar: true,
    gmail: false,
    drive: false,
    tasks: false
  });

  // Autonomy level state
  const [autonomyLevel, setAutonomyLevel] = useState<string>("assisted");

  // Memory dashboard states
  const [memoryContext, setMemoryContext] = useState<{
    preferences: any[];
    semanticFacts: any[];
    recentEpisodes: any[];
    historicalDecisions: any[];
    activeReflections: any[];
  }>({
    preferences: [],
    semanticFacts: [],
    recentEpisodes: [],
    historicalDecisions: [],
    activeReflections: []
  });
  const [loadingMemories, setLoadingMemories] = useState(true);
  const [activeTab, setActiveTab] = useState<"preferences" | "facts" | "episodes">("preferences");
  const [savingPrefs, setSavingPrefs] = useState<{ [id: string]: boolean }>({});
  const [editingPrefs, setEditingPrefs] = useState<{ [id: string]: string }>({});

  // Observations log states
  const [observations, setObservations] = useState<any[]>([]);
  const [showObs, setShowObs] = useState(false);

  // Tool registry & execution logs states
  const [tools, setTools] = useState<any[]>([]);
  const [toolLogs, setToolLogs] = useState<any[]>([]);
  const [loadingTools, setLoadingTools] = useState(true);
  const [rollingBackId, setRollingBackId] = useState<string | null>(null);

  // Apply dark mode theme fully dynamically to document element!
  const applyTheme = (selectedTheme: "light" | "dark" | "system") => {
    setTheme(selectedTheme);
    localStorage.setItem("cos_theme", selectedTheme);
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");

    if (selectedTheme === "dark") {
      root.classList.add("dark");
    } else if (selectedTheme === "light") {
      root.classList.add("light");
    } else {
      // System preference fallback
      const systemPref = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemPref);
    }
  };

  // On page load, sync with active class name or default
  useEffect(() => {
    const savedTheme = (localStorage.getItem("cos_theme") as "light" | "dark" | "system") || "light";
    setTheme(savedTheme);
    fetchMemory();
    fetchObservations();
    fetchAutonomy();
    fetchToolData();
  }, []);

  const fetchToolData = async () => {
    setLoadingTools(true);
    try {
      const [registryRes, logsRes] = await Promise.all([
        fetch(API_URL + "/api/tools/registry"),
        fetch(API_URL + "/api/tools/logs")
      ]);
      if (registryRes.ok) {
        const registryData = await registryRes.json();
        setTools(registryData);
      }
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setToolLogs(logsData);
      }
    } catch (err) {
      console.error("Failed to fetch tool registry or logs:", err);
    } finally {
      setLoadingTools(false);
    }
  };

  const handleToggleTool = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    try {
      const res = await fetch(`${API_URL}/api/tools/registry/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ availabilityStatus: newStatus })
      });
      if (res.ok) {
        await fetchToolData();
      }
    } catch (err) {
      console.error("Failed to toggle tool state:", err);
    }
  };

  const handleRollback = async (operationId: string) => {
    if (!confirm("Are you sure you want to rollback/undo this action? This will undo the changes made in the target system.")) return;
    setRollingBackId(operationId);
    try {
      const res = await fetch(`${API_URL}/api/tools/rollback/${operationId}`, {
        method: "POST"
      });
      if (res.ok) {
        alert("Operation rolled back successfully!");
        await fetchToolData();
      } else {
        const errData = await res.json();
        alert(`Failed to rollback operation: ${errData.error || "Unknown error"}`);
      }
    } catch (err) {
      console.error("Failed to execute rollback:", err);
      alert("Failed to execute rollback due to network error.");
    } finally {
      setRollingBackId(null);
    }
  };

  const fetchAutonomy = async () => {
    try {
      const res = await fetch(API_URL + "/api/governance/autonomy");
      if (res.ok) {
        const data = await res.json();
        setAutonomyLevel(data.autonomyLevel);
      }
    } catch (err) {
      console.error("Failed to fetch autonomy level:", err);
    }
  };

  const handleUpdateAutonomy = async (level: string) => {
    try {
      const res = await fetch(API_URL + "/api/governance/autonomy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autonomyLevel: level })
      });
      if (res.ok) {
        setAutonomyLevel(level);
      }
    } catch (err) {
      console.error("Failed to update autonomy level:", err);
    }
  };

  const fetchMemory = async () => {
    setLoadingMemories(true);
    try {
      const res = await fetch(API_URL + "/api/memory");
      if (res.ok) {
        const data = await res.json();
        setMemoryContext(data);

        // Initialize editing state for preferences
        const editingMap: { [id: string]: string } = {};
        data.preferences.forEach((p: any) => {
          editingMap[p.id] = p.value;
        });
        setEditingPrefs(editingMap);
      }
    } catch (err) {
      console.error("Failed to load memory context:", err);
    } finally {
      setLoadingMemories(false);
    }
  };

  const fetchObservations = async () => {
    try {
      const res = await fetch(API_URL + "/api/learning/observations");
      if (res.ok) {
        const data = await res.json();
        setObservations(data);
      }
    } catch (err) {
      console.error("Failed to fetch observations:", err);
    }
  };

  const handleUpdatePref = async (id: string) => {
    setSavingPrefs(prev => ({ ...prev, [id]: true }));
    try {
      const res = await fetch(`${API_URL}/api/memory/preferences/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: editingPrefs[id] })
      });
      if (res.ok) {
        await fetchMemory();
      }
    } catch (err) {
      console.error("Failed to update preference:", err);
    } finally {
      setSavingPrefs(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleFeedback = async (id: string, feedback: "up" | "down") => {
    try {
      const res = await fetch(`${API_URL}/api/memory/preferences/${id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback })
      });
      if (res.ok) {
        await fetchMemory();
        await fetchObservations();
      }
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  };

  const handleDeleteMemory = async (layer: string, id: string) => {
    if (confirm(`Are you sure you want Guardian Core to forget this item from your ${layer} memory? This action is permanent.`)) {
      try {
        const res = await fetch(`${API_URL}/api/memory/${layer}/${id}`, {
          method: "DELETE"
        });
        if (res.ok) {
          await fetchMemory();
        }
      } catch (err) {
        console.error("Failed to delete memory record:", err);
      }
    }
  };

  const handleResetPersonalization = async () => {
    if (confirm("WARNING: This will completely erase all learned user preferences, historical decisions, completed episodes, and semantic facts. You will return to standard cognitive defaults. Proceed?")) {
      try {
        const res = await fetch(API_URL + "/api/memory/reset", {
          method: "POST"
        });
        if (res.ok) {
          await fetchMemory();
          await fetchObservations();
          alert("Personalization reset successfully.");
        }
      } catch (err) {
        console.error("Failed to reset memory:", err);
      }
    }
  };

  const handleExportMemory = () => {
    window.open(API_URL + "/api/memory/export", "_blank");
  };

  const toggleConnection = (key: keyof typeof connections) => {
    setConnections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="space-y-8 font-sans pb-12">
      {/* Page Header */}
      <div className="border-b border-apple-hairline pb-5">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-apple-ink font-display flex items-center gap-2">
          <Shield className="w-6 h-6 text-apple-blue" /> Preferences & Connections
        </h2>
        <p className="text-[14px] text-gray-500 font-light mt-1.5 leading-relaxed">
          Manage your strategic credentials, interface display parameters, and Google Workspace account authorizations.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 text-left">
        {/* Main Settings card */}
        <div className="lg:col-span-2 space-y-6">

          {/* Theme switcher */}
          <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-[16px] font-semibold text-apple-ink font-display tracking-tight">
                Interface Display
              </h3>
              <p className="text-[12px] text-gray-400 font-light mt-0.5">
                Toggle between light and dark canvas surfaces.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "light", label: "Light Mode", icon: Sun },
                { id: "dark", label: "Dark Mode", icon: Moon },
                { id: "system", label: "System Sync", icon: Monitor }
              ].map(item => {
                const IconComp = item.icon;
                const isActive = theme === item.id;
                return (
                  <button
                    key={item.id}
                    id={`theme-select-${item.id}`}
                    onClick={() => applyTheme(item.id as any)}
                    className={`p-4 rounded-[18px] border text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${isActive
                        ? "bg-apple-blue/5 border-apple-blue text-apple-blue font-semibold"
                        : "bg-white border-apple-hairline hover:bg-apple-surface-pearl text-gray-500"
                      }`}
                  >
                    <IconComp className="w-5 h-5" />
                    <span className="text-[12.5px] tracking-tight">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AUTONOMY GOVERNANCE CONTROLS PANEL (CHAPTER 12) */}
          <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-4">
            <div>
              <h3 className="text-[16px] font-semibold text-apple-ink font-display tracking-tight flex items-center gap-1.5">
                <Shield className="w-5 h-5 text-apple-blue" /> Autonomous Governance & Policies
              </h3>
              <p className="text-[12px] text-gray-400 font-light mt-0.5">
                Select the operational boundary limits. Higher levels authorize execution without manual gates.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { id: "advisory", label: "Level 0: Advisory", desc: "No actions are performed automatically; recommendations only." },
                { id: "assisted", label: "Level 1: Assisted", desc: "AI drafts workspace plans and sessions; user confirms execution." },
                { id: "delegated", label: "Level 2: Delegated", desc: "Low-risk routines run autonomously; elevated risk requires review." },
                { id: "trusted_automation", label: "Level 3: Trusted", desc: "Fully automated updates, shifts, and notifications." }
              ].map(level => {
                const isActive = autonomyLevel === level.id;
                return (
                  <button
                    key={level.id}
                    onClick={() => handleUpdateAutonomy(level.id)}
                    className={`p-4 rounded-[18px] border text-left flex flex-col gap-1 transition-all cursor-pointer ${isActive
                        ? "bg-apple-blue/5 border-apple-blue text-apple-ink"
                        : "bg-white border-apple-hairline hover:bg-apple-surface-pearl text-gray-500"
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[13px] font-semibold tracking-tight ${isActive ? 'text-apple-blue' : 'text-apple-ink'}`}>{level.label}</span>
                      {isActive && <Check className="w-4 h-4 text-apple-blue shrink-0" />}
                    </div>
                    <p className="text-[11px] text-gray-400 font-light leading-relaxed">{level.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Connected accounts */}
          <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-5">
            <div>
              <h3 className="text-[16px] font-semibold text-apple-ink font-display tracking-tight">
                Connected Google Accounts
              </h3>
              <p className="text-[12px] text-gray-400 font-light mt-0.5">
                Grant secure access to Google Workspace APIs to synchronise milestones.
              </p>
            </div>

            <div className="space-y-3">
              {[
                { key: "calendar", label: "Google Calendar", desc: "Allows Guardian Core to schedule focus work blocks.", icon: Calendar },
                { key: "gmail", label: "Google Mail (Gmail)", desc: "Enables active inbox parsing for hidden deadlines.", icon: Mail },
                { key: "drive", label: "Google Drive Docs", desc: "Integrates context from your active workspace folders.", icon: FileText },
                { key: "tasks", label: "Google Tasks", desc: "Syncs tasks automatically for immediate cross-platform action.", icon: CheckSquare }
              ].map(acc => {
                const Icon = acc.icon;
                const isConnected = connections[acc.key as keyof typeof connections];
                return (
                  <div
                    key={acc.key}
                    className="p-4 rounded-[18px] border border-apple-hairline/80 bg-white flex items-center justify-between gap-4 transition-all hover:bg-apple-surface-pearl/40"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-apple-blue/5 flex items-center justify-center text-apple-blue shrink-0">
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="space-y-0.5 text-left">
                        <p className="text-[14px] font-semibold tracking-tight text-apple-ink">
                          {acc.label}
                        </p>
                        <p className="text-[12px] text-gray-400 font-light leading-relaxed max-w-md">
                          {acc.desc}
                        </p>
                      </div>
                    </div>

                    <button
                      id={`connect-account-${acc.key}`}
                      onClick={() => toggleConnection(acc.key as any)}
                      className={`text-[12px] font-semibold px-4 py-2 rounded-full border transition-all cursor-pointer ${isConnected
                          ? "bg-green-50 border-green-200 text-green-700"
                          : "bg-apple-blue hover:bg-apple-blue-focus text-white border-transparent"
                        }`}
                    >
                      {isConnected ? (
                        <span className="flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-green-600" /> Connected
                        </span>
                      ) : (
                        "Connect"
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TOOL REGISTRY & INTEGRATION HEALTH MONITOR */}
          <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-5">
            <div>
              <h3 className="text-[16px] font-semibold text-apple-ink font-display tracking-tight flex items-center gap-1.5">
                <Sliders className="w-5 h-5 text-apple-blue" /> Tool Execution Framework & Integration Health
              </h3>
              <p className="text-[12px] text-gray-400 font-light mt-0.5">
                Monitor API health, toggle execution adapters, and view/rollback recent tool actions.
              </p>
            </div>

            {loadingTools ? (
              <div className="py-6 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-apple-blue" /> Querying API Registry...
              </div>
            ) : (
              <div className="space-y-6">
                {/* Active Tools list */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tools.map(tool => (
                    <div key={tool.id} className="p-4 rounded-xl border border-apple-hairline bg-apple-surface-pearl/20 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <h4 className="text-sm font-semibold text-apple-ink">{tool.name}</h4>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-tight ${tool.healthStatus === "healthy"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : tool.healthStatus === "degraded"
                                ? "bg-orange-50 text-orange-700 border border-orange-200"
                                : "bg-red-50 text-red-700 border border-red-200"
                            }`}>
                            {tool.healthStatus}
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 font-light">
                            {tool.availabilityStatus === "active" ? "Enabled" : "Disabled"}
                          </span>
                          <button
                            onClick={() => handleToggleTool(tool.id, tool.availabilityStatus)}
                            className={`w-10 h-6 rounded-full transition-all relative ${tool.availabilityStatus === "active" ? "bg-apple-blue" : "bg-gray-200"
                              }`}
                          >
                            <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${tool.availabilityStatus === "active" ? "transform translate-x-4" : ""
                              }`} />
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] text-gray-500 font-light space-y-1">
                        <p><strong>Operations:</strong> {tool.operations.join(", ")}</p>
                        <p><strong>Scopes:</strong> {tool.requiredScopes.map((s: string) => s.split("/").pop()).join(", ")}</p>
                        <p><strong>Retry Policy:</strong> {tool.retryPolicy.maxRetries} retries • {tool.retryPolicy.initialDelayMs}ms delay</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Audit Logs */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Execution Audit Log</h4>

                  {toolLogs.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4 bg-apple-surface-pearl/10 rounded-xl border border-apple-hairline border-dashed">
                      No tool executions recorded.
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto border border-apple-hairline rounded-xl divide-y divide-apple-hairline bg-white">
                      {toolLogs.slice(0, 10).map((log) => {
                        const isReversible = log.result.rollbackInfo?.rollbackSupported && log.status === "success";
                        return (
                          <div key={log.id} className="p-3 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-left">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-apple-ink">{log.request.toolId}</span>
                                <span className="text-gray-400 font-light">•</span>
                                <span className="text-gray-500">{log.request.operation}</span>
                                <span className="text-gray-400 font-light">•</span>
                                <span className={`text-[10px] font-semibold uppercase ${log.status === "success"
                                    ? "text-green-600"
                                    : log.status === "rolled_back"
                                      ? "text-orange-600"
                                      : "text-red-600"
                                  }`}>
                                  {log.status}
                                </span>
                              </div>

                              <p className="text-[10.5px] text-gray-400 font-light">
                                Time: {new Date(log.timestamp).toLocaleString()} • Duration: {log.result.metadata.durationMs}ms • Attempts: {log.result.metadata.attempts}
                              </p>
                              {log.result.metadata.error && (
                                <p className="text-[10px] text-red-600 bg-red-50/50 p-1.5 rounded border border-red-100 font-mono mt-1">
                                  {log.result.metadata.error}
                                </p>
                              )}
                            </div>

                            {isReversible && (
                              <button
                                onClick={() => handleRollback(log.id)}
                                disabled={rollingBackId === log.id}
                                className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 font-semibold rounded-lg text-[11px] transition-all cursor-pointer disabled:opacity-50 shrink-0 self-start md:self-center"
                              >
                                {rollingBackId === log.id ? "Undoing..." : "Undo/Rollback"}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* SHARED COGNITIVE MEMORY DASHBOARD (CHAPTER 10 & 11) */}
          <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-apple-hairline pb-4">
              <div>
                <h3 className="text-[16px] font-semibold text-apple-ink font-display tracking-tight flex items-center gap-1.5">
                  <Brain className="w-5 h-5 text-apple-blue" /> Personalization & Shared Memory
                </h3>
                <p className="text-[12px] text-gray-400 font-light mt-0.5">
                  Control the long-term cognitive files utilized by capabilities to personalize planning.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportMemory}
                  className="p-2 border border-apple-hairline hover:bg-apple-surface-pearl text-gray-600 rounded-full transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                  title="Export Memory"
                >
                  <Download className="w-4 h-4" /> Export JSON
                </button>
                <button
                  onClick={handleResetPersonalization}
                  className="p-2 border border-red-200 bg-red-50/50 hover:bg-red-50 text-red-700 rounded-full transition-all flex items-center gap-1.5 text-xs font-medium cursor-pointer"
                  title="Reset Personalization"
                >
                  <Trash2 className="w-4 h-4 text-red-600" /> Reset
                </button>
              </div>
            </div>

            {/* Memory Layers Selector */}
            <div className="flex border-b border-apple-hairline/80 gap-4 text-sm font-medium">
              {[
                { id: "preferences", label: "Preferences", icon: Sliders },
                { id: "facts", label: "Factual Knowledge", icon: FileText },
                { id: "episodes", label: "Episodes & Decisions", icon: Database }
              ].map(tab => {
                const TabIcon = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`pb-2.5 flex items-center gap-1.5 border-b-2 transition-all cursor-pointer ${isSelected
                        ? "border-apple-blue text-apple-blue font-semibold"
                        : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                  >
                    <TabIcon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {loadingMemories ? (
              <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-apple-blue" /> Synchronising memory files...
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Preferences Tab */}
                {activeTab === "preferences" && (
                  <div className="space-y-3">
                    {memoryContext.preferences.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">No personalization preferences generated yet.</p>
                    ) : (
                      memoryContext.preferences.map((pref: any) => (
                        <div key={pref.id} className="p-4 bg-apple-surface-pearl/40 rounded-[18px] border border-apple-hairline flex flex-col gap-3 text-left">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-semibold uppercase tracking-wider text-apple-blue bg-apple-blue/5 px-2 py-0.5 rounded-md">
                                  {pref.preferenceKey}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${pref.status === "promoted"
                                    ? "bg-green-50 text-green-700 border border-green-200"
                                    : "bg-amber-50 text-amber-700 border border-amber-200"
                                  }`}>
                                  {pref.status === "promoted" ? "Promoted Preference" : "Hypothesis"}
                                </span>
                              </div>
                              <p className="text-xs text-gray-400 mt-1.5 font-light">
                                Confidence: <span className="font-medium text-apple-ink">{pref.confidence}%</span> • Evidence: {pref.evidenceCount} observations • Source: {pref.source}
                              </p>
                            </div>

                            {/* Section 11.15 Feedback Trigger */}
                            <div className="flex items-center gap-1.5 bg-white border border-apple-hairline rounded-full p-1 shadow-sm">
                              <button
                                onClick={() => handleFeedback(pref.id, "up")}
                                className="p-1 hover:bg-green-50 text-gray-400 hover:text-green-600 rounded-full transition-all cursor-pointer"
                                title="Helpful (Confirm)"
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleFeedback(pref.id, "down")}
                                className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-full transition-all cursor-pointer"
                                title="Not Helpful (Reject)"
                              >
                                <ThumbsDown className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 border-t border-apple-hairline/60 pt-2">
                            <div className="flex items-center gap-2 w-full">
                              <input
                                type="text"
                                value={editingPrefs[pref.id] || ""}
                                onChange={(e) => setEditingPrefs({ ...editingPrefs, [pref.id]: e.target.value })}
                                className="text-sm border border-apple-hairline rounded-lg px-2.5 py-1 bg-white text-apple-ink w-full max-w-xs focus:outline-none focus:border-apple-blue font-medium"
                              />
                              <button
                                onClick={() => handleUpdatePref(pref.id)}
                                disabled={savingPrefs[pref.id]}
                                className="p-1.5 bg-apple-blue hover:bg-apple-blue-focus text-white rounded-lg transition-all disabled:opacity-50 flex items-center justify-center cursor-pointer shrink-0"
                                title="Save Preference"
                              >
                                {savingPrefs[pref.id] ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                            <button
                              onClick={() => handleDeleteMemory("preference", pref.id)}
                              className="p-1.5 border border-apple-hairline hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-all shrink-0 cursor-pointer"
                              title="Delete Record"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 2. Semantic Facts Tab */}
                {activeTab === "facts" && (
                  <div className="space-y-3">
                    {memoryContext.semanticFacts.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-6">No facts or assertions gathered in memory yet.</p>
                    ) : (
                      memoryContext.semanticFacts.map((fact: any) => (
                        <div key={fact.id} className="p-4 bg-apple-surface-pearl/40 rounded-[18px] border border-apple-hairline flex items-center justify-between gap-4 text-left">
                          <div className="space-y-1">
                            <p className="text-sm text-apple-ink font-light">"{fact.fact}"</p>
                            <p className="text-[10px] text-gray-400">
                              Category: <span className="font-medium text-apple-ink capitalize">{fact.category}</span> • Logged: {new Date(fact.lastUpdated).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={() => handleDeleteMemory("semantic", fact.id)}
                            className="p-2 border border-apple-hairline hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-full transition-all shrink-0 cursor-pointer"
                            title="Forget Fact"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 3. Episodes and Decisions Tab */}
                {activeTab === "episodes" && (
                  <div className="space-y-4">
                    {/* Episodes Section */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-left">Recent Episodes</h4>
                      {memoryContext.recentEpisodes.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">No episodes recorded.</p>
                      ) : (
                        <div className="space-y-2">
                          {memoryContext.recentEpisodes.map((ep: any) => (
                            <div key={ep.id} className="p-3.5 bg-apple-surface-pearl/40 rounded-[16px] border border-apple-hairline flex items-start justify-between gap-3 text-left">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold text-apple-ink">{ep.outcome}</p>
                                <p className="text-xs text-gray-500 font-light leading-relaxed">
                                  Lessons: {ep.lessonsLearned.join(" | ")}
                                </p>
                                <p className="text-[10px] text-gray-400">
                                  Participants: {ep.participants.join(", ")} • {new Date(ep.timestamp).toLocaleString()}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDeleteMemory("episodic", ep.id)}
                                className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-all cursor-pointer"
                                title="Delete Episode"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Decisions & Reflections Section */}
                    <div className="pt-2 border-t border-apple-hairline">
                      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 text-left">Cognitive Decisions & Reflections</h4>
                      {memoryContext.historicalDecisions.length === 0 && memoryContext.activeReflections.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">No decision records.</p>
                      ) : (
                        <div className="space-y-2">
                          {/* Decisions */}
                          {memoryContext.historicalDecisions.map((dec: any) => (
                            <div key={dec.id} className="p-3.5 bg-apple-blue/5 border border-apple-blue/10 rounded-[16px] flex items-start justify-between gap-3 text-left">
                              <div className="space-y-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-apple-blue">Decision Record</span>
                                <p className="text-sm font-semibold text-apple-ink mt-0.5">{dec.selectedOutcome}</p>
                                <p className="text-xs text-gray-500 font-light leading-relaxed">Context: {dec.context}</p>
                                <p className="text-[10px] text-gray-400">
                                  Confidence: {dec.confidence}% • {new Date(dec.timestamp).toLocaleString()}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDeleteMemory("decision", dec.id)}
                                className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-all cursor-pointer"
                                title="Delete Decision"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}

                          {/* Reflections */}
                          {memoryContext.activeReflections.map((ref: any) => (
                            <div key={ref.id} className="p-3.5 bg-green-50/50 border border-green-100 rounded-[16px] flex items-start justify-between gap-3 text-left">
                              <div className="space-y-1">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-green-700">Reflection Insight</span>
                                <p className="text-xs text-apple-ink italic font-light leading-relaxed mt-0.5">"{ref.insight}"</p>
                                <p className="text-[9.5px] text-gray-400 mt-1">
                                  Goal ID: {ref.sourceGoalId} • {new Date(ref.timestamp).toLocaleString()}
                                </p>
                              </div>
                              <button
                                onClick={() => handleDeleteMemory("reflection", ref.id)}
                                className="p-1.5 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-all cursor-pointer"
                                title="Delete Reflection"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* COLLAPSIBLE RAW OBSERVATIONS AUDIT LOG (CHAPTER 11) */}
          <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-4 text-left">
            <button
              onClick={() => {
                setShowObs(!showObs);
                if (!showObs) fetchObservations();
              }}
              className="w-full flex items-center justify-between text-left focus:outline-none cursor-pointer"
            >
              <div>
                <h3 className="text-[16px] font-semibold text-apple-ink font-display tracking-tight flex items-center gap-1.5">
                  <Database className="w-5 h-5 text-gray-500" /> Transparent Learning Audit Logs
                </h3>
                <p className="text-[12px] text-gray-400 font-light mt-0.5">
                  Inspect raw immutable system observations captured by cognitive capabilities.
                </p>
              </div>
              <span className="text-xs font-semibold text-apple-blue">
                {showObs ? "Hide Logs" : "Show Logs"}
              </span>
            </button>

            {showObs && (
              <div className="space-y-3 pt-3 border-t border-apple-hairline">
                {observations.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No raw observations logged yet.</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {observations.map((obs) => (
                      <div key={obs.id} className="p-3 bg-apple-surface-pearl/30 rounded-xl border border-apple-hairline text-xs space-y-1">
                        <div className="flex justify-between items-center text-[10px] text-gray-400">
                          <span>{obs.capability} • {obs.action}</span>
                          <span>{new Date(obs.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <p className="font-semibold text-apple-ink">"{obs.outcome}"</p>
                        <p className="text-gray-500 font-light leading-relaxed">{obs.evidence}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar settings details */}
        <div className="space-y-6">
          <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-apple-blue text-white flex items-center justify-center text-2xl font-bold font-display mx-auto shadow-md">
                GM
              </div>
              <div>
                <h4 className="text-[17px] font-semibold text-apple-ink font-display">
                  Geetansh Malik
                </h4>
                <p className="text-[12px] text-gray-400">
                  geetanshmalik337@gmail.com
                </p>
              </div>
            </div>

            <div className="border-t border-apple-hairline pt-4 text-[12.5px] text-gray-500 font-light space-y-2">
              <div className="flex justify-between">
                <span>Account Tier</span>
                <span className="font-semibold text-apple-ink">Autonomous Premium</span>
              </div>
              <div className="flex justify-between">
                <span>Subscription Status</span>
                <span className="font-semibold text-apple-blue flex items-center gap-1">
                  Active
                </span>
              </div>
            </div>

            <button
              id="settings-logout-btn"
              onClick={onLogout}
              className="w-full text-center py-2.5 px-4 bg-red-50 hover:bg-red-100 border border-red-200/50 text-red-700 text-xs font-semibold rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
