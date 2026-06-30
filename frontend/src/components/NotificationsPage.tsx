import React, { useState, useEffect } from "react";
import { Goal } from "../types";
import {
  Sparkles,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Target,
  Terminal,
  Trash2,
  RefreshCw,
  Clock,
  Activity
} from "lucide-react";
import { API_URL } from "../api";

interface NotificationsPageProps {
  goals: Goal[];
  onSelectGoal: (goal: Goal) => void;
}

interface DBNotification {
  id: string;
  type: 'info' | 'warning' | 'rescue' | 'success';
  title: string;
  message: string;
  goalId?: string;
  createdAt: string;
  isRead: boolean;
}

interface AgentJob {
  id: string;
  workerName: 'Sentinel Worker' | 'Execution Worker' | 'Auditor Worker';
  type: 'RISK_SCAN' | 'AUTO_RESCUE' | 'PREFILL_DRAFT' | 'RE-EVALUATE';
  goalId?: string;
  goalTitle?: string;
  status: 'processing' | 'completed' | 'failed';
  message: string;
  createdAt: string;
}

export default function NotificationsPage({
  goals,
  onSelectGoal
}: NotificationsPageProps) {
  const [notifications, setNotifications] = useState<DBNotification[]>([]);
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlertsAndLogs = async () => {
    try {
      const [notifsRes, jobsRes] = await Promise.all([
        fetch(API_URL + "/api/notifications"),
        fetch(API_URL + "/api/worker/logs")
      ]);

      if (notifsRes.ok) {
        const notifData = await notifsRes.json();
        setNotifications(notifData);
      }
      if (jobsRes.ok) {
        const jobData = await jobsRes.json();
        setJobs(jobData);
      }
    } catch (err) {
      console.error("Failed to load notifications or worker logs:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlertsAndLogs();
    
    // Automatically poll logs every 15 seconds to see live progress
    const timer = setInterval(fetchAlertsAndLogs, 15000);
    return () => clearInterval(timer);
  }, []);

  const handleMarkAsRead = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/notifications/${id}/read`, {
        method: "POST"
      });
      if (response.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, isRead: true } : n)
        );
      }
    } catch (err) {
      console.error("Failed to mark read:", err);
    }
  };

  const handleClearAll = async () => {
    const confirmed = window.confirm("Are you sure you want to clear all active notifications?");
    if (!confirmed) return;

    try {
      const response = await fetch(API_URL + "/api/notifications/clear", {
        method: "POST"
      });
      if (response.ok) {
        setNotifications([]);
      }
    } catch (err) {
      console.error("Failed to clear notifications:", err);
    }
  };

  const handleRefreshClick = () => {
    setRefreshing(true);
    fetchAlertsAndLogs();
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return "Just Now";
    }
  };

  return (
    <div className="space-y-10 font-sans pb-12 animate-in fade-in duration-300">
      
      {/* Page Header */}
      <div className="border-b border-apple-hairline dark:border-zinc-800 pb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-apple-ink dark:text-white font-display flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-apple-blue" /> Strategic AI Copilot Terminal
          </h2>
          <p className="text-[14px] text-gray-500 dark:text-gray-400 font-light mt-1.5 leading-relaxed">
            Mitigate procrastination and execute roadmaps with live, autonomous background agents and risk diagnostics.
          </p>
        </div>
        
        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            id="refresh-terminal-btn"
            onClick={handleRefreshClick}
            className="p-2 border border-apple-hairline dark:border-zinc-700 bg-white dark:bg-zinc-800 text-apple-ink dark:text-white hover:bg-apple-canvas-parchment dark:hover:bg-zinc-700 rounded-lg cursor-pointer transition-colors"
            title="Refresh alerts & worker logs"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin text-apple-blue" : ""}`} />
          </button>
          
          {notifications.length > 0 && (
            <button
              id="clear-all-alerts-btn"
              onClick={handleClearAll}
              className="px-3 py-1.5 border border-red-200 dark:border-red-950/40 bg-white dark:bg-zinc-800 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear Alerts
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left: Alerts panel */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-[16px] font-semibold text-apple-ink dark:text-white tracking-tight flex items-center gap-2">
            <Activity className="w-4 h-4 text-apple-blue" /> Critical System Alerts ({notifications.length})
          </h3>

          {loading ? (
            <div className="py-12 text-center text-gray-400 text-[13px] font-light">
              Synthesizing alerts...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 border border-dashed border-apple-hairline dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/30 rounded-[22px] text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto opacity-70" />
              <p className="text-[14px] font-semibold text-apple-ink dark:text-white mt-3 font-display">All Milestones Fully Secure</p>
              <p className="text-[12px] text-gray-400 font-light mt-1 max-w-sm mx-auto">
                Our Sentinel Worker hasn't logged any timeline drift or critical bottlenecks. Excellent momentum!
              </p>
            </div>
          ) : (
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {notifications.map((notif) => {
                const correspondingGoal = goals.find(g => g.id === notif.goalId);
                return (
                  <div
                    key={notif.id}
                    className={`p-5 rounded-[22px] border transition-all shadow-sm flex items-start gap-4 text-left ${
                      notif.isRead 
                        ? "bg-white/80 dark:bg-zinc-900/50 border-apple-hairline dark:border-zinc-800 opacity-75"
                        : "bg-white dark:bg-zinc-900 border-apple-blue/20 dark:border-apple-blue/10 shadow-md ring-1 ring-apple-blue/5"
                    }`}
                    onClick={() => {
                      handleMarkAsRead(notif.id);
                      if (correspondingGoal) onSelectGoal(correspondingGoal);
                    }}
                  >
                    {/* Visual type icon */}
                    <div className="shrink-0 mt-0.5">
                      {notif.type === "rescue" ? (
                        <div className="w-9 h-9 rounded-full bg-red-50 dark:bg-red-950/20 text-red-600 flex items-center justify-center shadow-inner">
                          <ShieldAlert className="w-5 h-5 animate-pulse" />
                        </div>
                      ) : notif.type === "warning" ? (
                        <div className="w-9 h-9 rounded-full bg-amber-50 dark:bg-amber-950/20 text-amber-600 flex items-center justify-center">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                      ) : notif.type === "success" ? (
                        <div className="w-9 h-9 rounded-full bg-green-50 dark:bg-green-950/20 text-green-600 flex items-center justify-center">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-apple-blue/5 dark:bg-apple-blue/15 text-apple-blue flex items-center justify-center">
                          <Target className="w-5 h-5" />
                        </div>
                      )}
                    </div>

                    {/* Alert details */}
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[14.5px] font-semibold text-apple-ink dark:text-white font-display tracking-tight flex items-center gap-2">
                          {notif.title}
                          {!notif.isRead && (
                            <span className="w-1.5 h-1.5 rounded-full bg-apple-blue block" />
                          )}
                        </p>
                        <span className="text-[11px] text-gray-400 dark:text-gray-500 font-light shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(notif.createdAt)}
                        </span>
                      </div>
                      <p className="text-[13px] text-gray-500 dark:text-gray-400 font-light leading-relaxed">
                        {notif.message}
                      </p>

                      {correspondingGoal && (
                        <div className="pt-2 text-[12px] text-apple-blue dark:text-[#2997ff] font-semibold inline-flex items-center gap-0.5 cursor-pointer hover:underline">
                          Launch Active Workspace
                          <ChevronRight className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Worker Activity Log (JetBrains Mono Terminal Style) */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="text-[16px] font-semibold text-apple-ink dark:text-white tracking-tight flex items-center gap-2">
            <Terminal className="w-4 h-4 text-gray-500" /> Background Agent Activity Audit
          </h3>

          <div className="p-5 bg-[#1d1d1f] rounded-[22px] text-left text-xs font-mono text-zinc-300 space-y-3 shadow-xl border border-zinc-800">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
              <span className="text-zinc-500 text-[10px] tracking-widest font-bold">DAEMON CORE V3.1.2</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full text-[10px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-ping" />
                ACTIVE
              </span>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto font-mono text-[11px] leading-relaxed pr-1 scrollbar-thin scrollbar-thumb-zinc-800">
              {jobs.length === 0 ? (
                <p className="text-zinc-500 italic">No background tasks completed yet. Waiting for cycle...</p>
              ) : (
                jobs.map((job) => {
                  let statusColor = "text-green-400";
                  if (job.status === "failed") statusColor = "text-red-400";
                  if (job.status === "processing") statusColor = "text-amber-400";

                  return (
                    <div key={job.id} className="border-b border-zinc-800/40 pb-2 last:border-0">
                      <div className="flex justify-between items-center text-[10px] text-zinc-500 font-bold">
                        <span>[{job.workerName}]</span>
                        <span>{formatTimestamp(job.createdAt)}</span>
                      </div>
                      <div className="mt-1 flex items-start gap-1">
                        <span className="text-zinc-500 font-bold shrink-0">&gt;</span>
                        <div className="space-y-0.5 flex-1">
                          <p className="text-zinc-200">
                            {job.type} status: <span className={statusColor}>{job.status.toUpperCase()}</span>
                          </p>
                          <p className="text-zinc-400 text-[10.5px] leading-normal">{job.message}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-zinc-800/80 text-zinc-500 text-[10px] flex justify-between items-center">
              <span>Sentinel cycle: 45s interval</span>
              <span>Total audited: {jobs.length} threads</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
