import React, { useState } from "react";
import { Goal, CalendarSession } from "../types";
import {
  Calendar,
  CheckCircle2,
  Circle,
  RefreshCw,
  Check,
  Sparkles,
  ExternalLink,
  Target,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Columns,
  CalendarDays,
  AlertTriangle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import CalendarGrid from "./CalendarGrid";

// ─── Types ──────────────────────────────────────────────────────────────────

type CalendarView = "month" | "week" | "day" | "agenda";

interface CalendarPageProps {
  goals: Goal[];
  onToggleTask: (goalId: string, taskId: string, isCompleted: boolean) => Promise<void>;
  onSyncCalendar: (goalId: string, sessionIds: string[]) => Promise<void>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getHeaderTitle(date: Date, view: CalendarView): string {
  if (view === "month") return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  if (view === "week") {
    const start = new Date(date);
    start.setDate(start.getDate() - start.getDay());
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${startStr} – ${endStr}, ${end.getFullYear()}`;
  }
  if (view === "day") return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  return "Agenda";
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function CalendarPage({
  goals,
  onToggleTask,
  onSyncCalendar,
}: CalendarPageProps) {
  const [view, setView] = useState<CalendarView>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [syncingGoalId, setSyncingGoalId] = useState<string | null>(null);
  const [syncedSessions, setSyncedSessions] = useState<string[]>([]);
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const activeGoals = goals.filter(g => g.status === "active");

  const fetchGoogleEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await fetch("/api/calendar/events");
      if (res.ok) {
        const data = await res.json();
        setGoogleEvents(data);
      }
    } catch (err) {
      console.error("Failed to fetch Google Calendar events:", err);
    } finally {
      setLoadingEvents(false);
    }
  };

  // Fetch Google Calendar events (real or mock fallback)
  React.useEffect(() => {
    fetchGoogleEvents();
  }, []);

  const handleAddEvent = async (eventData: { title: string; description: string; date: string; startTime: string; endTime: string }) => {
    try {
      const res = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventData)
      });
      if (res.ok) {
        const newEvt = await res.json();
        setGoogleEvents(prev => [...prev, newEvt]);
        setShowAddModal(false);
      } else {
        alert("Failed to add event to Google Calendar.");
      }
    } catch (err) {
      console.error(err);
      alert("Error adding event.");
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm("Are you sure you want to delete this Google Calendar event?")) return;
    try {
      const res = await fetch(`/api/calendar/events/${eventId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setGoogleEvents(prev => prev.filter(evt => evt.id !== eventId));
      } else {
        alert("Failed to delete event from Google Calendar.");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting event.");
    }
  };

  // Collect all sessions for agenda view
  const sessions: { session: CalendarSession; goal?: Goal; isGoogleEvent?: boolean; googleEvent?: any }[] = [];
  
  // 1. Add active goals focus blocks
  activeGoals.forEach(goal => {
    goal.plan?.schedule?.forEach(sess => {
      sessions.push({ session: sess, goal });
    });
  });

  // 2. Add Google Calendar events
  googleEvents.forEach(evt => {
    sessions.push({
      session: {
        id: evt.id,
        taskId: "",
        title: evt.title,
        date: evt.date,
        startTime: evt.startTime,
        endTime: evt.endTime,
        isSynced: true
      },
      isGoogleEvent: true,
      googleEvent: evt
    });
  });

  sessions.sort((a, b) => {
    const dateComp = a.session.date.localeCompare(b.session.date);
    if (dateComp !== 0) return dateComp;
    return a.session.startTime.localeCompare(b.session.startTime);
  });

  // Navigation
  const navigate = (direction: number) => {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + direction);
    else if (view === "week") d.setDate(d.getDate() + 7 * direction);
    else d.setDate(d.getDate() + direction);
    setCurrentDate(d);
  };

  const goToToday = () => setCurrentDate(new Date());

  const handleSyncSession = async (goalId: string, sessionId: string) => {
    setSyncingGoalId(sessionId);
    try {
      await onSyncCalendar(goalId, [sessionId]);
      setSyncedSessions(prev => [...prev, sessionId]);
    } catch (err) {
      console.error(err);
    } finally {
      setSyncingGoalId(null);
    }
  };

  const viewOptions: { id: CalendarView; label: string; icon: React.ReactNode }[] = [
    { id: "month", label: "Month", icon: <LayoutGrid className="w-3.5 h-3.5" /> },
    { id: "week", label: "Week", icon: <Columns className="w-3.5 h-3.5" /> },
    { id: "day", label: "Day", icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { id: "agenda", label: "Agenda", icon: <List className="w-3.5 h-3.5" /> },
  ];

  // Stats
  const totalSessions = sessions.length;
  const completedSessions = sessions.filter(s => {
    if (s.isGoogleEvent || !s.goal) return false;
    const task = s.goal.plan?.tasks?.find(t => t.id === s.session.taskId);
    return task?.isCompleted;
  }).length;
  const syncedCount = sessions.filter(s => s.session.isSynced || syncedSessions.includes(s.session.id)).length;

  return (
    <div className="space-y-6 font-sans pb-12">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#e0e0e0] dark:border-zinc-800 pb-5">
        <div>
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white font-display flex items-center gap-2">
            <Calendar className="w-6 h-6 text-[#0066cc]" /> Calendar
          </h2>
          <p className="text-[13px] text-[#7a7a7a] font-light mt-1.5 leading-relaxed">
            AI-calculated focus blocks structured to guarantee completion before your deadlines.
          </p>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 text-[11px] font-medium text-[#7a7a7a]">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-[#0066cc]" />
            {totalSessions} scheduled
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            {completedSessions} completed
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            {syncedCount} synced
          </div>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[#e0e0e0] dark:border-zinc-700 hover:bg-[#f5f5f7] dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 text-[#7a7a7a]" />
          </button>

          <h3 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-white tracking-tight min-w-[200px] text-center">
            {getHeaderTitle(currentDate, view)}
          </h3>

          <button
            onClick={() => navigate(1)}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-[#e0e0e0] dark:border-zinc-700 hover:bg-[#f5f5f7] dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4 text-[#7a7a7a]" />
          </button>

          <button
            onClick={goToToday}
            className="ml-2 text-[11px] font-semibold text-[#0066cc] hover:text-[#0055b0] border border-[#0066cc]/20 hover:border-[#0066cc]/40 px-3 py-1.5 rounded-full transition-colors cursor-pointer"
          >
            Today
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="ml-2 text-[11px] font-semibold bg-[#0066cc] hover:bg-[#0055b0] text-white px-3.5 py-1.5 rounded-full transition-colors cursor-pointer flex items-center gap-1 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" /> Add Event
          </button>
        </div>

        {/* View switcher */}
        <div className="flex items-center bg-[#f5f5f7] dark:bg-zinc-800/80 p-0.5 rounded-full border border-[#e0e0e0]/80 dark:border-zinc-700">
          {viewOptions.map(opt => (
            <button
              key={opt.id}
              id={`calendar-view-${opt.id}`}
              onClick={() => setView(opt.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
                view === opt.id
                  ? "bg-white dark:bg-zinc-700 text-[#1d1d1f] dark:text-white shadow-sm"
                  : "text-[#7a7a7a] hover:text-[#1d1d1f] dark:hover:text-white"
              }`}
            >
              {opt.icon}
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Calendar Grid or Agenda */}
      {view === "agenda" ? (
        // Agenda View (original list view, preserved)
        <div className="space-y-6">
          {sessions.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-zinc-900 border border-[#e0e0e0] dark:border-zinc-800 rounded-[18px]">
              <div className="w-12 h-12 rounded-full bg-[#f5f5f7] dark:bg-zinc-800 flex items-center justify-center text-[#cccccc] mx-auto mb-4">
                <Calendar className="w-6 h-6" />
              </div>
              <p className="text-[#7a7a7a] font-light text-[15px] max-w-sm mx-auto leading-relaxed">
                No events or focus blocks scheduled yet. Connect Google Calendar or create a goal to populate your schedule.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Agenda list */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-white dark:bg-zinc-900 border border-[#e0e0e0] dark:border-zinc-800 rounded-[18px] p-6 shadow-sm">
                  <h3 className="text-[16px] font-semibold text-[#1d1d1f] dark:text-white font-display tracking-tight mb-5">
                    Upcoming Sessions & Calendar Events
                  </h3>

                  <div className="space-y-3">
                    {sessions.map(({ session, goal, isGoogleEvent, googleEvent }) => {
                      if (isGoogleEvent) {
                        return (
                          <div
                            key={session.id}
                            className="p-4 rounded-[14px] border border-[#e0e0e0]/80 dark:border-zinc-800 bg-[#f5f5f7]/30 dark:bg-zinc-800/30 flex items-start justify-between gap-4 transition-all"
                          >
                            <div className="flex items-start gap-3">
                              <Calendar className="w-5 h-5 text-[#0066cc] mt-1 shrink-0" />
                              <div className="space-y-1">
                                <p className="text-[14px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
                                  {session.title}
                                </p>
                                {googleEvent?.description && (
                                  <p className="text-[12px] text-[#7a7a7a] font-light leading-relaxed">
                                    {googleEvent.description}
                                  </p>
                                )}
                                <div className="flex flex-wrap items-center gap-x-3 text-[11px] font-mono text-[#7a7a7a] font-semibold pt-1">
                                  <span className="bg-[#f5f5f7] dark:bg-zinc-800 px-2 py-0.5 rounded border border-[#e0e0e0]/60 dark:border-zinc-700">
                                    {session.date}
                                  </span>
                                  <span>
                                    {session.startTime} - {session.endTime}
                                  </span>
                                  <span className="text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 px-2 py-0.5 rounded border border-green-200 dark:border-green-900">
                                    Google Calendar
                                  </span>
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => handleDeleteEvent(session.id)}
                              className="text-gray-400 hover:text-red-600 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-colors shrink-0 cursor-pointer"
                              title="Delete Event"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      }

                      if (!goal) return null;

                      const task = goal.plan?.tasks?.find(t => t.id === session.taskId);
                      const isCompleted = task?.isCompleted || false;
                      const isSynced = session.isSynced || syncedSessions.includes(session.id);

                      return (
                        <div
                          key={session.id}
                          className={`p-4 rounded-[14px] border border-[#e0e0e0]/80 dark:border-zinc-800 flex items-start justify-between gap-4 transition-all hover:bg-[#f5f5f7]/40 dark:hover:bg-zinc-800/40 ${
                            isCompleted ? "bg-gray-50/50 dark:bg-zinc-900/50 opacity-75" : "bg-white dark:bg-zinc-900"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <button
                              id={`calendar-task-check-${session.id}`}
                              onClick={() => onToggleTask(goal.id, session.taskId, !isCompleted)}
                              className="mt-1 transition-transform active:scale-90 text-[#cccccc] hover:text-[#0066cc] cursor-pointer shrink-0"
                            >
                              {isCompleted ? (
                                <CheckCircle2 className="w-5 h-5 text-[#0066cc] fill-[#0066cc]/5" />
                              ) : (
                                <Circle className="w-5 h-5 text-[#cccccc]" />
                              )}
                            </button>

                            <div className="space-y-1">
                              <p className={`text-[14px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white ${
                                isCompleted ? "line-through text-[#7a7a7a]" : ""
                              }`}>
                                {session.title}
                              </p>
                              <p className="text-[12px] text-[#7a7a7a] font-light line-clamp-1">
                                Goal: <strong className="font-semibold text-[#1d1d1f] dark:text-white">{goal.title}</strong>
                              </p>
                              <div className="flex flex-wrap items-center gap-x-3 text-[11px] font-mono text-[#7a7a7a] font-semibold pt-1">
                                <span className="bg-[#f5f5f7] dark:bg-zinc-800 px-2 py-0.5 rounded border border-[#e0e0e0]/60 dark:border-zinc-700">
                                  {session.date}
                                </span>
                                <span>
                                  {session.startTime} - {session.endTime}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Sync button */}
                          <button
                            id={`calendar-sync-btn-${session.id}`}
                            onClick={() => handleSyncSession(goal.id, session.id)}
                            disabled={isSynced || syncingGoalId === session.id}
                            className={`text-[11px] font-medium px-3 py-1.5 rounded-full border shrink-0 flex items-center gap-1 transition-all cursor-pointer ${
                              isSynced
                                ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400"
                                : "bg-white dark:bg-zinc-800 border-[#e0e0e0] dark:border-zinc-700 text-[#7a7a7a] hover:text-[#0066cc] hover:bg-gray-50 dark:hover:bg-zinc-700"
                            }`}
                          >
                            {syncingGoalId === session.id ? (
                              <><RefreshCw className="w-3 h-3 animate-spin text-[#0066cc]" /> Syncing...</>
                            ) : isSynced ? (
                              <><Check className="w-3 h-3 text-green-600" /> Synced</>
                            ) : (
                              <><ExternalLink className="w-3 h-3" /> Sync Google</>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Sidebar insights */}
              <div className="space-y-6">
                <div className="bg-white dark:bg-zinc-900 border border-[#e0e0e0] dark:border-zinc-800 rounded-[18px] p-6 shadow-sm space-y-4">
                  <h3 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-white font-display tracking-tight flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#0066cc]" /> Calendar Insights
                  </h3>
                  <p className="text-[13px] text-[#7a7a7a] leading-relaxed font-light">
                    Guardian Core handles scheduling automatically:
                  </p>
                  <ul className="space-y-3.5 border-t border-[#e0e0e0]/60 dark:border-zinc-800 pt-4 text-[12.5px] text-[#555555] dark:text-gray-400 leading-relaxed">
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0066cc] mt-1.5 shrink-0" />
                      <span><strong>Zero conflicts:</strong> Time allocations are cross-referenced so no two focus blocks overlap.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0066cc] mt-1.5 shrink-0" />
                      <span><strong>Dynamic reminders:</strong> Reminders fire at 50%, 25%, and 10% of remaining time before deadline.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#0066cc] mt-1.5 shrink-0" />
                      <span><strong>Adaptive schedule:</strong> Sessions adjust based on your completion patterns and preferences.</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // Month / Week / Day views
        <CalendarGrid
          goals={activeGoals}
          currentDate={currentDate}
          view={view}
          onToggleTask={onToggleTask}
          onSyncCalendar={onSyncCalendar}
          onNavigate={(date) => {
            setCurrentDate(date);
            setView("day");
          }}
          googleEvents={googleEvents}
          onDeleteEvent={handleDeleteEvent}
        />
      )}

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border border-apple-hairline dark:border-zinc-800 rounded-[24px] shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in duration-200 text-left">
            <div className="flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-apple-ink dark:text-white font-display tracking-tight flex items-center gap-1.5">
                <Plus className="w-5 h-5 text-apple-blue" /> Create Calendar Event
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const target = e.target as any;
              handleAddEvent({
                title: target.title.value,
                description: target.description.value,
                date: target.date.value,
                startTime: target.startTime.value,
                endTime: target.endTime.value
              });
            }} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Event Title</label>
                <input
                  name="title"
                  type="text"
                  required
                  placeholder="e.g. Catch up with Geetansh"
                  className="w-full px-3.5 py-2.5 rounded-[12px] border border-apple-hairline dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-1 focus:ring-apple-blue"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Description (Optional)</label>
                <textarea
                  name="description"
                  placeholder="e.g. Design review and plan strategy sync"
                  className="w-full px-3.5 py-2.5 rounded-[12px] border border-apple-hairline dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:ring-1 focus:ring-apple-blue h-20 resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 sm:col-span-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Date</label>
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="w-full px-3 py-2 rounded-[12px] border border-apple-hairline dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs focus:outline-none text-apple-ink"
                  />
                </div>
                
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Start Time</label>
                  <input
                    name="startTime"
                    type="time"
                    required
                    defaultValue="09:00"
                    className="w-full px-3 py-2 rounded-[12px] border border-apple-hairline dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs focus:outline-none text-apple-ink"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">End Time</label>
                  <input
                    name="endTime"
                    type="time"
                    required
                    defaultValue="10:00"
                    className="w-full px-3 py-2 rounded-[12px] border border-apple-hairline dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs focus:outline-none text-apple-ink"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-full border border-apple-hairline text-xs font-semibold text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#0066cc] hover:bg-[#0055b0] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Create Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
