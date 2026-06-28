import React, { useState, useMemo } from "react";
import { Goal, CalendarSession, Task, Milestone } from "../types";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  AlertTriangle,
  Diamond,
  CheckCircle2,
  Circle,
  ExternalLink,
  Check,
  RefreshCw,
  Target,
  Trash2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

type CalendarView = "month" | "week" | "day";

interface CalendarGridProps {
  goals: Goal[];
  currentDate: Date;
  view: CalendarView;
  onToggleTask: (goalId: string, taskId: string, isCompleted: boolean) => Promise<void>;
  onSyncCalendar: (goalId: string, sessionIds: string[]) => Promise<void>;
  onNavigate: (date: Date) => void;
  googleEvents?: any[];
  onDeleteEvent?: (id: string) => Promise<void>;
}

interface SessionWithGoal {
  session: CalendarSession;
  goal: Goal;
  task?: Task;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWeekDates(date: Date): Date[] {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function getMonthDates(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const dates: Date[] = [];

  // Fill in previous month days
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    dates.push(d);
  }

  // Fill in current month days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    dates.push(new Date(year, month, i));
  }

  // Fill remaining cells to complete the grid (6 rows × 7 = 42 cells)
  while (dates.length < 42) {
    const nextDate = new Date(dates[dates.length - 1]);
    nextDate.setDate(nextDate.getDate() + 1);
    dates.push(nextDate);
  }

  return dates;
}

function formatDateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function isToday(date: Date): boolean {
  const today = new Date();
  return formatDateKey(date) === formatDateKey(today);
}

function isSameMonth(date: Date, reference: Date): boolean {
  return date.getMonth() === reference.getMonth() && date.getFullYear() === reference.getFullYear();
}

function getPriorityColor(priority?: string): string {
  switch (priority) {
    case "High": return "bg-red-500";
    case "Medium": return "bg-amber-500";
    default: return "bg-[#0066cc]";
  }
}

function getPriorityBorder(priority?: string): string {
  switch (priority) {
    case "High": return "border-red-200 dark:border-red-900/40";
    case "Medium": return "border-amber-200 dark:border-amber-900/40";
    default: return "border-[#0066cc]/20 dark:border-blue-900/40";
  }
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7); // 7 AM to 9 PM

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ─── Component ──────────────────────────────────────────────────────────────

export default function CalendarGrid({
  goals,
  currentDate,
  view,
  onToggleTask,
  onSyncCalendar,
  onNavigate,
  googleEvents = [],
  onDeleteEvent,
}: CalendarGridProps) {
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Collect all sessions with their parent goal context
  const sessions = useMemo<SessionWithGoal[]>(() => {
    const items: SessionWithGoal[] = [];
    goals.forEach(goal => {
      if (goal.status !== "active") return;
      goal.plan?.schedule?.forEach(session => {
        const task = goal.plan?.tasks?.find(t => t.id === session.taskId);
        items.push({ session, goal, task });
      });
    });
    return items;
  }, [goals]);

  // Group sessions by date
  const sessionsByDate = useMemo(() => {
    const map = new Map<string, SessionWithGoal[]>();
    sessions.forEach(s => {
      const key = s.session.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    // Sort sessions within each day by start time
    map.forEach(v => v.sort((a, b) => a.session.startTime.localeCompare(b.session.startTime)));
    return map;
  }, [sessions]);

  // Group Google Calendar events by date
  const googleEventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    googleEvents.forEach(evt => {
      const key = evt.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(evt);
    });
    return map;
  }, [googleEvents]);

  // Collect milestones with dates
  const milestones = useMemo(() => {
    const items: { milestone: Milestone; goal: Goal }[] = [];
    goals.forEach(goal => {
      goal.plan?.milestones?.forEach(m => {
        items.push({ milestone: m, goal });
      });
    });
    return items;
  }, [goals]);

  const milestonesByDate = useMemo(() => {
    const map = new Map<string, { milestone: Milestone; goal: Goal }[]>();
    milestones.forEach(m => {
      const key = m.milestone.targetDate;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [milestones]);

  // Detect conflicts (overlapping sessions on same date)
  const conflictDates = useMemo(() => {
    const dates = new Set<string>();
    sessionsByDate.forEach((sessionsOnDay, dateKey) => {
      for (let i = 0; i < sessionsOnDay.length; i++) {
        for (let j = i + 1; j < sessionsOnDay.length; j++) {
          const a = sessionsOnDay[i].session;
          const b = sessionsOnDay[j].session;
          if (a.startTime < b.endTime && b.startTime < a.endTime) {
            dates.add(dateKey);
          }
        }
      }
    });
    return dates;
  }, [sessionsByDate]);

  const handleSync = async (goalId: string, sessionId: string) => {
    setSyncingId(sessionId);
    try {
      await onSyncCalendar(goalId, [sessionId]);
    } catch (err) {
      console.error(err);
    } finally {
      setSyncingId(null);
    }
  };

  // ─── Month View ───────────────────────────────────────────────────────────
  if (view === "month") {
    const monthDates = getMonthDates(currentDate);

    return (
      <div className="bg-white dark:bg-zinc-900 border border-[#e0e0e0] dark:border-zinc-800 rounded-[18px] overflow-hidden">
        {/* Day header row */}
        <div className="grid grid-cols-7 border-b border-[#e0e0e0] dark:border-zinc-800">
          {DAY_NAMES.map(day => (
            <div key={day} className="py-3 text-center text-[11px] font-semibold text-[#7a7a7a] tracking-wide uppercase">
              {day}
            </div>
          ))}
        </div>

        {/* Date grid */}
        <div className="grid grid-cols-7">
          {monthDates.map((date, idx) => {
            const key = formatDateKey(date);
            const daySessions = sessionsByDate.get(key) || [];
            const dayGoogleEvents = googleEventsByDate.get(key) || [];
            const dayMilestones = milestonesByDate.get(key) || [];
            const hasConflict = conflictDates.has(key);
            const isCurrentMonth = isSameMonth(date, currentDate);
            const isTodayDate = isToday(date);
            const totalItemsCount = daySessions.length + dayGoogleEvents.length;

            return (
              <div
                key={idx}
                onClick={() => {
                  if (totalItemsCount > 0 || dayMilestones.length > 0) {
                    onNavigate(date);
                  }
                }}
                className={`min-h-[100px] p-1.5 border-b border-r border-[#f0f0f0] dark:border-zinc-800 transition-colors ${isCurrentMonth ? "bg-white dark:bg-zinc-900" : "bg-[#fafafc] dark:bg-zinc-950"
                  } ${totalItemsCount > 0 || dayMilestones.length > 0 ? "cursor-pointer hover:bg-[#f5f5f7] dark:hover:bg-zinc-800/50" : ""}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-[12px] w-6 h-6 flex items-center justify-center rounded-full font-medium ${isTodayDate
                        ? "bg-[#0066cc] text-white"
                        : isCurrentMonth
                          ? "text-[#1d1d1f] dark:text-white"
                          : "text-[#cccccc] dark:text-zinc-600"
                      }`}
                  >
                    {date.getDate()}
                  </span>
                  {hasConflict && (
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                  )}
                </div>

                {/* Session pills */}
                <div className="space-y-0.5">
                  {daySessions.slice(0, 2).map(({ session, task }) => (
                    <div
                      key={session.id}
                      className={`text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] truncate ${getPriorityColor(task?.priority)
                        } text-white`}
                    >
                      {session.title}
                    </div>
                  ))}
                  {dayGoogleEvents.slice(0, 2).map(evt => {
                    const isGreen = evt.title.toLowerCase().includes("muharram") || evt.title.toLowerCase().includes("birthday");
                    return (
                      <div
                        key={evt.id}
                        className={`text-[9px] font-medium px-1.5 py-0.5 rounded-[4px] truncate border ${isGreen
                            ? "bg-emerald-500/10 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200/50 dark:border-emerald-900/30"
                            : "bg-blue-500/10 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border-blue-200/50 dark:border-blue-900/30"
                          }`}
                      >
                        {evt.title}
                      </div>
                    );
                  })}
                  {totalItemsCount > 4 && (
                    <div className="text-[8px] text-[#7a7a7a] font-medium pl-1">
                      +{totalItemsCount - 4} more
                    </div>
                  )}
                </div>

                {/* Milestone markers */}
                {dayMilestones.map(({ milestone }) => (
                  <div key={milestone.id} className="flex items-center gap-0.5 mt-0.5">
                    <Diamond className="w-2.5 h-2.5 text-purple-500 fill-purple-500/20" />
                    <span className="text-[8px] text-purple-600 dark:text-purple-400 truncate font-medium">
                      {milestone.title}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Week View ────────────────────────────────────────────────────────────
  if (view === "week") {
    const weekDates = getWeekDates(currentDate);

    return (
      <div className="bg-white dark:bg-zinc-900 border border-[#e0e0e0] dark:border-zinc-800 rounded-[18px] overflow-hidden">
        {/* Day header row */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[#e0e0e0] dark:border-zinc-800">
          <div className="p-2" />
          {weekDates.map((date, idx) => {
            const isTodayDate = isToday(date);
            return (
              <div
                key={idx}
                className={`p-2 text-center border-l border-[#f0f0f0] dark:border-zinc-800 ${isTodayDate ? "bg-[#0066cc]/5" : ""
                  }`}
              >
                <div className="text-[10px] font-semibold text-[#7a7a7a] uppercase tracking-wide">
                  {DAY_NAMES[date.getDay()]}
                </div>
                <div
                  className={`text-[16px] font-semibold mt-0.5 ${isTodayDate
                      ? "w-8 h-8 bg-[#0066cc] text-white rounded-full flex items-center justify-center mx-auto"
                      : "text-[#1d1d1f] dark:text-white"
                    }`}
                >
                  {date.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div className="max-h-[600px] overflow-y-auto">
          {HOURS.map(hour => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-[#f0f0f0] dark:border-zinc-800 min-h-[60px]">
              <div className="p-2 text-[10px] text-[#7a7a7a] font-medium text-right pr-3 pt-1">
                {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
              </div>
              {weekDates.map((date, dayIdx) => {
                const key = formatDateKey(date);
                const hourSessions = (sessionsByDate.get(key) || []).filter(({ session }) => {
                  const startHour = parseInt(session.startTime.split(":")[0], 10);
                  return startHour === hour;
                });
                const hourGoogleEvents = (googleEventsByDate.get(key) || []).filter(evt => {
                  const startHour = parseInt(evt.startTime.split(":")[0], 10);
                  return startHour === hour;
                });

                return (
                  <div
                    key={dayIdx}
                    className={`border-l border-[#f0f0f0] dark:border-zinc-800 p-0.5 relative ${isToday(date) ? "bg-[#0066cc]/[0.02]" : ""
                      }`}
                  >
                    {hourGoogleEvents.map(evt => {
                      const startMinutes = parseInt(evt.startTime.split(":")[1], 10);
                      const startH = parseInt(evt.startTime.split(":")[0], 10);
                      const endH = parseInt(evt.endTime.split(":")[0], 10);
                      const endM = parseInt(evt.endTime.split(":")[1], 10);
                      const durationMinutes = (endH * 60 + endM) - (startH * 60 + startMinutes);
                      const heightPx = Math.max(24, Math.floor(durationMinutes));
                      const isGreen = evt.title.toLowerCase().includes("muharram") || evt.title.toLowerCase().includes("birthday");

                      return (
                        <div
                          key={evt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onDeleteEvent) {
                              onDeleteEvent(evt.id);
                            }
                          }}
                          className={`absolute left-0.5 right-0.5 rounded-[6px] p-1.5 cursor-pointer border transition-all hover:shadow-sm group ${isGreen
                              ? "border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20"
                              : "border-blue-200 dark:border-blue-900/40 text-blue-800 dark:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20"
                            }`}
                          style={{
                            top: `${(startMinutes / 60) * 100}%`,
                            minHeight: `${heightPx}%`,
                          }}
                          title="Click to delete this event"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isGreen ? "bg-emerald-500" : "bg-blue-500"}`} />
                              <span className="text-[9px] font-semibold truncate">
                                {evt.title}
                              </span>
                            </div>
                            <Trash2 className="w-3 h-3 text-gray-400 group-hover:text-red-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                          <span className="text-[8px] font-mono opacity-80 block">
                            {evt.startTime}–{evt.endTime}
                          </span>
                        </div>
                      );
                    })}
                    {hourSessions.map(({ session, goal, task }) => {
                      const startMinutes = parseInt(session.startTime.split(":")[1], 10);
                      const startH = parseInt(session.startTime.split(":")[0], 10);
                      const endH = parseInt(session.endTime.split(":")[0], 10);
                      const endM = parseInt(session.endTime.split(":")[1], 10);
                      const durationMinutes = (endH * 60 + endM) - (startH * 60 + startMinutes);
                      const heightPx = Math.max(24, Math.floor(durationMinutes));

                      return (
                        <div
                          key={session.id}
                          onClick={() => setExpandedSession(expandedSession === session.id ? null : session.id)}
                          className={`absolute left-0.5 right-0.5 rounded-[6px] p-1.5 cursor-pointer border transition-all hover:shadow-sm ${getPriorityBorder(task?.priority)
                            } ${task?.isCompleted ? "opacity-50" : ""}`}
                          style={{
                            top: `${(startMinutes / 60) * 100}%`,
                            minHeight: `${heightPx}%`,
                            backgroundColor: task?.priority === "High" ? "rgba(239,68,68,0.1)" :
                              task?.priority === "Medium" ? "rgba(245,158,11,0.1)" : "rgba(0,102,204,0.08)",
                          }}
                        >
                          <div className="flex items-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${getPriorityColor(task?.priority)}`} />
                            <span className="text-[9px] font-semibold text-[#1d1d1f] dark:text-white truncate">
                              {session.title}
                            </span>
                          </div>
                          <span className="text-[8px] text-[#7a7a7a] font-mono">
                            {session.startTime}–{session.endTime}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ─── Day View ─────────────────────────────────────────────────────────────
  const dayKey = formatDateKey(currentDate);
  const daySessions = sessionsByDate.get(dayKey) || [];
  const dayGoogleEvents = googleEventsByDate.get(dayKey) || [];
  const dayMilestones = milestonesByDate.get(dayKey) || [];
  const hasConflicts = conflictDates.has(dayKey);

  return (
    <div className="bg-white dark:bg-zinc-900 border border-[#e0e0e0] dark:border-zinc-800 rounded-[18px] overflow-hidden">
      {/* Day header */}
      <div className={`p-4 border-b border-[#e0e0e0] dark:border-zinc-800 ${isToday(currentDate) ? "bg-[#0066cc]/5" : ""}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[18px] font-semibold text-[#1d1d1f] dark:text-white tracking-tight">
              {currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </h3>
            <p className="text-[12px] text-[#7a7a7a]">
              {daySessions.length + dayGoogleEvents.length} event{(daySessions.length + dayGoogleEvents.length) !== 1 ? "s" : ""} scheduled
              {hasConflicts && (
                <span className="text-amber-600 ml-2 inline-flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" /> Conflict detected
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Milestones for this day */}
      {dayMilestones.length > 0 && (
        <div className="p-3 border-b border-[#f0f0f0] dark:border-zinc-800 bg-purple-50/50 dark:bg-purple-950/10">
          {dayMilestones.map(({ milestone, goal }) => (
            <div key={milestone.id} className="flex items-center gap-2 py-1">
              <Diamond className="w-4 h-4 text-purple-500 fill-purple-500/20 shrink-0" />
              <div>
                <p className="text-[12px] font-semibold text-purple-700 dark:text-purple-300">{milestone.title}</p>
                <p className="text-[10px] text-purple-500/70">Goal: {goal.title}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hourly timeline */}
      <div className="max-h-[600px] overflow-y-auto">
        {HOURS.map(hour => {
          const hourSessions = daySessions.filter(({ session }) => {
            const startH = parseInt(session.startTime.split(":")[0], 10);
            return startH === hour;
          });

          return (
            <div key={hour} className="flex border-b border-[#f0f0f0] dark:border-zinc-800 min-h-[64px]">
              <div className="w-16 shrink-0 p-2 text-[11px] text-[#7a7a7a] font-medium text-right pr-3 pt-2">
                {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
              </div>
              <div className="flex-1 border-l border-[#f0f0f0] dark:border-zinc-800 p-1.5 space-y-1.5">
                {(() => {
                  const hourGoogleEvents = dayGoogleEvents.filter(evt => {
                    if (!evt.startTime) return false;
                    const startH = parseInt(evt.startTime.split(":")[0], 10);
                    return startH === hour;
                  });
                  return hourGoogleEvents.map(evt => {
                  const isGreen = evt.title.toLowerCase().includes("muharram") || evt.title.toLowerCase().includes("birthday");
                  return (
                    <div
                      key={evt.id}
                      className={`rounded-[12px] border p-3 bg-white dark:bg-zinc-800/50 ${isGreen ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-500/5" : "border-blue-200 dark:border-blue-900/40 bg-blue-500/5"
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <Calendar className={`w-5 h-5 shrink-0 mt-0.5 ${isGreen ? "text-emerald-500" : "text-blue-500"}`} />
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
                              {evt.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-mono text-[#7a7a7a] bg-[#f5f5f7] dark:bg-zinc-700 px-1.5 py-0.5 rounded">
                                {evt.startTime} – {evt.endTime}
                              </span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${isGreen ? "text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/20" : "text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/20"
                                }`}>
                                Google Calendar Event
                              </span>
                            </div>
                            {evt.description && (
                              <p className="text-[11px] text-[#7a7a7a] mt-1.5 line-clamp-2 leading-relaxed">
                                {evt.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {onDeleteEvent && (
                          <button
                            onClick={() => onDeleteEvent(evt.id)}
                            className="text-gray-400 hover:text-red-600 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-full transition-colors shrink-0 cursor-pointer"
                            title="Delete Event"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
                })()}

                {hourSessions.map(({ session, goal, task }) => (
                  <div
                    key={session.id}
                    className={`rounded-[12px] border p-3 transition-all ${getPriorityBorder(task?.priority)
                      } ${task?.isCompleted ? "opacity-60 bg-gray-50 dark:bg-zinc-800/30" : "bg-white dark:bg-zinc-800/50"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5 flex-1 min-w-0">
                        <button
                          onClick={() => onToggleTask(goal.id, session.taskId, !(task?.isCompleted))}
                          className="mt-0.5 transition-transform active:scale-90 cursor-pointer shrink-0"
                        >
                          {task?.isCompleted ? (
                            <CheckCircle2 className="w-5 h-5 text-[#0066cc] fill-[#0066cc]/5" />
                          ) : (
                            <Circle className="w-5 h-5 text-[#cccccc]" />
                          )}
                        </button>
                        <div className="min-w-0">
                          <p className={`text-[13px] font-semibold tracking-tight ${task?.isCompleted ? "line-through text-[#7a7a7a]" : "text-[#1d1d1f] dark:text-white"
                            }`}>
                            {session.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono text-[#7a7a7a] bg-[#f5f5f7] dark:bg-zinc-700 px-1.5 py-0.5 rounded">
                              {session.startTime} – {session.endTime}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-[#7a7a7a]">
                              <Target className="w-3 h-3" /> {goal.title}
                            </span>
                          </div>
                          {task?.description && (
                            <p className="text-[11px] text-[#7a7a7a] mt-1.5 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Sync button */}
                      <button
                        onClick={() => handleSync(goal.id, session.id)}
                        disabled={session.isSynced || syncingId === session.id}
                        className={`text-[10px] font-medium px-2.5 py-1 rounded-full border shrink-0 flex items-center gap-1 transition-all cursor-pointer ${session.isSynced
                            ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900 text-green-700 dark:text-green-400"
                            : "bg-white dark:bg-zinc-800 border-[#e0e0e0] dark:border-zinc-700 text-[#7a7a7a] hover:text-[#0066cc] hover:border-[#0066cc]/30"
                          }`}
                      >
                        {syncingId === session.id ? (
                          <><RefreshCw className="w-3 h-3 animate-spin text-[#0066cc]" /> Syncing</>
                        ) : session.isSynced ? (
                          <><Check className="w-3 h-3 text-green-600" /> Synced</>
                        ) : (
                          <><ExternalLink className="w-3 h-3" /> Sync</>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {daySessions.length === 0 && dayGoogleEvents.length === 0 && (
        <div className="p-12 text-center">
          <Calendar className="w-8 h-8 text-[#cccccc] mx-auto mb-3" />
          <p className="text-[13px] text-[#7a7a7a] font-light">No sessions or events scheduled for this day.</p>
        </div>
      )}
    </div>
  );
}
