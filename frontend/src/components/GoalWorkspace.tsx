import React, { useState, useEffect, useRef } from "react";
import { Goal, Task, Milestone } from "../types";
import {
  Sparkles,
  ArrowLeft,
  Loader2,
  Calendar,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Send,
  Copy,
  Check,
  RefreshCw,
  HelpCircle,
  Target,
  FileText,
  BookOpen,
  Compass,
  Link,
  Trophy,
  CheckCheck
} from "lucide-react";

interface GoalWorkspaceProps {
  goal: Goal;
  onBack: () => void;
  onToggleTask: (taskId: string, isCompleted: boolean) => Promise<void>;
  onExecuteTask: (taskId: string, userPrompt?: string) => Promise<void>;
  onTriggerRecovery: () => Promise<void>;
  onRefreshGoal: () => Promise<void>;
}

interface ChatMessage {
  sender: "user" | "cos";
  text: string;
  timestamp: string;
}

export default function GoalWorkspace({
  goal,
  onBack,
  onToggleTask,
  onExecuteTask,
  onTriggerRecovery,
  onRefreshGoal
}: GoalWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<"briefing" | "timeline" | "research" | "chat">("timeline");
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [executingTaskId, setExecutingTaskId] = useState<string | null>(null);
  const [taskPrompt, setTaskPrompt] = useState<{ [taskId: string]: string }>({});
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  // Mark Done compliment toast state
  const [complimentToast, setComplimentToast] = useState<{
    show: boolean;
    taskTitle: string;
    message: string;
  }>({ show: false, taskTitle: "", message: "" });

  // Research States
  const [researchPackage, setResearchPackage] = useState<any | null>(null);
  const [loadingResearch, setLoadingResearch] = useState(false);
  
  // Chat States
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ [goalId: string]: ChatMessage[] }>({});
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchResearch();
  }, [goal.id]);

  useEffect(() => {
    if (activeTab === "research") {
      fetchResearch();
    }
  }, [activeTab]);

  const fetchResearch = async () => {
    setLoadingResearch(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/research`);
      if (res.ok) {
        const pkgs = await res.json();
        if (pkgs && pkgs.length > 0) {
          setResearchPackage(pkgs[0]);
        } else {
          setResearchPackage(null);
        }
      }
    } catch (err) {
      console.error("Failed to fetch research package:", err);
    } finally {
      setLoadingResearch(false);
    }
  };

  const handleTriggerResearch = async () => {
    setLoadingResearch(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/research/trigger`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setResearchPackage(data);
      } else {
        alert("Failed to synthesize research package.");
      }
    } catch (err) {
      console.error("Error triggering research:", err);
    } finally {
      setLoadingResearch(false);
    }
  };


  // Initialize or load chat history for this goal
  useEffect(() => {
    if (!chatHistory[goal.id]) {
      setChatHistory(prev => ({
        ...prev,
        [goal.id]: [
          {
            sender: "cos",
            text: `Greetings. I am Guardian Core. I have structured a fully prioritized timeline for: **"${goal.title}"**. 


You can ask me to adjust or refine this roadmap at any time. For example:
- *"Move all study focus blocks to weekends"*
- *"Reduce daily task estimates to 1 hour"*
- *"Add a custom module for preparation"*
- *"Extend my deadline"*

How can I optimize your execution plan today?`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]
      }));
    }
  }, [goal.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory[goal.id], isChatting]);

  const activeChats = chatHistory[goal.id] || [];

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg: ChatMessage = {
      sender: "user",
      text: chatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setChatHistory(prev => ({
      ...prev,
      [goal.id]: [...(prev[goal.id] || []), userMsg]
    }));

    const textToSend = chatInput;
    setChatInput("");
    setIsChatting(true);

    try {
      const response = await fetch(`/api/goals/${goal.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToSend })
      });

      if (response.ok) {
        const data = await response.json();
        // data contains { responseMessage, goal }
        const cosMsg: ChatMessage = {
          sender: "cos",
          text: data.responseMessage,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        setChatHistory(prev => ({
          ...prev,
          [goal.id]: [...(prev[goal.id] || []), cosMsg]
        }));

        // Refresh top-level goals in parent
        await onRefreshGoal();
      } else {
        const cosMsg: ChatMessage = {
          sender: "cos",
          text: "I encountered an issue connecting to the core server database, but I am standing by to help adjust your calendar manually.",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setChatHistory(prev => ({
          ...prev,
          [goal.id]: [...(prev[goal.id] || []), cosMsg]
        }));
      }
    } catch (err) {
      console.error("Chat error:", err);
    } finally {
      setIsChatting(false);
    }
  };

  const handleExecute = async (taskId: string) => {
    setExecutingTaskId(taskId);
    try {
      await onExecuteTask(taskId, taskPrompt[taskId] || "");
      setTaskPrompt(prev => ({ ...prev, [taskId]: "" }));
    } catch (err) {
      console.error(err);
    } finally {
      setExecutingTaskId(null);
    }
  };

  const handleCopyAsset = (taskId: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTaskId(taskId);
    setTimeout(() => setCopiedTaskId(null), 2000);
  };

  const handleApplyRecovery = async () => {
    setRecoveryLoading(true);
    try {
      await onTriggerRecovery();
    } catch (err) {
      console.error(err);
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Smart "Mark Done" handler with early-completion compliment
  const earlyCompliments = [
    "Already done? You're a machine! 🔥",
    "Ahead of schedule — impressive! 🚀",
    "Crushed it before the deadline! 💪",
    "Done early? That's elite productivity! ⚡",
    "You finished this early? Legendary! 🏆",
    "Before the deadline? You're unstoppable! 🎯",
    "Speed and quality — you have both! ✨",
    "Completed ahead of time — amazing work! 🎉"
  ];

  const handleMarkDone = async (task: Task) => {
    if (task.isCompleted) return; // Already done

    // Find the related milestone to check its target date
    const relatedMilestone = goal.plan?.milestones?.find(
      (m) => m.id === task.relatedMilestoneId
    );

    // Determine the reference date: milestone targetDate or goal deadline
    const referenceDate = relatedMilestone?.targetDate || goal.deadline;
    const now = new Date();
    const deadlineDate = new Date(referenceDate);

    // Check if completing before the deadline
    const isEarly = now < deadlineDate;

    // Toggle the task to completed
    await onToggleTask(task.id, true);

    if (isEarly) {
      const randomCompliment = earlyCompliments[Math.floor(Math.random() * earlyCompliments.length)];
      setComplimentToast({
        show: true,
        taskTitle: task.title,
        message: randomCompliment,
      });

      // Auto-hide toast after 4 seconds
      setTimeout(() => {
        setComplimentToast({ show: false, taskTitle: "", message: "" });
      }, 4000);
    }
  };

  // Smart "Mark Milestone Done" handler
  const handleMarkMilestoneDone = async (milestone: Milestone) => {
    if (milestone.status === "completed") return;

    // Mark all tasks under this milestone as done
    const milestoneTasks = (goal.plan?.tasks || []).filter(
      (t) => t.relatedMilestoneId === milestone.id && !t.isCompleted
    );

    for (const task of milestoneTasks) {
      await onToggleTask(task.id, true);
    }

    const now = new Date();
    const targetDate = new Date(milestone.targetDate);
    const isEarly = now < targetDate;

    if (isEarly) {
      const randomCompliment = earlyCompliments[Math.floor(Math.random() * earlyCompliments.length)];
      setComplimentToast({
        show: true,
        taskTitle: milestone.title,
        message: randomCompliment,
      });
      setTimeout(() => {
        setComplimentToast({ show: false, taskTitle: "", message: "" });
      }, 4000);
    }
  };

  // Beautiful inline markdown parser
  const parseInlineStyles = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={index} className="font-semibold text-apple-ink">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={index} className="bg-apple-canvas-parchment border border-apple-hairline text-red-600 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium">{part.slice(1, -1)}</code>;
      }
      return part;
    });
  };

  const renderMarkdown = (content: string) => {
    return content.split("\n").map((line, idx) => {
      const cleanLine = line.trim();
      if (cleanLine.startsWith("### ")) {
        return <h4 key={idx} className="text-[14px] font-semibold text-apple-ink mt-4 mb-2 tracking-tight font-display">{cleanLine.replace("### ", "")}</h4>;
      }
      if (cleanLine.startsWith("## ")) {
        return <h3 key={idx} className="text-[15px] font-semibold text-apple-blue mt-5 mb-2 tracking-wider font-display uppercase">{cleanLine.replace("## ", "")}</h3>;
      }
      if (cleanLine.startsWith("# ")) {
        return <h2 key={idx} className="text-[18px] font-semibold text-apple-ink mt-5 mb-3 tracking-tight font-display">{cleanLine.replace("# ", "")}</h2>;
      }
      if (cleanLine.startsWith("- ") || cleanLine.startsWith("* ")) {
        return (
          <li key={idx} className="list-disc list-inside text-[13px] text-gray-600 leading-relaxed ml-3 my-1">
            {parseInlineStyles(cleanLine.substring(2))}
          </li>
        );
      }
      if (cleanLine.match(/^\d+\.\s/)) {
        return (
          <li key={idx} className="list-decimal list-inside text-[13px] text-gray-600 leading-relaxed ml-3 my-1">
            {parseInlineStyles(cleanLine.replace(/^\d+\.\s/, ""))}
          </li>
        );
      }
      if (cleanLine === "") return <div key={idx} className="h-2" />;
      return <p key={idx} className="text-[13px] text-gray-600 leading-relaxed my-2">{parseInlineStyles(line)}</p>;
    });
  };

  const riskLevel = goal.progress?.currentRiskLevel || "Low";
  const tasks = goal.plan?.tasks || [];

  return (
    <div className="space-y-8 font-sans">
      {/* Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-apple-hairline pb-6">
        <div className="space-y-3">
          <button
            id="workspace-back-btn"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-apple-ink cursor-pointer transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Strategic Dashboard
          </button>
          
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-apple-ink font-display">
              {goal.title}
            </h1>
            <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full uppercase tracking-widest ${
              goal.status === "completed"
                ? "bg-green-50 text-green-700 border border-green-200"
                : riskLevel === "High"
                ? "bg-red-50 text-red-700 border border-red-200"
                : riskLevel === "Medium"
                ? "bg-amber-50 text-amber-700 border border-amber-200"
                : "bg-apple-blue/5 text-apple-blue border border-apple-blue/15"
            }`}>
              {goal.status === "completed" ? "Completed" : `${riskLevel} Risk`}
            </span>
          </div>

          <p className="text-[14px] text-gray-500 font-light">
            Strategic Deadline: <strong className="font-semibold text-apple-ink">{goal.analysis?.deadlineFormatted || goal.deadline}</strong>
          </p>
        </div>

        {/* Action tab controller */}
        <div className="flex bg-white border border-apple-hairline p-1 rounded-full shrink-0 shadow-sm self-start">
          {[
            { id: "briefing", label: "Executive Briefing" },
            { id: "timeline", label: "Milestones Checklist" },
            { id: "research", label: "Research & Knowledge" },
            { id: "chat", label: "Guardian Core Chat" }
          ].map(tab => (
            <button
              key={tab.id}
              id={`workspace-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-full text-[13px] font-medium transition-all cursor-pointer ${
                activeTab === tab.id
                  ? "bg-apple-blue text-white shadow-sm"
                  : "text-gray-500 hover:text-apple-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main workspace container based on active Tab */}
      {activeTab === "briefing" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main info panel */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-apple-hairline rounded-[24px] p-6 md:p-8 shadow-sm">
              <h3 className="text-[17px] font-semibold text-apple-ink font-display tracking-tight mb-4 flex items-center gap-2">
                <Target className="w-4.5 h-4.5 text-apple-blue" /> Project Overview & Objective
              </h3>
              <p className="text-[14px] text-gray-600 leading-relaxed font-light">
                {goal.context || "No additional context was provided during formulation. Guardian Core has mapped a path based on parameters extracted from your natural query."}
              </p>
              {goal.analysis?.explanation && (
                <div className="mt-4 pt-4 border-t border-apple-hairline">
                  <h4 className="text-[12.5px] font-semibold text-apple-ink tracking-wide mb-1.5 flex items-center gap-1.5 text-gray-500">
                    <Sparkles className="w-3.5 h-3.5 text-apple-blue" /> Scheduling Explanation
                  </h4>
                  <p className="text-[13px] text-gray-500 leading-relaxed font-light">
                    {goal.analysis.explanation}
                  </p>
                </div>
              )}
            </div>

            {/* Constraints & Dependencies list */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm">
                <h4 className="text-[14px] font-semibold text-apple-ink uppercase tracking-wider font-mono mb-3 text-gray-400">
                  CRITICAL CONSTRAINTS
                </h4>
                {goal.analysis?.constraints && goal.analysis.constraints.length > 0 ? (
                  <ul className="space-y-2.5">
                    {goal.analysis.constraints.map((c, i) => (
                      <li key={i} className="text-[13px] text-gray-600 leading-relaxed flex items-start gap-2">
                        <span className="text-apple-blue font-bold mt-0.5">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-gray-400 italic">No static constraints registered.</p>
                )}
              </div>

              <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm">
                <h4 className="text-[14px] font-semibold text-apple-ink uppercase tracking-wider font-mono mb-3 text-gray-400">
                  DEPENDENCIES UNCOVERED
                </h4>
                {goal.analysis?.dependencies && goal.analysis.dependencies.length > 0 ? (
                  <ul className="space-y-2.5">
                    {goal.analysis.dependencies.map((d, i) => (
                      <li key={i} className="text-[13px] text-gray-600 leading-relaxed flex items-start gap-2">
                        <span className="text-apple-blue font-bold mt-0.5">•</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-gray-400 italic">No prerequisite blocks identified.</p>
                )}
              </div>
            </div>

            {/* Risk Warnings */}
            {goal.progress?.riskExplanations && goal.progress.riskExplanations.length > 0 && (
              <div className="bg-red-50/50 border border-red-100 rounded-[24px] p-6 space-y-3">
                <h4 className="text-[14px] font-semibold text-red-800 tracking-tight flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-600" /> Guardian Core Risk Alert
                </h4>
                <ul className="space-y-2">
                  {goal.progress.riskExplanations.map((exp, i) => (
                    <li key={i} className="text-[13px] text-red-700 leading-relaxed flex items-start gap-2">
                      <span className="font-bold mt-0.5">•</span>
                      <span>{exp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sidebar metrics & recovery plan */}
          <div className="space-y-6">
            <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-6">
              <h3 className="text-[15px] font-semibold text-apple-ink font-display tracking-tight">
                Vital Performance Stats
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-apple-canvas-parchment/60 p-4 rounded-[18px] border border-apple-hairline/40 text-center">
                  <span className="text-[10px] uppercase tracking-wider font-mono text-gray-400 block mb-1">
                    FEASIBILITY
                  </span>
                  <span className="text-2xl font-semibold text-apple-ink font-display">
                    {goal.analysis?.feasibilityScore || 80}%
                  </span>
                </div>

                <div className="bg-apple-canvas-parchment/60 p-4 rounded-[18px] border border-apple-hairline/40 text-center">
                  <span className="text-[10px] uppercase tracking-wider font-mono text-gray-400 block mb-1">
                    RISK FACTOR
                  </span>
                  <span className="text-2xl font-semibold text-apple-ink font-display">
                    {goal.analysis?.riskScore || 25}%
                  </span>
                </div>
              </div>

              {/* Progress Procrastination meter */}
              {goal.progress && (
                <div className="space-y-2 pt-2 border-t border-apple-hairline">
                  <div className="flex justify-between text-[12px] font-medium text-gray-500">
                    <span>Inertia Indicator</span>
                    <span>{goal.progress.procrastinationIndicator}/100</span>
                  </div>
                  <div className="w-full bg-apple-canvas-parchment h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        goal.progress.procrastinationIndicator > 60
                          ? "bg-red-500"
                          : goal.progress.procrastinationIndicator > 30
                          ? "bg-amber-500"
                          : "bg-apple-blue"
                      }`}
                      style={{ width: `${goal.progress.procrastinationIndicator}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Scope compression protocol */}
            {goal.progress?.recoveryPlan && (
              <div className="bg-white border border-apple-blue/20 rounded-[24px] p-6 shadow-sm space-y-4">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="w-5 h-5 text-apple-blue mt-0.5 animate-pulse shrink-0" />
                  <div>
                    <h4 className="text-[14px] font-semibold text-apple-ink tracking-tight font-display">
                      Scope Compression Protocol
                    </h4>
                    <p className="text-[11px] text-gray-400 uppercase tracking-widest font-mono mt-0.5">
                      RECOVERY MODE ACTIVE
                    </p>
                  </div>
                </div>

                <p className="text-[12.5px] text-gray-600 leading-relaxed font-light">
                  {goal.progress.recoveryPlan.summary}
                </p>

                <div className="space-y-2 border-t border-apple-hairline/60 pt-3">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest block font-mono">
                    PROPOSED CRASH MEASURES:
                  </span>
                  <ul className="space-y-1.5">
                    {goal.progress.recoveryPlan.actions.map((act, idx) => (
                      <li key={idx} className="text-[12px] text-gray-600 leading-relaxed flex items-start gap-1.5">
                        <span className="text-apple-blue font-bold">•</span>
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  id="apply-recovery-btn"
                  onClick={handleApplyRecovery}
                  disabled={recoveryLoading}
                  className="w-full bg-apple-blue hover:bg-apple-blue-focus text-white text-xs font-semibold py-2.5 px-4 rounded-full transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-97 disabled:opacity-50"
                >
                  {recoveryLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Reorganizing timeline...
                    </>
                  ) : (
                    <>Apply Crash Recovery Measures</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TIMELINE & MILESTONES CHECKLIST VIEW */}
      {activeTab === "timeline" && (
        <div className="space-y-8">
          <div className="flex items-center justify-between border-b border-apple-hairline pb-3">
            <h3 className="text-[17px] font-semibold text-apple-ink tracking-tight font-display">
              Chronological Execution DAG & Milestones
            </h3>
            <span className="text-[12px] text-gray-400 font-mono uppercase tracking-wider">
              {tasks.filter(t => t.isCompleted).length} of {tasks.length} tasks complete
            </span>
          </div>

          {tasks.length > 0 && (
            <div className="bg-[#f5f5f7]/30 dark:bg-zinc-800/30 border border-apple-hairline dark:border-zinc-800 rounded-[20px] p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-semibold text-apple-ink dark:text-white flex items-center gap-1.5 font-display">
                  <CheckCircle2 className="w-4 h-4 text-apple-blue" /> Roadmap Completion Progress
                </span>
                <span className="font-mono text-apple-blue font-semibold">
                  {Math.round((tasks.filter(t => t.isCompleted).length / tasks.length) * 100)}% Complete
                </span>
              </div>
              <div className="w-full bg-apple-canvas-parchment dark:bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-apple-hairline/40">
                <div
                  className="h-full bg-apple-blue transition-all duration-500 ease-out"
                  style={{ width: `${(tasks.filter(t => t.isCompleted).length / tasks.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {tasks.length === 0 ? (
            <div className="text-center py-12 bg-white border border-apple-hairline rounded-[24px]">
              <p className="text-gray-400 italic text-[14px]">
                Plan is currently compiling. Chat with Guardian Core to construct the timeline.
              </p>
            </div>
          ) : goal.plan?.milestones && goal.plan.milestones.length > 0 ? (
            <div className="space-y-8 relative before:absolute before:left-6 before:top-2 before:bottom-2 before:w-0.5 before:bg-apple-hairline/60">
              {goal.plan.milestones.map((milestone) => {
                const milestoneTasks = tasks.filter(t => t.relatedMilestoneId === milestone.id);
                const prerequisiteTitles = (milestone.dependencies || [])
                  .map(depId => goal.plan?.milestones?.find(m => m.id === depId)?.title)
                  .filter(Boolean);

                return (
                  <div key={milestone.id} className="relative pl-12 space-y-4">
                    {/* Circle Node on Timeline Line */}
                    <div className={`absolute left-4.5 top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-white z-10 transition-colors ${
                      milestone.status === "completed"
                        ? "border-green-500 bg-green-50"
                        : milestone.status === "in_progress"
                        ? "border-apple-blue bg-apple-blue/10 animate-pulse"
                        : "border-gray-300"
                    }`} />

                    {/* Milestone Card */}
                    <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-4">
                      {/* Milestone Header */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 border-b border-apple-hairline/50 pb-3">
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold font-mono tracking-widest text-apple-blue uppercase">
                            Milestone Checkpoint
                          </span>
                          <h4 className="text-[16px] font-semibold text-apple-ink font-display">
                            {milestone.title}
                          </h4>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            milestone.status === "completed"
                              ? "bg-green-50 text-green-700 border border-green-200"
                              : milestone.status === "in_progress"
                              ? "bg-apple-blue/5 text-apple-blue border border-apple-blue/15"
                              : "bg-gray-50 text-gray-500 border border-gray-200"
                          }`}>
                            {milestone.status.replace("_", " ").toUpperCase()}
                          </span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                            milestone.riskLevel === "High"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : milestone.riskLevel === "Medium"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-green-50 text-green-700 border border-green-200"
                          }`}>
                            {milestone.riskLevel} Risk
                          </span>
                          {milestone.status !== "completed" && (
                            <button
                              id={`mark-milestone-done-btn-${milestone.id}`}
                              onClick={() => handleMarkMilestoneDone(milestone)}
                              className="inline-flex items-center gap-1 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-[10px] font-semibold px-2.5 py-1 rounded-full transition-all cursor-pointer active:scale-95 shadow-sm"
                            >
                              <CheckCheck className="w-3 h-3" /> Mark Milestone Done
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Milestone Details */}
                      <div className="text-[13px] text-gray-500 font-light space-y-2">
                        <p>{milestone.description}</p>
                        <p>
                          Target Completion Date: <strong className="font-semibold text-apple-ink">{milestone.targetDate}</strong> • Effort Allocation: <strong className="font-semibold text-apple-ink">{milestone.estimatedMinutes} mins</strong>
                        </p>
                        <p className="italic text-[12px] text-gray-400">
                          Completion Criteria: {milestone.completionCriteria}
                        </p>

                        {/* Prerequisites DAG edges */}
                        {prerequisiteTitles.length > 0 && (
                          <div className="mt-2 text-[12px] text-amber-700 bg-amber-50/55 border border-amber-100 rounded-lg p-2 flex items-center gap-1.5">
                            <span className="font-semibold">Prerequisite:</span>
                            <span>{prerequisiteTitles.join(", ")}</span>
                          </div>
                        )}
                      </div>

                      {/* Nested Tasks */}
                      {milestoneTasks.length > 0 ? (
                        <div className="space-y-3 pt-2">
                          <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest font-mono">
                            Associated Tasks:
                          </h5>
                          <div className="space-y-3">
                            {milestoneTasks.map((task) => (
                              <div
                                key={task.id}
                                className={`border rounded-[18px] p-4 transition-all duration-300 ${
                                  task.isCompleted ? "border-apple-hairline bg-gray-50/40 opacity-80" : "border-apple-hairline bg-apple-surface-pearl/10"
                                }`}
                              >
                                <div className="flex items-start gap-3">
                                  <button
                                    id={`toggle-task-btn-${task.id}`}
                                    onClick={() => onToggleTask(task.id, !task.isCompleted)}
                                    className="mt-0.5 transition-transform active:scale-90 text-gray-400 hover:text-apple-blue cursor-pointer shrink-0"
                                  >
                                    {task.isCompleted ? (
                                      <CheckCircle2 className="w-5 h-5 text-apple-blue fill-apple-blue/5" />
                                    ) : (
                                      <Circle className="w-5 h-5 text-gray-300" />
                                    )}
                                  </button>

                                  <div className="flex-1 space-y-2">
                                    <div>
                                      <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                        <span className="font-bold font-mono tracking-widest text-apple-blue uppercase">
                                          DAY {task.dayNumber}
                                        </span>
                                        <span className="text-gray-300">•</span>
                                        <span className="text-gray-500 font-medium">{task.estimatedMinutes} mins</span>
                                        {task.priority && (
                                          <>
                                            <span className="text-gray-300">•</span>
                                            <span className={`font-semibold ${
                                              task.priority === "High" ? "text-red-600" : task.priority === "Medium" ? "text-amber-600" : "text-green-600"
                                            }`}>{task.priority} Priority</span>
                                          </>
                                        )}
                                      </div>
                                      <h5 className={`text-[14px] font-semibold text-apple-ink mt-0.5 ${task.isCompleted ? "line-through text-gray-400" : ""}`}>
                                        {task.title}
                                      </h5>
                                      <p className="text-[12.5px] text-gray-500 font-light mt-1 leading-relaxed">
                                        {task.description}
                                      </p>
                                      {!task.isCompleted && (
                                        <button
                                          id={`mark-done-btn-${task.id}`}
                                          onClick={() => handleMarkDone(task)}
                                          className="mt-2 inline-flex items-center gap-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-[11px] font-semibold px-3 py-1.5 rounded-full transition-all cursor-pointer active:scale-95 shadow-sm"
                                        >
                                          <Trophy className="w-3.5 h-3.5" /> Mark as Done
                                        </button>
                                      )}
                                    </div>

                                    {/* AI Co-Pilot block */}
                                    <div className="bg-apple-canvas-parchment/60 border border-apple-hairline/50 rounded-[14px] p-3.5 space-y-2.5">
                                      <div className="flex items-center gap-1 text-apple-blue">
                                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                                        <span className="text-[11px] font-semibold tracking-tight uppercase">AI Co-Pilot Drafting Assistant</span>
                                      </div>
                                      
                                      {task.aiAssistance ? (
                                        <div className="space-y-2.5">
                                          <div className="bg-white border border-apple-hairline/80 rounded-[10px] p-3 max-h-60 overflow-y-auto shadow-sm text-left text-[12.5px] leading-relaxed">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest font-mono block mb-1">
                                              Generated {task.aiAssistance.assetType}
                                            </span>
                                            <div className="prose prose-sm text-apple-ink">
                                              {renderMarkdown(task.aiAssistance.content)}
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-2">
                                            <button
                                              id={`copy-asset-btn-${task.id}`}
                                              onClick={() => handleCopyAsset(task.id, task.aiAssistance!.content)}
                                              className="inline-flex items-center gap-1 bg-white hover:bg-gray-50 border border-apple-hairline text-[11px] text-gray-600 font-medium py-1 px-2.5 rounded-full shadow-sm transition-all cursor-pointer"
                                            >
                                              {copiedTaskId === task.id ? <><Check className="w-3 h-3 text-green-600" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Draft</>}
                                            </button>
                                            <button
                                              id={`rebuild-asset-btn-${task.id}`}
                                              onClick={() => handleExecute(task.id)}
                                              disabled={executingTaskId === task.id}
                                              className="inline-flex items-center gap-1 bg-white hover:bg-gray-50 border border-apple-hairline text-[11px] text-gray-600 font-medium py-1 px-2.5 rounded-full shadow-sm transition-all cursor-pointer"
                                            >
                                              <RefreshCw className={`w-3 h-3 ${executingTaskId === task.id ? "animate-spin text-apple-blue" : ""}`} /> Re-generate
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="space-y-2">
                                          <p className="text-[11.5px] text-gray-500 font-light">Need a custom roadmap outline or starter code? Request below:</p>
                                          <div className="flex gap-2">
                                            <input
                                              id={`task-assist-input-${task.id}`}
                                              type="text"
                                              placeholder="Instructions... (e.g. Keep it brief)"
                                              value={taskPrompt[task.id] || ""}
                                              onChange={(e) => setTaskPrompt(prev => ({ ...prev, [task.id]: e.target.value }))}
                                              disabled={executingTaskId === task.id}
                                              className="flex-1 bg-white border border-apple-hairline rounded-[8px] px-2.5 py-1 text-[11.5px] text-apple-ink focus:outline-none"
                                            />
                                            <button
                                              id={`assist-submit-btn-${task.id}`}
                                              onClick={() => handleExecute(task.id)}
                                              disabled={executingTaskId === task.id}
                                              className="bg-apple-blue hover:bg-apple-blue-focus text-white text-[11px] font-semibold px-3 py-1 rounded-[8px] transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                            >
                                              {executingTaskId === task.id ? <><Loader2 className="w-3 h-3 animate-spin" /> Drafting...</> : <>Compose</>}
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[12px] text-gray-400 italic">No tasks mapped to this milestone checkpoint.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Flat Tasks fallback for legacy plans
            <div className="space-y-4">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`bg-white border rounded-[22px] p-5 md:p-6 transition-all duration-300 shadow-sm ${
                    task.isCompleted ? "border-apple-hairline bg-gray-50/50 opacity-90" : "border-apple-hairline"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* Circle check selector */}
                    <button
                      id={`toggle-task-btn-${task.id}`}
                      onClick={() => onToggleTask(task.id, !task.isCompleted)}
                      className="mt-1 transition-transform active:scale-90 text-gray-400 hover:text-apple-blue cursor-pointer shrink-0"
                    >
                      {task.isCompleted ? (
                        <CheckCircle2 className="w-6 h-6 text-apple-blue fill-apple-blue/5" />
                      ) : (
                        <Circle className="w-6 h-6 text-gray-300" />
                      )}
                    </button>

                    {/* Task details */}
                    <div className="flex-1 space-y-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="text-[10px] font-bold font-mono tracking-widest text-apple-blue uppercase">
                            DAY {task.dayNumber}
                          </span>
                          <span className="text-gray-300 text-[11px] font-mono">•</span>
                          <span className="text-[11px] text-gray-500 font-medium">
                            {task.estimatedMinutes} minutes allocation
                          </span>
                        </div>
                        <h4 className={`text-[16px] font-semibold tracking-tight text-apple-ink mt-0.5 font-display ${
                          task.isCompleted ? "line-through text-gray-400" : ""
                        }`}>
                          {task.title}
                        </h4>
                        <p className="text-[13px] text-gray-500 font-light mt-1.5 leading-relaxed">
                          {task.description}
                        </p>
                        {!task.isCompleted && (
                          <button
                            id={`mark-done-btn-${task.id}`}
                            onClick={() => handleMarkDone(task)}
                            className="mt-2 inline-flex items-center gap-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 text-[12px] font-semibold px-3.5 py-1.5 rounded-full transition-all cursor-pointer active:scale-95 shadow-sm"
                          >
                            <Trophy className="w-3.5 h-3.5" /> Mark as Done
                          </button>
                        )}
                      </div>

                      {/* AI Copilot Assisting Section */}
                      <div className="bg-apple-canvas-parchment/60 border border-apple-hairline/50 rounded-[16px] p-4 space-y-3">
                        <div className="flex items-center gap-1.5 text-apple-blue">
                          <Sparkles className="w-4 h-4 shrink-0" />
                          <span className="text-[12px] font-semibold font-display tracking-tight uppercase">
                            AI Co-Pilot Drafting Assistant
                          </span>
                        </div>

                        {task.aiAssistance ? (
                          <div className="space-y-3">
                            <div className="bg-white border border-apple-hairline/80 rounded-[12px] p-4 max-h-80 overflow-y-auto shadow-sm text-left">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono block mb-2">
                                Generated {task.aiAssistance.assetType}
                              </span>
                              <div className="prose prose-sm text-apple-ink">
                                {renderMarkdown(task.aiAssistance.content)}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                id={`copy-asset-btn-${task.id}`}
                                onClick={() => handleCopyAsset(task.id, task.aiAssistance!.content)}
                                className="inline-flex items-center gap-1 bg-white hover:bg-gray-50 border border-apple-hairline text-[12px] text-gray-600 font-medium py-1.5 px-3 rounded-full shadow-sm transition-all cursor-pointer"
                              >
                                {copiedTaskId === task.id ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-green-600" /> Copied!
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3.5 h-3.5" /> Copy Draft
                                  </>
                                )}
                              </button>

                              <button
                                id={`rebuild-asset-btn-${task.id}`}
                                onClick={() => handleExecute(task.id)}
                                disabled={executingTaskId === task.id}
                                className="inline-flex items-center gap-1 bg-white hover:bg-gray-50 border border-apple-hairline text-[12px] text-gray-600 font-medium py-1.5 px-3 rounded-full shadow-sm transition-all cursor-pointer disabled:opacity-50"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${executingTaskId === task.id ? "animate-spin text-apple-blue" : ""}`} />
                                Re-generate Draft
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3.5">
                            <p className="text-[12px] text-gray-500 font-light leading-relaxed">
                              Need a draft roadmap, email blueprint, custom SQL outline, or starting framework to speed up this task? Enter your parameters below:
                            </p>
                            <div className="flex gap-2">
                              <input
                                id={`task-assist-input-${task.id}`}
                                type="text"
                                placeholder="Specific instructions (optional)... e.g., Keep it short"
                                value={taskPrompt[task.id] || ""}
                                onChange={(e) => setTaskPrompt(prev => ({ ...prev, [task.id]: e.target.value }))}
                                disabled={executingTaskId === task.id}
                                className="flex-1 bg-white border border-apple-hairline rounded-[10px] px-3 py-1.5 text-[12px] text-apple-ink focus:outline-none focus:border-apple-blue"
                              />
                              <button
                                id={`assist-submit-btn-${task.id}`}
                                onClick={() => handleExecute(task.id)}
                                disabled={executingTaskId === task.id}
                                className="bg-apple-blue hover:bg-apple-blue-focus text-white text-[12px] font-semibold px-4 py-1.5 rounded-[10px] transition-all flex items-center gap-1 shadow-sm cursor-pointer disabled:opacity-50 shrink-0"
                              >
                                {executingTaskId === task.id ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Drafting...
                                  </>
                                ) : (
                                  <>Compose Draft</>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RESEARCH & KNOWLEDGE DISCOVERY VIEW */}
      {activeTab === "research" && (
        <div className="space-y-6 text-left">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-apple-hairline pb-4">
            <div>
              <h3 className="text-[17px] font-semibold text-apple-ink tracking-tight font-display flex items-center gap-1.5">
                <BookOpen className="w-5 h-5 text-apple-blue" /> Goal-Oriented Knowledge & Research Packages
              </h3>
              <p className="text-[12.5px] text-gray-400 font-light mt-0.5">
                Inspect synthesized prerequisites, glossary terms, roadmaps, and references.
              </p>
            </div>
            <button
              onClick={handleTriggerResearch}
              disabled={loadingResearch}
              className="px-4 py-2 border border-apple-blue hover:bg-apple-blue/5 text-apple-blue text-xs font-semibold rounded-full flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-center"
            >
              {loadingResearch ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Gathering Knowledge...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh Research
                </>
              )}
            </button>
          </div>

          {loadingResearch ? (
            <div className="py-24 text-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-apple-blue mx-auto" />
              <div className="space-y-1">
                <p className="text-[14px] font-semibold text-apple-ink">Synthesizing Research Intel...</p>
                <p className="text-[11px] text-gray-400 font-light">Deconstructing subtopics, verifying source authority, and building roadmap...</p>
              </div>
            </div>
          ) : !researchPackage ? (
            <div className="text-center py-16 bg-white border border-apple-hairline rounded-[24px] space-y-4">
              <Compass className="w-12 h-12 text-gray-300 mx-auto" />
              <div className="space-y-1.5 max-w-sm mx-auto">
                <h4 className="text-[14px] font-semibold text-apple-ink">No Research Package Found</h4>
                <p className="text-[12.5px] text-gray-400 font-light leading-relaxed">
                  Guardian Core can autonomously gather documentation, academic papers, and tech tutorials specifically tailored to this goal.
                </p>
              </div>
              <button
                onClick={handleTriggerResearch}
                className="bg-apple-blue hover:bg-apple-blue-focus text-white text-xs font-semibold py-2 px-5 rounded-full transition-all cursor-pointer inline-flex items-center gap-1 shadow-sm active:scale-97"
              >
                Trigger Knowledge Synthesis
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main content: summary, concepts, roadmap */}
              <div className="lg:col-span-2 space-y-6">
                {/* Deconstructed Subtopics */}
                <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Deconstructed Subtopics</h4>
                  <div className="flex flex-wrap gap-2">
                    {researchPackage.subtopics.map((sub: string, i: number) => (
                      <span key={i} className="px-3 py-1.5 bg-apple-blue/5 text-apple-blue border border-apple-blue/10 rounded-full text-[12px] font-medium tracking-tight">
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Executive Summary */}
                <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Executive Knowledge Summary</h4>
                  <div className="space-y-3">
                    {researchPackage.summaries.map((sum: string, i: number) => (
                      <p key={i} className="text-[13.5px] text-gray-600 leading-relaxed font-light">
                        {sum}
                      </p>
                    ))}
                  </div>
                </div>

                {/* Concepts Glossary */}
                <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Key Concepts Glossary</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {researchPackage.concepts.map((concept: any, i: number) => (
                      <div key={i} className="p-4 bg-apple-surface-pearl/20 border border-apple-hairline/60 rounded-xl space-y-2">
                        <h5 className="text-[13px] font-semibold text-apple-ink">{concept.concept}</h5>
                        <p className="text-[11.5px] text-gray-500 leading-relaxed font-light">{concept.definition}</p>
                        <p className="text-[10px] text-apple-blue italic leading-relaxed">{concept.importance}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reading Roadmap */}
                <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recommended Reading Roadmap</h4>
                  <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-apple-hairline">
                    {researchPackage.readingRoadmap.map((step: string, i: number) => (
                      <div key={i} className="relative pl-7 text-left">
                        <div className="absolute left-1.5 top-1.5 w-3.5 h-3.5 rounded-full border border-apple-blue bg-white flex items-center justify-center">
                          <span className="w-1.5 h-1.5 rounded-full bg-apple-blue" />
                        </div>
                        <p className="text-[13px] text-gray-700 leading-relaxed font-light">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar: Sources and Action Items */}
              <div className="space-y-6">
                {/* Sources list */}
                <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Discovered Sources</h4>
                  <div className="space-y-3">
                    {researchPackage.sources.map((src: any, i: number) => (
                      <div key={i} className="p-3 bg-apple-surface-pearl/10 border border-apple-hairline rounded-xl space-y-1.5">
                        <div className="flex items-center justify-between text-[9px] font-semibold uppercase">
                          <span className="text-apple-blue">{src.category}</span>
                          <span className="text-green-600">Auth: {src.authorityScore}%</span>
                        </div>
                        <h5 className="text-[12.5px] font-semibold text-apple-ink tracking-tight">
                          <a href={src.url} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1">
                            {src.title} <Link className="w-3 h-3 text-gray-400 inline shrink-0" />
                          </a>
                        </h5>
                        <p className="text-[11px] text-gray-500 leading-relaxed font-light">{src.snippet}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Research Actions */}
                <div className="bg-white border border-apple-hairline rounded-[24px] p-6 shadow-sm space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Research Actions</h4>
                  <ul className="space-y-2.5">
                    {researchPackage.actionItems.map((act: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-[12px] text-gray-600 leading-relaxed font-light">
                        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <div className="border-t border-apple-hairline pt-3 mt-3 flex justify-between text-[10px] text-gray-400 font-mono">
                    <span>FRESHNESS</span>
                    <span className={researchPackage.freshnessStatus === "fresh" ? "text-green-600 font-semibold" : "text-orange-600 font-semibold"}>
                      {researchPackage.freshnessStatus.toUpperCase()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CHIEF OF STAFF CHAT CONVERSATION VIEW */}
      {activeTab === "chat" && (
        <div className="bg-white border border-apple-hairline rounded-[24px] h-[600px] flex flex-col overflow-hidden shadow-md">
          {/* Conversation Area Header */}
          <div className="px-6 py-4 border-b border-apple-hairline bg-apple-surface-pearl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-apple-blue animate-pulse" />
              <span className="text-[14px] font-semibold text-apple-ink font-display tracking-tight">
                Guardian Core Calibration Panel
              </span>
            </div>
            <div className="text-[11px] text-gray-400 font-mono uppercase tracking-wider">
              REAL-TIME SYNC
            </div>
          </div>

          {/* Message log */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-apple-canvas-parchment/10">
            {activeChats.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-xl rounded-[20px] p-4 text-[13.5px] leading-relaxed shadow-sm ${
                    msg.sender === "user"
                      ? "bg-apple-blue text-white rounded-br-none"
                      : "bg-white border border-apple-hairline text-apple-ink rounded-bl-none"
                  }`}
                >
                  <div className="prose prose-sm font-light">
                    {renderMarkdown(msg.text)}
                  </div>
                  <span className={`text-[9px] block mt-1.5 font-light ${msg.sender === "user" ? "text-blue-100 text-right" : "text-gray-400"}`}>
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            ))}

            {isChatting && (
              <div className="flex justify-start">
                <div className="bg-white border border-apple-hairline rounded-[20px] rounded-bl-none p-4 max-w-sm shadow-sm flex items-center gap-2.5">
                  <Loader2 className="w-4 h-4 text-apple-blue animate-spin shrink-0" />
                  <span className="text-[13px] text-gray-500 font-light">
                    Guardian Core updating roadmap...
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Form chat field */}
          <div className="p-4 border-t border-apple-hairline bg-white">
            <form onSubmit={handleSendChatMessage} className="flex gap-2">
              <input
                id="workspace-chat-input"
                type="text"
                placeholder="Instruct Guardian Core... e.g., Move all preparation tasks to weekends"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                disabled={isChatting}
                className="flex-1 bg-apple-canvas-parchment/60 border border-apple-hairline rounded-[18px] px-4 py-3 text-[14px] text-apple-ink focus:outline-none focus:border-apple-blue/50 disabled:opacity-50"
              />
              <button
                id="workspace-chat-send-btn"
                type="submit"
                disabled={isChatting || !chatInput.trim()}
                className="bg-apple-blue hover:bg-apple-blue-focus disabled:bg-apple-blue/50 text-white rounded-[18px] px-5 py-3 flex items-center justify-center cursor-pointer transition-all active:scale-95"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
              {[
                "Move sessions to weekends",
                "Extend deadline by 3 days",
                "Add a custom prep module"
              ].map((pill, idx) => (
                <button
                  key={idx}
                  id={`chat-suggestion-${idx}`}
                  type="button"
                  onClick={() => setChatInput(pill)}
                  className="text-[11px] text-gray-500 hover:text-apple-ink border border-apple-hairline px-2.5 py-1 rounded-full bg-apple-canvas-parchment/40 cursor-pointer hover:bg-apple-canvas-parchment/80 transition-all"
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Early Completion Compliment Toast */}
      {complimentToast.show && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-500">
          <div className="bg-white border border-green-200 rounded-[22px] shadow-2xl px-6 py-4 flex items-center gap-4 max-w-md">
            <div className="w-12 h-12 rounded-full bg-green-50 border border-green-200 flex items-center justify-center shrink-0">
              <Trophy className="w-6 h-6 text-green-600" />
            </div>
            <div className="space-y-0.5 text-left">
              <p className="text-[15px] font-semibold text-apple-ink font-display tracking-tight">
                {complimentToast.message}
              </p>
              <p className="text-[12px] text-gray-500 font-light">
                <strong className="font-medium text-green-700">{complimentToast.taskTitle}</strong> completed ahead of schedule
              </p>
            </div>
            <button
              onClick={() => setComplimentToast({ show: false, taskTitle: "", message: "" })}
              className="text-gray-400 hover:text-gray-600 text-[18px] cursor-pointer ml-2 shrink-0 leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
