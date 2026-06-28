import React, { useState } from "react";
import { Goal, Task } from "../types";
import { Sparkles, Loader2, ArrowRight, Trash2, ShieldAlert, CheckCircle2, ChevronRight, HelpCircle, Target } from "lucide-react";

interface DashboardProps {
  goals: Goal[];
  onSelectGoal: (goal: Goal) => void;
  onDeleteGoal: (id: string, e: React.MouseEvent) => Promise<void>;
  onCreateGoal: (title: string, deadline: string, context: string) => Promise<void>;
  userName?: string;
}

export default function Dashboard({
  goals,
  onSelectGoal,
  onDeleteGoal,
  onCreateGoal,
  userName
}: DashboardProps) {
  const [commandInput, setCommandInput] = useState("");
  const [isFormulating, setIsFormulating] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");

  const activeGoals = goals.filter(g => g.status === "active");
  const goalsAtRisk = activeGoals.filter(g => g.progress?.currentRiskLevel === "High" || g.progress?.currentRiskLevel === "Medium");
  
  // Calculate total tasks left
  let totalTasksLeft = 0;
  activeGoals.forEach(g => {
    if (g.plan?.tasks) {
      totalTasksLeft += g.plan.tasks.filter(t => !t.isCompleted).length;
    }
  });

  // Pick a recommended task
  let recommendedTask: { task: Task; goal: Goal } | null = null;
  for (const goal of activeGoals) {
    if (goal.plan?.tasks) {
      const incomplete = goal.plan.tasks.find(t => !t.isCompleted);
      if (incomplete) {
        recommendedTask = { task: incomplete, goal };
        break;
      }
    }
  }

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim()) return;

    setIsFormulating(true);
    setCommandInput("");
    
    try {
      setLoadingStep("Guardian Core analyzing natural language...");
      // Hit our new parser endpoint
      const parseResponse = await fetch("/api/goals/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: commandInput })
      });
      
      let title = commandInput;
      let deadline = "This Friday";
      let context = "";

      if (parseResponse.ok) {
        const parsed = await parseResponse.json();
        title = parsed.title || title;
        deadline = parsed.deadline || deadline;
        context = parsed.context || context;
      }

      setLoadingStep("Assembling Roundtable advisory board...");
      await onCreateGoal(title, deadline, context);
    } catch (err) {
      console.error("Failed to parse and create goal:", err);
    } finally {
      setIsFormulating(false);
      setLoadingStep("");
    }
  };

  return (
    <div className="space-y-12 pb-16 font-sans">
      {/* 1. Daily Briefing Panel */}
      <div className="bg-white border border-apple-hairline rounded-[24px] p-8 md:p-10 shadow-sm transition-all hover:shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3.5">
            <span className="text-[12px] font-semibold text-gray-400 uppercase tracking-widest block font-display">
              DAILY BRIEFING
            </span>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.03em] leading-tight text-apple-ink font-display">
              Good Day, {userName || "Geetansh"}.
            </h2>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[15px] text-gray-500 font-light">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-apple-blue" />
                <strong>{activeGoals.length}</strong> active goals
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${goalsAtRisk.length > 0 ? "bg-red-500" : "bg-green-500"}`} />
                <strong>{goalsAtRisk.length}</strong> at risk
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-apple-ink-muted-48" />
                <strong>{totalTasksLeft}</strong> remaining sessions
              </span>
            </div>
          </div>

          {recommendedTask && (
            <div className="bg-apple-canvas-parchment border border-apple-hairline/80 px-6 py-5 rounded-[18px] max-w-sm shrink-0 shadow-sm">
              <span className="text-[10px] font-bold text-apple-blue uppercase tracking-widest block mb-2 font-display">
                RECOMMENDED ACTION
              </span>
              <p className="font-semibold text-[15px] text-apple-ink truncate">
                {recommendedTask.task.title}
              </p>
              <p className="text-[12px] text-gray-500 line-clamp-1 mt-1">
                Goal: {recommendedTask.goal.title}
              </p>
              <button
                id="briefing-action-btn"
                onClick={() => onSelectGoal(recommendedTask!.goal)}
                className="mt-3.5 inline-flex items-center gap-1 text-[13px] font-medium text-apple-blue hover:text-apple-blue-focus cursor-pointer"
              >
                Launch Workspace
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. AI Command Center */}
      <div className="space-y-4">
        <h3 className="text-[20px] font-semibold text-apple-ink tracking-tight font-display text-center">
          What do you need to accomplish?
        </h3>
        <div className="max-w-2xl mx-auto bg-white border border-apple-hairline rounded-[24px] p-2 shadow-lg hover:shadow-xl transition-all duration-300">
          <form onSubmit={handleCommandSubmit} className="flex flex-col sm:flex-row items-center gap-2">
            <input
              id="dashboard-command-input"
              type="text"
              placeholder="e.g., Prepare for TCS interview by July 1st..."
              value={commandInput}
              onChange={(e) => setCommandInput(e.target.value)}
              disabled={isFormulating}
              className="w-full flex-1 bg-transparent border-0 px-5 py-4 text-[16px] text-apple-ink placeholder-gray-400 focus:outline-none disabled:opacity-50"
            />
            <button
              id="dashboard-command-submit-btn"
              type="submit"
              disabled={isFormulating || !commandInput.trim()}
              className="w-full sm:w-auto bg-apple-blue hover:bg-apple-blue-focus disabled:bg-apple-blue/50 text-white font-medium px-6 py-4 rounded-[18px] text-[15px] tracking-tight transition-all flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg active:scale-98 cursor-pointer"
            >
              {isFormulating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  Secure Deadline
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Loading overlay/alert inside dashboard */}
        {isFormulating && (
          <div className="max-w-md mx-auto p-4 bg-apple-blue/5 border border-apple-blue/15 rounded-[18px] flex items-center gap-3.5 animate-pulse text-left">
            <Loader2 className="w-5 h-5 text-apple-blue animate-spin shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-apple-blue">Co-pilot Working</p>
              <p className="text-[11px] text-gray-500 mt-0.5">{loadingStep}</p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Goals Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-apple-hairline pb-4">
          <h4 className="text-[20px] font-semibold tracking-tight text-apple-ink font-display">
            Active Strategic Goals
          </h4>
          <span className="text-[13px] text-gray-400">
            {goals.length} Strategic Goals Tracked
          </span>
        </div>

        {goals.length === 0 ? (
          <div className="text-center py-16 bg-white border border-apple-hairline rounded-[24px] space-y-4">
            <div className="w-12 h-12 rounded-full bg-apple-canvas-parchment flex items-center justify-center text-gray-400 mx-auto">
              <Target className="w-6 h-6" />
            </div>
            <p className="text-gray-500 font-light text-[15px] max-w-sm mx-auto leading-relaxed">
              No strategic goals are currently active. Let's formulate your first target above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {goals.map((goal) => {
              const totalTasks = goal.plan?.tasks?.length || 0;
              const completedTasks = goal.plan?.tasks?.filter(t => t.isCompleted).length || 0;
              const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
              const riskLevel = goal.progress?.currentRiskLevel || "Low";

              return (
                <div
                  key={goal.id}
                  onClick={() => onSelectGoal(goal)}
                  className="bg-white border border-apple-hairline rounded-[24px] p-6 hover:shadow-lg transition-all duration-300 cursor-pointer flex flex-col justify-between group"
                >
                  <div className="space-y-4">
                    {/* Goal Card Header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
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
                          {goal.analysis?.complexity && (
                            <span className="text-gray-400 text-[11px] font-mono">
                              {goal.analysis.complexity} complexity
                            </span>
                          )}
                        </div>
                        <h5 className="text-[18px] font-semibold text-apple-ink tracking-tight font-display group-hover:text-apple-blue transition-colors line-clamp-2">
                          {goal.title}
                        </h5>
                      </div>

                      <button
                        id={`delete-goal-btn-${goal.id}`}
                        onClick={(e) => onDeleteGoal(goal.id, e)}
                        className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-all shrink-0 cursor-pointer"
                        title="Delete Goal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Deadline block */}
                    <div className="text-[13px] text-gray-500 font-light">
                      Target: <span className="font-medium text-apple-ink">{goal.analysis?.deadlineFormatted || goal.deadline}</span>
                    </div>

                    {/* Progress Slider */}
                    {totalTasks > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-gray-400 font-medium">
                          <span>Progress</span>
                          <span>{percent}%</span>
                        </div>
                        <div className="w-full bg-apple-canvas-parchment h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-apple-blue h-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Goal bottom details */}
                  <div className="pt-4 border-t border-apple-hairline mt-5 flex items-center justify-between text-[13px]">
                    <span className="text-gray-500">
                      {completedTasks} of {totalTasks} milestones secured
                    </span>
                    <span className="text-apple-blue font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center gap-0.5">
                      Enter Workspace
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
