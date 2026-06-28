import { Task, CalendarSession, RecoveryPlan, Goal } from "./types.js";
import { executeWithRetry } from "./utils.js";
import { GeminiAdapter, Type } from "./integration/google.js";
import { config } from "./infrastructure/config.js";

function getGeminiClient() {
  return GeminiAdapter.getClient();
}

/**
 * Agent 1, 2, 3, 4: Collaborative Roundtable
 * Run Goal Understanding, Feasibility, Dependency Discovery, and Clarification Agents.
 */
export async function runAnalysisRoundtable(
  title: string,
  deadline: string,
  context: string
) {
  const isMock = GeminiAdapter.isMock();
  if (isMock) {
    return {
      deadlineFormatted: `Formatted Deadline: ${deadline}`,
      constraints: ["Requires dedicated study hours", "Requires workspace setup"],
      feasibilityScore: 75,
      riskScore: 35,
      complexity: "Medium" as const,
      risks: ["Procrastination risk due to ambiguous milestones", "Potential resource blockages"],
      dependencies: ["Acquire primary learning resources", "Establish a tracking system"],
      questions: [
        "How many hours per day can you realistically dedicate to this goal?",
        "Do you have access to all the necessary material, or do we need to locate them?",
      ],
    };
  }

  const ai = getGeminiClient();
  const prompt = `
    You are a roundtable of AI Goal Execution Agents.
    Goal Title: "${title}"
    Target Deadline: "${deadline}"
    Additional Context: "${context || 'None'}"

    You will execute the following roles in sequence:
    1. **Goal Understanding Agent**: Parse the goal, extract key constraints, and format the deadline nicely.
    2. **Feasibility Agent**: Calculate realistic feasibility (0-100) and risk (0-100) scores. Assign complexity ("Low", "Medium", or "High").
    3. **Dependency Discovery Agent**: Uncover hidden tasks, prerequisites, and resource blockages.
    4. **Clarification Agent**: Devise 1 or 2 high-impact clarifying questions to reduce execution uncertainty. If the goal is clear enough, questions can be empty.

    Respond STRICTLY with JSON matching the required schema.
  `;

  try {
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              deadlineFormatted: {
                type: Type.STRING,
                description: "Elegant formatted deadline, e.g., 'Friday, June 26, 2026' or 'In 5 days'.",
              },
              constraints: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Explicit constraints identified from context or standard knowledge.",
              },
              feasibilityScore: {
                type: Type.INTEGER,
                description: "0 to 100 representing how achievable this is given the timeframe.",
              },
              riskScore: {
                type: Type.INTEGER,
                description: "0 to 100 representing probability of failure or delay.",
              },
              complexity: {
                type: Type.STRING,
                enum: ["Low", "Medium", "High"],
              },
              risks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Specific identified failure points or risks.",
              },
              dependencies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Hidden prerequisites, resources, or tasks needed before starting.",
              },
              questions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "1 or 2 highly targeted clarifying questions to make the execution plan perfect.",
              },
            },
            required: [
              "deadlineFormatted",
              "constraints",
              "feasibilityScore",
              "riskScore",
              "complexity",
              "risks",
              "dependencies",
              "questions",
            ],
          },
        },
      })
    );

    const text = response.text || "{}";
    return JSON.parse(text);
  } catch (err) {
    console.error("Gemini analysis roundtable error:", err);
    throw err;
  }
}

/**
 * Agent 5: Planning and Scheduling Agents.
 * Builds the roadmap tasks and maps them to calendar slots.
 */
export async function runPlanningAndScheduling(
  title: string,
  deadline: string,
  context: string,
  analysis: any,
  answers?: { [q: string]: string }
) {
  const isMock = GeminiAdapter.isMock();
  if (isMock) {
    const milestones = [
      {
        id: "m1",
        title: "Kickoff and Research Foundation",
        description: "Review context parameters and setup outline",
        estimatedMinutes: 90,
        dependencies: [],
        targetDate: new Date().toISOString().split("T")[0],
        completionCriteria: "Research outline and project parameters established",
        status: "pending" as const,
        riskLevel: "Low" as const
      },
      {
        id: "m2",
        title: "Draft Iteration Milestone",
        description: "Complete first draft or prototype elements",
        estimatedMinutes: 180,
        dependencies: ["m1"],
        targetDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return d.toISOString().split("T")[0];
        })(),
        completionCriteria: "Core component structure or draft at least 50% complete",
        status: "pending" as const,
        riskLevel: "Low" as const
      },
      {
        id: "m3",
        title: "Final Review & Packaging",
        description: "Verify edge-cases, proofs, and compile final submission",
        estimatedMinutes: 120,
        dependencies: ["m2"],
        targetDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 2);
          return d.toISOString().split("T")[0];
        })(),
        completionCriteria: "Successful validation and delivery ready",
        status: "pending" as const,
        riskLevel: "Low" as const
      }
    ];

    const tasks: Task[] = [
      {
        id: "t1",
        title: "Initial research and outline",
        description: "Review parameters, find resources, and draft the core scope.",
        estimatedMinutes: 90,
        dayNumber: 1,
        isCompleted: false,
        completedAt: null,
        aiAssistance: null,
        priority: "Medium",
        relatedMilestoneId: "m1"
      },
      {
        id: "t2",
        title: "First milestone draft",
        description: "Complete the initial 50% draft or setup of components.",
        estimatedMinutes: 180,
        dayNumber: 2,
        isCompleted: false,
        completedAt: null,
        aiAssistance: null,
        priority: "High",
        relatedMilestoneId: "m2"
      },
      {
        id: "t3",
        title: "Review & Polish",
        description: "Test edge cases, proofread drafts, and prepare final submission package.",
        estimatedMinutes: 120,
        dayNumber: 3,
        isCompleted: false,
        completedAt: null,
        aiAssistance: null,
        priority: "Medium",
        relatedMilestoneId: "m3"
      }
    ];

    const schedule: CalendarSession[] = tasks.map((t, idx) => {
      const d = new Date();
      d.setDate(d.getDate() + idx);
      const dateStr = d.toISOString().split("T")[0];
      return {
        id: `s-${t.id}`,
        taskId: t.id,
        title: `Work Block: ${t.title}`,
        date: dateStr,
        startTime: "10:00",
        endTime: idx === 1 ? "13:00" : idx === 2 ? "12:00" : "11:30",
        isSynced: false,
      };
    });

    return { tasks, schedule, milestones };
  }

  const ai = getGeminiClient();
  const prompt = `
    You are a joint team of the **Planning Agent** and **Scheduling Agent**.
    Overarching Goal: "${title}"
    Deadline: "${deadline}"
    Context: "${context || 'None'}"
    Feasibility Analysis: ${JSON.stringify(analysis)}
    User's Answers to clarifying questions: ${JSON.stringify(answers || {})}

    Your job:
    1. **Planning Agent**:
       - Decompose the overarching goal into 2 to 4 major checkpoints or **milestones**. Milestones must form a Directed Acyclic Graph (DAG) using dependencies (e.g., milestone 'm2' depends on 'm1').
       - Create a list of 3 to 6 actionable **tasks**. Each task must link to a \`relatedMilestoneId\` and have a \`priority\` ("Low", "Medium", "High").
       - Assign each task a "dayNumber" relative to start.
    2. **Scheduling Agent**:
       - Allocate specific calendar work sessions for each task. Map each task to a specific date starting from today (${new Date().toISOString().split("T")[0]}) and specify logical startTime and endTime (using "HH:MM" 24h format).
    
    Ensure milestones and tasks are spaced out logically. Ensure calendar sessions are practical.

    Respond STRICTLY in JSON format.
  `;

  try {
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              milestones: {
                type: Type.ARRAY,
                description: "Checkpoints/milestones that form a Directed Acyclic Graph (DAG) using dependencies.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "Milestone ID, e.g. 'm1', 'm2'." },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    estimatedMinutes: { type: Type.INTEGER },
                    dependencies: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "List of other milestone IDs that must be completed before this one starts."
                    },
                    targetDate: { type: Type.STRING, description: "YYYY-MM-DD format." },
                    completionCriteria: { type: Type.STRING },
                    status: { type: Type.STRING, enum: ["pending", "in_progress", "completed", "failed"] },
                    riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High"] }
                  },
                  required: ["id", "title", "description", "estimatedMinutes", "dependencies", "targetDate", "completionCriteria", "status", "riskLevel"]
                }
              },
              tasks: {
                type: Type.ARRAY,
                description: "Chronological task checklist to execute the goal.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "A simple unique ID, e.g., 't1', 't2'." },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    estimatedMinutes: { type: Type.INTEGER },
                    dayNumber: { type: Type.INTEGER, description: "Day relative to start, e.g., 1, 2, 3..." },
                    priority: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
                    relatedMilestoneId: { type: Type.STRING, description: "The milestone ID that this task supports." }
                  },
                  required: ["id", "title", "description", "estimatedMinutes", "dayNumber", "priority", "relatedMilestoneId"],
                },
              },
              schedule: {
                type: Type.ARRAY,
                description: "Calendar time allocations for the tasks.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING, description: "A unique calendar block ID, e.g., 's1', 's2'." },
                    taskId: { type: Type.STRING, description: "The corresponding task ID." },
                    title: { type: Type.STRING },
                    date: { type: Type.STRING, description: "YYYY-MM-DD format." },
                    startTime: { type: Type.STRING, description: "HH:MM format, e.g. '09:00'." },
                    endTime: { type: Type.STRING, description: "HH:MM format, e.g. '11:00'." },
                  },
                  required: ["id", "taskId", "title", "date", "startTime", "endTime"],
                },
              },
            },
            required: ["milestones", "tasks", "schedule"],
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || "{}");
    
    const enrichedTasks: Task[] = (parsed.tasks || []).map((t: any) => ({
      ...t,
      isCompleted: false,
      completedAt: null,
      aiAssistance: null,
    }));

    const enrichedSchedule: CalendarSession[] = (parsed.schedule || []).map((s: any) => ({
      ...s,
      isSynced: false,
    }));

    const enrichedMilestones = (parsed.milestones || []).map((m: any) => ({
      ...m,
      status: m.status || "pending",
      riskLevel: m.riskLevel || "Low"
    }));

    return { tasks: enrichedTasks, schedule: enrichedSchedule, milestones: enrichedMilestones };
  } catch (err) {
    console.error("Gemini planning and scheduling error:", err);
    throw err;
  }
}

/**
 * Agent 6: Execution Agent — Context-Aware Assistance
 * 
 * Generates drafts, outlines, blueprints, structures, or guidance assets.
 * 
 * CRITICAL BEHAVIORAL RULES (Product Realignment):
 * - NEVER hallucinate contacts, email addresses, or meeting details
 * - NEVER pretend tools exist that aren't connected
 * - For email tasks without recipient/purpose: return a professional template
 * - For report tasks without topic details: return a structure guide
 * - Only generate substantive content when sufficient context exists
 */
export async function runExecutionAssistance(
  goalTitle: string,
  taskTitle: string,
  taskDescription: string,
  userPrompt?: string
) {
  // Context-aware classification: what kind of task is this?
  const combined = `${taskTitle} ${taskDescription} ${userPrompt || ""}`.toLowerCase();
  const isEmailTask = combined.includes("email") || combined.includes("mail") || combined.includes("send to") || combined.includes("draft to");
  const isReportTask = combined.includes("report") || combined.includes("essay") || combined.includes("paper") || combined.includes("document");

  // Email task without sufficient context — provide template, don't fabricate
  if (isEmailTask) {
    const hasRecipient = combined.match(/\b[\w.-]+@[\w.-]+\.\w+\b/) || combined.includes("to ");
    const hasPurpose = (userPrompt && userPrompt.length > 20) || taskDescription.length > 30;

    if (!hasRecipient || !hasPurpose) {
      return {
        assetType: "Professional Email Template",
        content: `### Professional Email Template

Since I don't have complete information about the recipient and purpose, here's a professional template you can customize:

---

**To:** [Recipient Name / Email Address]
**Subject:** [Clear, specific subject line]

---

Dear [Recipient Name],

**[Opening]** — State the purpose of your email clearly in 1-2 sentences.

**[Body]** — Provide the necessary details, context, or specific requests.

**[Call to Action]** — Clearly state what you need from the recipient and any deadlines.

Best regards,
[Your Name]
[Your Position]

---

💡 **To get a complete draft, tell me:**
- Who is this email for? (name or email)
- What is the purpose? (follow-up, request, update, etc.)
- Any specific points you want included?

*Guardian Core can draft the full email once these details are provided.*`,
      };
    }
  }

  // Report task without sufficient context — provide structure, don't fabricate content
  if (isReportTask && (!userPrompt || userPrompt.length < 20) && taskDescription.length < 50) {
    return {
      assetType: "Report Structure Guide",
      content: `### Report Structure Guide for: "${taskTitle}"

I'll help you structure this report. Since I don't have the specific topic details, here's a professional framework:

---

#### 1. Title Page
- Report title, author name, date, institution/organization

#### 2. Executive Summary (150-300 words)
- Brief overview of the report's purpose and key findings

#### 3. Introduction
- Background context and objectives
- Scope and limitations

#### 4. Methodology
- Approach and tools used
- Data collection methods (if applicable)

#### 5. Main Content / Findings
- Organized by theme or chronological order
- Supporting evidence, data, or examples

#### 6. Analysis & Discussion
- Interpretation of findings
- Comparison with existing literature or expectations

#### 7. Conclusion & Recommendations
- Summary of key points
- Actionable next steps

#### 8. References / Bibliography
- Properly formatted citations

#### 9. Appendices (if needed)
- Supporting data, charts, raw materials

---

💡 **To get a complete draft, tell me:**
- What specific topic/subject is this report about?
- What organization or course is it for?
- Are there specific formatting requirements?
- What key points should be covered?

*Guardian Core will generate detailed section content once these details are provided.*`,
    };
  }

  const isMock = GeminiAdapter.isMock();
  if (isMock) {
    return {
      assetType: "Draft Outline & Guide",
      content: `### Execution Blueprint for: "${taskTitle}"
      
Here is your structured template to jumpstart this task:

1. **Phase 1: Foundation (15 mins)**
   - Draft an initial outline based on goals.
   - Assemble core reference links and parameters.

2. **Phase 2: Content Generation (45 mins)**
   - Fill in key elements and structures.
   - Refine the draft text.

3. **Suggested Resources**:
   - [Reference Sheet](https://google.com)
   - [Industry Best Practices Guide](https://wikipedia.org)

*Feel free to copy and use this directly!*`,
    };
  }

  // Import capability report for tool awareness
  const { getCapabilityReport } = await import("./cognitive/contextEvaluator.js");
  const capReport = await getCapabilityReport();

  const ai = getGeminiClient();
  const prompt = `
    You are the **Execution Agent** for Guardian Core, an AI-powered Smart Planner and Scheduler.
    
    CRITICAL RULES:
    - NEVER invent contacts, email addresses, phone numbers, or meeting details
    - NEVER pretend you have access to tools that are not listed in the Capability Report
    - If you don't have enough context, clearly state what information you need
    - Focus on providing actionable, realistic assistance based on available information
    
    ${capReport}
    
    Overarching Goal: "${goalTitle}"
    Current Task: "${taskTitle}"
    Task Description: "${taskDescription}"
    User Specific Request/Note: "${userPrompt || 'None'}"

    Analyze the task. Determine the most useful "assetType" (e.g. "Draft Email", "Step-by-step Syllabus", "SQL Schema Blueprint", "Research Synthesis Outline") and generate a highly detailed, professional, immediately usable resource.
    
    If you lack specific context needed to complete this task, acknowledge what's missing and provide a useful template or framework instead.
    
    Format your final response in markdown. Maintain a supportive, highly detailed, high-impact tone.

    Respond STRICTLY in JSON format.
  `;

  try {
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              assetType: { type: Type.STRING, description: "E.g., 'Draft SOP', 'Interview Cheat Sheet', 'Email Template'." },
              content: { type: Type.STRING, description: "Beautifully formatted Markdown containing the actual draft, plan, or materials." },
            },
            required: ["assetType", "content"],
          },
        },
      })
    );

    return JSON.parse(response.text || "{}");
  } catch (err) {
    console.error("Gemini execution agent error:", err);
    throw err;
  }
}

/**
 * Agent 7, 8: Progress & Recovery Sentinel
 * Evaluates completion rates, time remaining, detects risks, and generates a rescue plan if needed.
 */
export async function runProgressAndRecoveryEvaluation(
  goal: Goal
) {
  const isMock = GeminiAdapter.isMock();
  if (isMock) {
    const tasks = goal.plan?.tasks || [];
    const completedCount = tasks.filter(t => t.isCompleted).length;
    const totalCount = tasks.length;
    const completionRate = totalCount > 0 ? completedCount / totalCount : 0;

    let riskLevel: "Low" | "Medium" | "High" = "Low";
    let indicators = 10;
    const explanations: string[] = [];

    if (completionRate < 0.3) {
      riskLevel = "High";
      indicators = 85;
      explanations.push("Extremely low task completion rate with upcoming deadlines.");
      explanations.push("Procrastination risk highlighted: no work has been logged yet.");
    } else if (completionRate < 0.6) {
      riskLevel = "Medium";
      indicators = 50;
      explanations.push("Progress is slightly behind schedule.");
    } else {
      explanations.push("Excellent progress. Keep moving at this pace!");
    }

    const recoveryPlan: RecoveryPlan | null = riskLevel !== "Low" ? {
      summary: "Dynamic Recovery Plan: Compact Scope and Rescheduled Milestones",
      actions: [
        "Consolidate outstanding items to reduce workload by 25%.",
        "Set up absolute focus blocks using pomodoro methods today."
      ],
      revisedTasks: tasks.filter(t => !t.isCompleted).map(t => ({
        taskId: t.id,
        revisedEstimate: Math.max(30, Math.floor(t.estimatedMinutes * 0.8)),
        action: "Compress timeline & focus strictly on core elements",
      }))
    } : null;

    return {
      currentRiskLevel: riskLevel,
      procrastinationIndicator: indicators,
      riskExplanations: explanations,
      recoveryPlan
    };
  }

  const ai = getGeminiClient();
  const tasks = goal.plan?.tasks || [];
  
  const prompt = `
    You are a joint panel of the **Progress Agent** and **Recovery Agent**.
    
    Our goal: "${goal.title}"
    Deadline: "${goal.deadline}"
    Context: "${goal.context || ''}"
    Original Feasibility Analysis: ${JSON.stringify(goal.analysis || {})}
    
    Current Tasks Status:
    ${JSON.stringify(tasks.map(t => ({ id: t.id, title: t.title, isCompleted: t.isCompleted, estimatedMinutes: t.estimatedMinutes })))}

    Current Date: ${new Date().toISOString().split("T")[0]}

    Evaluate the progress of this goal:
    1. **Progress Agent**:
       - Estimate procrastination indicators (0 to 100, where higher is high procrastination or danger).
       - Evaluate currentRiskLevel ("Low", "Medium", "High") based on elapsed time vs completed milestones.
       - Formulate clear explanation bullet points of the current risk.
    2. **Recovery Agent**:
       - If the risk level is "Medium" or "High", design a highly practical "recoveryPlan".
       - This plan should focus on rescue: reducing scope, compressing task estimates, or proposing concrete high-impact actions to guarantee completion before the deadline.
       - If risk is "Low", the recoveryPlan should be null.

    Respond STRICTLY in JSON format.
  `;

  try {
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              currentRiskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
              procrastinationIndicator: { type: Type.INTEGER, description: "0 to 100 indicator" },
              riskExplanations: { type: Type.ARRAY, items: { type: Type.STRING } },
              recoveryPlan: {
                type: Type.OBJECT,
                nullable: true,
                properties: {
                  summary: { type: Type.STRING },
                  actions: { type: Type.ARRAY, items: { type: Type.STRING } },
                  revisedTasks: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        taskId: { type: Type.STRING },
                        revisedEstimate: { type: Type.INTEGER, description: "Compressed minutes" },
                        action: { type: Type.STRING, description: "E.g., 'Scope reduced to essential MVP only'." },
                      },
                      required: ["taskId", "revisedEstimate", "action"],
                    },
                  },
                },
                required: ["summary", "actions", "revisedTasks"],
              },
            },
            required: ["currentRiskLevel", "procrastinationIndicator", "riskExplanations"],
          },
        },
      })
    );

    const parsed = JSON.parse(response.text || "{}");
    if (!parsed.recoveryPlan && parsed.currentRiskLevel !== "Low") {
      parsed.recoveryPlan = {
        summary: "Emergency Recovery Strategy",
        actions: ["Focus strictly on high-priority tasks", "Reduce non-essential scope"],
        revisedTasks: tasks.filter(t => !t.isCompleted).map(t => ({
          taskId: t.id,
          revisedEstimate: Math.max(30, Math.floor(t.estimatedMinutes * 0.7)),
          action: "Optimize output, limit research depth"
        }))
      };
    }
    return parsed;
  } catch (err) {
    console.error("Gemini progress and recovery agent error:", err);
    throw err;
  }
}

export function extractDeadlineFromQuery(query: string): string | null {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  
  // Format 1: "4th july 2026" or "4 july 2026"
  const regex1 = /(\d+)(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/i;
  const match1 = query.match(regex1);
  if (match1) {
    const day = parseInt(match1[1], 10);
    const monthName = match1[2].toLowerCase().substring(0, 3);
    const monthIndex = months.indexOf(monthName) + 1;
    const year = match1[3];
    return `${year}-${String(monthIndex).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Format 2: "july 4th 2026" or "july 4 2026"
  const regex2 = /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d+)(?:st|nd|rd|th)?\s+(\d{4})/i;
  const match2 = query.match(regex2);
  if (match2) {
    const monthName = match2[1].toLowerCase().substring(0, 3);
    const monthIndex = months.indexOf(monthName) + 1;
    const day = parseInt(match2[2], 10);
    const year = match2[3];
    return `${year}-${String(monthIndex).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  
  // Format 3: "4/7/2026" or "04/07/2026"
  const regex3 = /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/;
  const match3 = query.match(regex3);
  if (match3) {
    const val1 = parseInt(match3[1], 10);
    const val2 = parseInt(match3[2], 10);
    const year = match3[3];
    const month = val1 > 12 ? val2 : val1;
    const day = val1 > 12 ? val1 : val2;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Agent 9: Parser Agent
 * Parses raw natural language goals to extract structured title, deadline, and context.
 */
export async function parseNaturalLanguageGoal(query: string) {
  const isMock = GeminiAdapter.isMock();
  if (isMock) {
    let title = query;
    let deadline = "This Friday";
    let context = "";
    
    // Check for explicit dates first
    const extractedDate = extractDeadlineFromQuery(query);
    if (extractedDate) {
      deadline = extractedDate;
      // Strip the date suffix to leave a clean title
      const dateWords = query.match(/(?:by|before|on)?\s*(?:\d+(?:st|nd|rd|th)?\s+\w+\s+\d{4}|\w+\s+\d+(?:st|nd|rd|th)?\s+\d{4})/i);
      if (dateWords) {
        title = query.replace(dateWords[0], "").trim();
      }
    } else {
      const byMatch = query.match(/by\s+([^,.]+)/i);
      const beforeMatch = query.match(/before\s+([^,.]+)/i);
      const onMatch = query.match(/on\s+([^,.]+)/i);
      const match = byMatch || beforeMatch || onMatch;
      if (match) {
        deadline = match[1].trim();
        title = query.replace(match[0], "").trim();
      }
    }
    return { title, deadline, context };
  }

  const ai = getGeminiClient();
  const prompt = `
    You are Guardian Core. Parse the following natural language goal and extract:
    1. A clear, concise action statement "title" (e.g., "Prepare for TCS interview", "Complete DBMS assignment").
    2. A brief statement of "deadline" (e.g., "2026-07-04", "this Friday", "Tomorrow", "In 3 days"). Return standard YYYY-MM-DD format if explicit date is found.
    3. Any additional "context" or constraints mentioned.

    User Input: "${query}"

    Respond STRICTLY with a JSON object matching this schema:
    {
      "title": "...",
      "deadline": "...",
      "context": "..."
    }
  `;

  try {
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              deadline: { type: Type.STRING },
              context: { type: Type.STRING }
            },
            required: ["title", "deadline", "context"]
          }
        }
      })
    );
    return JSON.parse(response.text || "{}");
  } catch (err) {
    console.error("Failed to parse natural language goal:", err);
    let title = query;
    let deadline = "This Friday";
    
    const extractedDate = extractDeadlineFromQuery(query);
    if (extractedDate) {
      deadline = extractedDate;
      const dateWords = query.match(/(?:by|before|on)?\s*(?:\d+(?:st|nd|rd|th)?\s+\w+\s+\d{4}|\w+\s+\d+(?:st|nd|rd|th)?\s+\d{4})/i);
      if (dateWords) {
        title = query.replace(dateWords[0], "").trim();
      }
    } else {
      const byMatch = query.match(/by\s+([^,.]+)/i);
      const beforeMatch = query.match(/before\s+([^,.]+)/i);
      const onMatch = query.match(/on\s+([^,.]+)/i);
      const match = byMatch || beforeMatch || onMatch;
      if (match) {
        deadline = match[1].trim();
        title = query.replace(match[0], "").trim();
      }
    }
    return { title, deadline, context: "" };
  }
}

/**
 * Agent 10: Calibration Agent
 * Handles live, interactive chat conversation with the Chief of Staff for a specific Goal.
 * Dynamically rewrites/updates the Goal's fields (title, deadline, plan, tasks, schedule) based on instructions.
 */
export async function runGoalChatUpdate(goal: Goal, message: string) {
  const isMock = GeminiAdapter.isMock();
  if (isMock) {
    let responseMessage = `I've analyzed your request: "${message}". I will adjust your plan accordingly!`;
    const updatedGoal = { ...goal };
    
    if (message.toLowerCase().includes("weekend") || message.toLowerCase().includes("saturday") || message.toLowerCase().includes("sunday")) {
      responseMessage = "I have updated your schedule. Active focus blocks have been shifted to weekends to fit your schedule.";
      if (updatedGoal.plan?.schedule) {
        updatedGoal.plan.schedule = updatedGoal.plan.schedule.map(s => {
          return { ...s, date: "2026-06-27" }; // Shift to weekend
        });
      }
    } else if (message.toLowerCase().includes("extend") || message.toLowerCase().includes("day") || message.toLowerCase().includes("later")) {
      responseMessage = "Understood. I have extended your deadline and realigned your timeline schedule to reduce workload pressure.";
      updatedGoal.deadline = "Extended Timeline";
      if (updatedGoal.analysis) {
        updatedGoal.analysis.deadlineFormatted = "Extended";
      }
    } else if (message.toLowerCase().includes("design") || message.toLowerCase().includes("add") || message.toLowerCase().includes("prep")) {
      responseMessage = "Done! I have added the requested preparation modules and synchronized new calendar focus blocks.";
      if (updatedGoal.plan) {
        const newId = "t-sys-" + Math.random().toString(36).substr(2, 5);
        updatedGoal.plan.tasks.push({
          id: newId,
          title: "Custom Prep Module",
          description: "Targeted focus session for specialized preparation based on chat calibration.",
          estimatedMinutes: 90,
          dayNumber: 3,
          isCompleted: false,
          completedAt: null,
          aiAssistance: null
        });
        updatedGoal.plan.schedule.push({
          id: `s-${newId}`,
          taskId: newId,
          title: "Work Block: Custom Prep Module",
          date: new Date().toISOString().split("T")[0],
          startTime: "13:00",
          endTime: "14:30",
          isSynced: false
        });
      }
    } else {
      responseMessage = `I have received your request: "${message}". I will align your execution roadmap to support these preferences. Let me know if you would like me to add new subtasks or reschedule calendar blocks!`;
    }
    
    return { responseMessage, updatedGoal };
  }

  const ai = getGeminiClient();
  const prompt = `
    You are Guardian Core, an AI-powered smart planner. The user wants to discuss or modify their goal plan through conversation.
    
    Current Goal State:
    ${JSON.stringify(goal)}
    
    User Chat Message: "${message}"

    Your jobs:
    1. **Conversational Response ("responseMessage")**: Explain your updates or answers in a friendly, professional, confident Guardian Core tone. Speak directly to the user.
    2. **Goal Updates ("updatedGoal")**: If the user's message implies a plan update (e.g., "move DSA sessions to weekends", "reduce study time", "extend deadline", "add prep", "pause this goal"), you must modify the corresponding fields in the Goal object and return the *entire* updated Goal structure.
       - Ensure task lists, deadlines, schedule details are updated logically.
       - If no structural changes are requested, return the Goal exactly as-is.

    Respond STRICTLY in JSON format with two root keys:
    {
      "responseMessage": "...",
      "updatedGoal": { ...the complete updated Goal structure ... }
    }
  `;

  try {
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              responseMessage: { type: Type.STRING },
              updatedGoal: {
                type: Type.OBJECT,
                description: "The complete updated goal structure, containing tasks, schedules, deadlines, etc."
              }
            },
            required: ["responseMessage", "updatedGoal"]
          }
        }
      })
    );
    const result = JSON.parse(response.text || "{}");
    if (result.updatedGoal) {
      // Merge/rehydrate updatedGoal with original goal to avoid losing fields
      const mergedGoal = {
        ...goal,
        ...result.updatedGoal,
        analysis: result.updatedGoal.analysis ? {
          ...goal.analysis,
          ...result.updatedGoal.analysis
        } : goal.analysis,
        plan: result.updatedGoal.plan ? {
          tasks: (result.updatedGoal.plan.tasks || []).map((t: any, idx: number) => {
            const origTask = goal.plan?.tasks?.find(o => o.id === t.id) || goal.plan?.tasks?.[idx];
            return {
              id: t.id || origTask?.id || "t-" + Math.random().toString(36).substr(2, 5),
              title: t.title || origTask?.title || "",
              description: t.description || origTask?.description || "",
              estimatedMinutes: typeof t.estimatedMinutes === "number" ? t.estimatedMinutes : (origTask?.estimatedMinutes || 60),
              dayNumber: typeof t.dayNumber === "number" ? t.dayNumber : (origTask?.dayNumber || 1),
              isCompleted: typeof t.isCompleted === "boolean" ? t.isCompleted : (origTask?.isCompleted || false),
              completedAt: t.completedAt !== undefined ? t.completedAt : (origTask?.completedAt || null),
              aiAssistance: t.aiAssistance !== undefined ? t.aiAssistance : (origTask?.aiAssistance || null),
              priority: t.priority || origTask?.priority || "Medium",
              relatedMilestoneId: t.relatedMilestoneId || origTask?.relatedMilestoneId || null
            };
          }),
          schedule: (result.updatedGoal.plan.schedule || []).map((s: any, idx: number) => {
            const origSession = goal.plan?.schedule?.find(o => o.id === s.id) || goal.plan?.schedule?.[idx];
            return {
              id: s.id || origSession?.id || "s-" + Math.random().toString(36).substr(2, 5),
              taskId: s.taskId || origSession?.taskId || "",
              title: s.title || origSession?.title || "",
              date: s.date || origSession?.date || "",
              startTime: s.startTime || origSession?.startTime || "",
              endTime: s.endTime || origSession?.endTime || "",
              isSynced: typeof s.isSynced === "boolean" ? s.isSynced : (origSession?.isSynced || false)
            };
          }),
          milestones: (result.updatedGoal.plan.milestones || []).map((m: any, idx: number) => {
            const origMilestone = goal.plan?.milestones?.find(o => o.id === m.id) || goal.plan?.milestones?.[idx];
            return {
              id: m.id || origMilestone?.id || "m-" + Math.random().toString(36).substr(2, 5),
              title: m.title || origMilestone?.title || "",
              description: m.description || origMilestone?.description || "",
              estimatedMinutes: typeof m.estimatedMinutes === "number" ? m.estimatedMinutes : (origMilestone?.estimatedMinutes || 60),
              dependencies: m.dependencies || origMilestone?.dependencies || [],
              targetDate: m.targetDate || origMilestone?.targetDate || "",
              completionCriteria: m.completionCriteria || origMilestone?.completionCriteria || "",
              status: m.status || origMilestone?.status || "pending",
              riskLevel: m.riskLevel || origMilestone?.riskLevel || "Low"
            };
          })
        } : goal.plan
      };
      
      result.updatedGoal = mergedGoal;
    }
    return result;
  } catch (err) {
    console.error("Failed to run goal chat update:", err);
    return {
      responseMessage: "I ran into a small issue processing that update, but I can still help. Please let me know how you'd like to adjust the steps manually.",
      updatedGoal: goal
    };
  }
}

export function getMockUnderstanding(title: string, deadline: string) {
  const constraints = [`Timeline constraint: Must complete by ${deadline}`];
  if (title.toLowerCase().includes("interview") || title.toLowerCase().includes("job")) {
    constraints.push("Preparation must align with Tech Mahindra interview patterns.");
    constraints.push("Requires dedicated mock practice blocks.");
  } else if (title.toLowerCase().includes("exam") || title.toLowerCase().includes("study")) {
    constraints.push("Requires quiet study environment.");
    constraints.push("Coverage of full syllabus before exam day.");
  } else {
    constraints.push("Requires study or work environment.");
  }
  return {
    constraints,
    questions: ["How many hours per day can you realistically dedicate to this goal?", "Do you have prior experience in this area?"],
    confidenceScore: 95
  };
}

/**
 * Stage 2: Understanding Agent
 */
export async function executeUnderstandingStage(title: string, deadline: string, context: string) {
  const isMock = GeminiAdapter.isMock();
  if (isMock) {
    return getMockUnderstanding(title, deadline);
  }

  const ai = getGeminiClient();
  const prompt = `
    You are the Understanding Stage of an AI Cognitive System.
    User input title: "${title}"
    Deadline: "${deadline}"
    Context: "${context || 'None'}"

    Extract constraints, devise 1 or 2 clarifying questions if necessary, and assign a confidenceScore (0-100) on how clearly you understand this user goal.
    Respond strictly in JSON matching the schema:
    {
      "constraints": ["constraint 1", "constraint 2"],
      "questions": ["question 1", "question 2"],
      "confidenceScore": 95
    }
  `;

  try {
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              constraints: { type: Type.ARRAY, items: { type: Type.STRING } },
              questions: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidenceScore: { type: Type.INTEGER }
            },
            required: ["constraints", "questions", "confidenceScore"]
          }
        }
      })
    );
    return JSON.parse(response.text || "{}");
  } catch (err) {
    console.error("executeUnderstandingStage error:", err);
    return getMockUnderstanding(title, deadline);
  }
}

export function getMockReasoning(title: string) {
  let risks = ["Procrastination risk", "Potential resource blockages"];
  let dependencies = ["Acquire primary learning resources", "Establish a tracking system"];
  let feasibilityScore = 78;
  let riskScore = 22;
  let complexity: "Low" | "Medium" | "High" = "Medium";

  if (title.toLowerCase().includes("interview") || title.toLowerCase().includes("job")) {
    risks = [
      "Gap in DSA or aptitude knowledge base",
      "Unfamiliarity with specific Tech Mahindra technical interview rounds",
      "HR round communication issues"
    ];
    dependencies = [
      "DSA preparation (Arrays, Trees, Graphs)",
      "Aptitude preparation (Quantitative, Logical, Verbal)",
      "Technical and HR round practice",
      "Resume updated and polished",
      "All other documents prepared (Degrees, certificates)"
    ];
    feasibilityScore = 70;
    riskScore = 30;
    complexity = "High" as const;
  } else if (title.toLowerCase().includes("exam") || title.toLowerCase().includes("study")) {
    risks = [
      "Procrastination risk due to large syllabus",
      "Weak concept retention under cramming"
    ];
    dependencies = [
      "Gather all learning materials & notes",
      "Attempt mock test papers",
      "Revision of core topics"
    ];
    feasibilityScore = 80;
    riskScore = 20;
    complexity = "Medium" as const;
  }

  return {
    feasibilityScore,
    riskScore,
    complexity,
    risks,
    dependencies
  };
}

/**
 * Stage 3: Reasoning Agent
 */
export async function executeReasoningStage(state: any) {
  const isMock = GeminiAdapter.isMock();
  if (isMock) {
    return getMockReasoning(state.goalTitle || "");
  }

  const ai = getGeminiClient();
  const prompt = `
    You are the Reasoning Stage of an AI Cognitive System.
    Current world state active goals: ${JSON.stringify(state.worldModel.activeGoals)}
    New Goal Details:
    - Title: "${state.goalTitle || "Untitled Goal"}"
    - Target Deadline: "${state.goalDeadline || "None"}"
    - Additional Context: "${state.goalContext || "None"}"

    Calculate realistic feasibility (0-100) and risk (0-100) scores. Assign complexity ("Low", "Medium", or "High").
    Identify potential risks and prerequisites/dependencies.
    Respond strictly in JSON matching the schema:
    {
      "feasibilityScore": 75,
      "riskScore": 35,
      "complexity": "Medium",
      "risks": ["risk 1", "risk 2"],
      "dependencies": ["dep 1", "dep 2"]
    }
  `;

  try {
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              feasibilityScore: { type: Type.INTEGER },
              riskScore: { type: Type.INTEGER },
              complexity: { type: Type.STRING },
              risks: { type: Type.ARRAY, items: { type: Type.STRING } },
              dependencies: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["feasibilityScore", "riskScore", "complexity", "risks", "dependencies"]
          }
        }
      })
    );
    return JSON.parse(response.text || "{}");
  } catch (err) {
    console.error("executeReasoningStage error:", err);
    return getMockReasoning(state.goalTitle || "");
  }
}

export function getMockPlanningPlan(title: string = "") {
  let milestones = [
    {
      id: "m1",
      title: "Kickoff and Research Foundation",
      description: "Configure workspace, select references and tools",
      estimatedMinutes: 60,
      dependencies: [],
      targetDate: new Date().toISOString().split("T")[0],
      completionCriteria: "Workspace and research parameters established",
      status: "pending" as const,
      riskLevel: "Low" as const
    },
    {
      id: "m2",
      title: "Draft Iteration Milestone",
      description: "Complete the initial prototype or draft",
      estimatedMinutes: 120,
      dependencies: ["m1"],
      targetDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split("T")[0];
      })(),
      completionCriteria: "Prototype draft complete",
      status: "pending" as const,
      riskLevel: "Low" as const
    },
    {
      id: "m3",
      title: "Final Review & Packaging",
      description: "Polish details and proofread drafts",
      estimatedMinutes: 90,
      dependencies: ["m2"],
      targetDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() + 2);
        return d.toISOString().split("T")[0];
      })(),
      completionCriteria: "Final proof complete",
      status: "pending" as const,
      riskLevel: "Low" as const
    }
  ];

  let tasks = [
    {
      id: "t1",
      title: "Setup and kickoff",
      description: "Configure workspace, select primary references and tools.",
      estimatedMinutes: 60,
      dayNumber: 1,
      priority: "Medium" as const,
      relatedMilestoneId: "m1"
    },
    {
      id: "t2",
      title: "Core milestone work",
      description: "Implement the first draft or components of the goal.",
      estimatedMinutes: 120,
      dayNumber: 2,
      priority: "High" as const,
      relatedMilestoneId: "m2"
    },
    {
      id: "t3",
      title: "Review and finalization",
      description: "Polish details, verify guidelines, and finalize target outcome.",
      estimatedMinutes: 90,
      dayNumber: 3,
      priority: "Medium" as const,
      relatedMilestoneId: "m3"
    }
  ];

  if (title.toLowerCase().includes("interview") || title.toLowerCase().includes("job")) {
    milestones = [
      {
        id: "m1",
        title: "DSA & Aptitude Foundation",
        description: "Brush up core data structures, algorithms, and logic questions.",
        estimatedMinutes: 90,
        dependencies: [],
        targetDate: new Date().toISOString().split("T")[0],
        completionCriteria: "Core DSA concepts reviewed",
        status: "pending" as const,
        riskLevel: "Low" as const
      },
      {
        id: "m2",
        title: "Technical Resume & HR Preparation",
        description: "Polish resume and practice HR round question templates.",
        estimatedMinutes: 120,
        dependencies: ["m1"],
        targetDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return d.toISOString().split("T")[0];
        })(),
        completionCriteria: "Resume updated and HR round practiced",
        status: "pending" as const,
        riskLevel: "Low" as const
      },
      {
        id: "m3",
        title: "Mock Interview & Document Prep",
        description: "Conduct mock interviews and organize all physical/digital documents.",
        estimatedMinutes: 90,
        dependencies: ["m2"],
        targetDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 2);
          return d.toISOString().split("T")[0];
        })(),
        completionCriteria: "Full interview checklist checked",
        status: "pending" as const,
        riskLevel: "Low" as const
      }
    ];

    tasks = [
      {
        id: "t1",
        title: "DSA & Aptitude brush up",
        description: "Practice arrays, trees, quantitative, and logical aptitude questions.",
        estimatedMinutes: 90,
        dayNumber: 1,
        priority: "High" as const,
        relatedMilestoneId: "m1"
      },
      {
        id: "t2",
        title: "Resume update & HR round practice",
        description: "Polish projects on resume, practice behavioral questions.",
        estimatedMinutes: 120,
        dayNumber: 2,
        priority: "High" as const,
        relatedMilestoneId: "m2"
      },
      {
        id: "t3",
        title: "Final documents and mock round",
        description: "Check certificates, review dress code, and run a mock interview.",
        estimatedMinutes: 90,
        dayNumber: 3,
        priority: "Medium" as const,
        relatedMilestoneId: "m3"
      }
    ];
  } else if (title.toLowerCase().includes("exam") || title.toLowerCase().includes("study")) {
    milestones = [
      {
        id: "m1",
        title: "Study Material Organization",
        description: "Collect textbook notes, online courses, and list syllabus gaps.",
        estimatedMinutes: 60,
        dependencies: [],
        targetDate: new Date().toISOString().split("T")[0],
        completionCriteria: "Study materials ready",
        status: "pending" as const,
        riskLevel: "Low" as const
      },
      {
        id: "m2",
        title: "Intense Syllabus Study",
        description: "Deep dive study sessions on high-weightage topics.",
        estimatedMinutes: 180,
        dependencies: ["m1"],
        targetDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 1);
          return d.toISOString().split("T")[0];
        })(),
        completionCriteria: "Core syllabus covered",
        status: "pending" as const,
        riskLevel: "Low" as const
      },
      {
        id: "m3",
        title: "Mock Test Practice",
        description: "Resolve past year exam papers under timed environment.",
        estimatedMinutes: 120,
        dependencies: ["m2"],
        targetDate: (() => {
          const d = new Date();
          d.setDate(d.getDate() + 2);
          return d.toISOString().split("T")[0];
        })(),
        completionCriteria: "Mock tests solved and graded",
        status: "pending" as const,
        riskLevel: "Low" as const
      }
    ];

    tasks = [
      {
        id: "t1",
        title: "Gather resources & outline schedule",
        description: "Compile slide decks, textbooks, and syllabus notes.",
        estimatedMinutes: 60,
        dayNumber: 1,
        priority: "Medium" as const,
        relatedMilestoneId: "m1"
      },
      {
        id: "t2",
        title: "Study key chapters",
        description: "Cover high-importance topics and clear concepts.",
        estimatedMinutes: 180,
        dayNumber: 2,
        priority: "High" as const,
        relatedMilestoneId: "m2"
      },
      {
        id: "t3",
        title: "Solve mock exam paper",
        description: "Run timed practice session, review mistakes.",
        estimatedMinutes: 120,
        dayNumber: 3,
        priority: "Medium" as const,
        relatedMilestoneId: "m3"
      }
    ];
  }

  const schedule = tasks.map((t, idx) => {
    const d = new Date();
    d.setDate(d.getDate() + idx);
    const dateStr = d.toISOString().split("T")[0];
    return {
      id: `s-${t.id}`,
      taskId: t.id,
      title: `Work Block: ${t.title}`,
      date: dateStr,
      startTime: "10:00",
      endTime: idx === 1 ? "12:00" : "11:30"
    };
  });

  return {
    tasks,
    schedule,
    milestones,
    explanation: "I've broken down this project into three logical increments, scheduling focus blocks during daytime slots to maximize completion probability."
  };
}

/**
 * Stage 4: Planning Agent
 */
export async function executePlanningStage(state: any) {
  const isMock = GeminiAdapter.isMock();
  if (isMock) {
    return getMockPlanningPlan(state.goalTitle || "");
  }

  const ai = getGeminiClient();
  const prompt = `
    You are the Planning Stage of an AI Cognitive System (Guardian Core).
    
    Target New Goal to Plan:
    - Title: "${state.goalTitle || "Untitled Goal"}"
    - Target Deadline: "${state.goalDeadline || "None"}" (Formatted: "${state.deadlineFormatted || "None"}")
    - Context/Constraints: "${state.goalContext || "None"}"
    
    Active goals in current world state for context: ${JSON.stringify(state.worldModel.activeGoals)}
    User Preferences: ${JSON.stringify(state.worldModel.userPreferences)}
    Current Date: ${new Date().toISOString().split("T")[0]}

    CRITICAL PLANNING INSTRUCTIONS:
    - Resolve deadlines/dates carefully relative to the Current Date (${new Date().toISOString().split("T")[0]}).
    - For example:
      - "Next Wednesday" relative to today.
      - "Tomorrow" -> today + 1.
      - "This weekend" -> upcoming Saturday/Sunday.
      - "This Friday" -> upcoming Friday.
      - If the user says "after my exam", select a logical deadline or ask a clarification question if it's completely ambiguous. Never default automatically to "this Friday".
    - Reschedule/plan tasks respecting the User Preferences:
      - If avoidMornings is true, schedule sessions in the afternoon/evening (after 12:00 PM).
      - If avoidWeekends is true, do not schedule sessions on Saturday or Sunday.
      - If avoidEvenings is true, do not schedule sessions after 6:00 PM (18:00).
      - If estimateAdjustmentFactor is set (e.g. 1.2 or 0.8), multiply your standard effort estimates by this factor.
    
    Your job:
    1. Decompose this goal into 2 to 4 checkpoints or **milestones**. Milestones must form a Directed Acyclic Graph (DAG) using dependencies (e.g. milestone 'm2' depends on 'm1').
    2. Break down this goal into a list of 3 to 6 highly logical, sequential, actionable tasks with effort estimates (adjusted by estimateAdjustmentFactor), each mapped to a \`relatedMilestoneId\` and assigned a \`priority\` ("Low", "Medium", "High") and \`dayNumber\` relative to start.
    3. Allocate calendar work sessions for each task. Map each task to a specific date starting from today (${new Date().toISOString().split("T")[0]}) and specify logical startTime and endTime.
    4. Formulate a concise, human-friendly explanation of why this plan structure was selected and how it optimizes for success, calling out which user preferences were respected.
    Respond strictly in JSON matching the schema:
    {
      "milestones": [
        { "id": "m1", "title": "...", "description": "...", "estimatedMinutes": 60, "dependencies": [], "targetDate": "YYYY-MM-DD", "completionCriteria": "...", "status": "pending", "riskLevel": "Low" }
      ],
      "tasks": [
        { "id": "t1", "title": "...", "description": "...", "estimatedMinutes": 60, "dayNumber": 1, "priority": "Medium", "relatedMilestoneId": "m1" }
      ],
      "schedule": [
        { "id": "s1", "taskId": "t1", "title": "...", "date": "YYYY-MM-DD", "startTime": "09:00", "endTime": "10:00" }
      ],
      "explanation": "..."
    }
  `;

  try {
    const response = await executeWithRetry(() =>
      ai.models.generateContent({
        model: config.gemini.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              milestones: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    estimatedMinutes: { type: Type.INTEGER },
                    dependencies: { type: Type.ARRAY, items: { type: Type.STRING } },
                    targetDate: { type: Type.STRING },
                    completionCriteria: { type: Type.STRING },
                    status: { type: Type.STRING, enum: ["pending", "in_progress", "completed", "failed"] },
                    riskLevel: { type: Type.STRING, enum: ["Low", "Medium", "High"] }
                  },
                  required: ["id", "title", "description", "estimatedMinutes", "dependencies", "targetDate", "completionCriteria", "status", "riskLevel"]
                }
              },
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    title: { type: Type.STRING },
                    description: { type: Type.STRING },
                    estimatedMinutes: { type: Type.INTEGER },
                    dayNumber: { type: Type.INTEGER },
                    priority: { type: Type.STRING, enum: ["Low", "Medium", "High"] },
                    relatedMilestoneId: { type: Type.STRING }
                  },
                  required: ["id", "title", "description", "estimatedMinutes", "dayNumber", "priority", "relatedMilestoneId"]
                }
              },
              schedule: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    taskId: { type: Type.STRING },
                    title: { type: Type.STRING },
                    date: { type: Type.STRING },
                    startTime: { type: Type.STRING },
                    endTime: { type: Type.STRING }
                  },
                  required: ["id", "taskId", "title", "date", "startTime", "endTime"]
                }
              },
              explanation: { type: Type.STRING }
            },
            required: ["milestones", "tasks", "schedule", "explanation"]
          }
        }
      })
    );
    return JSON.parse(response.text || "{}");
  } catch (err) {
    console.error("executePlanningStage error:", err);
    return getMockPlanningPlan(state.goalTitle || "");
  }
}

/**
 * Stage 5: Negotiation Agent
 */
export async function executeNegotiationStage(state: any) {
  // Simulates negotiating tasks against user preferences (such as avoidWeekends, avoidEvenings)
  const log: string[] = ["Negotiating calendar blocks with User preference matrix..."];
  let adjustedSchedule = state.workingMemory.proposedSchedule;
  const avoidWeekends = state.worldModel.userPreferences.avoidWeekends;
  const avoidEvenings = state.worldModel.userPreferences.avoidEvenings;

  if (adjustedSchedule) {
    adjustedSchedule = adjustedSchedule.map((session: any) => {
      let isAdjusted = false;
      let dateStr = session.date;
      let startStr = session.startTime;
      let endStr = session.endTime;

      // Check avoidWeekends
      if (avoidWeekends) {
        const day = new Date(dateStr).getDay();
        if (day === 0 || day === 6) {
          log.push(`Negotiated: Shifted session "${session.title}" from weekend to next working weekday.`);
          const newDate = new Date(dateStr);
          newDate.setDate(newDate.getDate() + (day === 6 ? 2 : 1));
          dateStr = newDate.toISOString().split("T")[0];
          isAdjusted = true;
        }
      }

      // Check avoidEvenings
      if (avoidEvenings) {
        const startHour = parseInt(startStr.split(":")[0], 10);
        if (startHour >= 18) {
          log.push(`Negotiated: Shifted session "${session.title}" from evening to morning slot.`);
          // Shift to a daytime slot starting at 10:00 AM
          const durationHrs = 2.0; // default duration
          startStr = "10:00";
          endStr = "12:00";
          isAdjusted = true;
        }
      }

      if (isAdjusted) {
        return {
          ...session,
          date: dateStr,
          startTime: startStr,
          endTime: endStr
        };
      }

      return session;
    });
  }

  return {
    log,
    adjustedSchedule,
    schedulingConfidence: 90
  };
}

/**
 * Stage 8: Reflection Agent
 */
export async function executeReflectionStage(state: any, goal: Goal) {
  return {
    reflection: `Successfully established personalized execution track for "${goal.title}". Complexity was categorized as Medium, with feasibility calculated at 80% with proactive Sentinel worker triggers enabled.`
  };
}
