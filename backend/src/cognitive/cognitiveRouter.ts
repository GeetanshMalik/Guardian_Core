/**
 * Cognitive Router — The Central Intelligence Gateway
 * 
 * Routes user requests to either deterministic software engines or LLM-assisted reasoning
 * based on intent classification and complexity analysis.
 * 
 * Architecture:
 *   User Request → Intent Detection → AI Budget Computation → Route Decision
 *     → Budget 0: Deterministic Engine (templates + algorithms, 0 Gemini calls)
 *     → Budget 1: Single LLM call for milestone decomposition
 *     → Budget 2: Full cognitive pipeline (complex research goals)
 * 
 * This one module saves ~80-90% of Gemini API consumption by handling
 * simple scheduling, reminders, and routine goals entirely with software logic.
 */
import { Goal, Task, CalendarSession } from "../types.js";
import { evaluateContext, type ContextEvaluation } from "./contextEvaluator.js";
import { constructWorldModelSnapshot } from "./worldModel.js";
import crypto from "node:crypto";

// ─── AI Budget Computation ──────────────────────────────────────────────────

export type AIBudget = 0 | 1 | 2;

/**
 * Computes how many Gemini API calls this request warrants.
 * 
 * Budget 0: Pure software — scheduling, reminders, routine tasks
 * Budget 1: Single LLM call — planning goals that need milestone decomposition
 * Budget 2: Full pipeline — complex research, interview prep, report generation
 */
export function computeAIBudget(evaluation: ContextEvaluation): AIBudget {
  const { intent, researchRelevance, contextSufficiency } = evaluation;

  // Scheduling and reminders never need Gemini
  if (intent === "scheduling" || intent === "reminder") {
    return 0;
  }

  // If context is insufficient, we'll ask clarification — no AI needed
  if (evaluation.recommendedAction.action === "ask_clarification") {
    return 0;
  }

  // Templates (email/report without enough context) — no AI needed
  if (evaluation.recommendedAction.action === "provide_template") {
    return 0;
  }

  // Research-intensive or knowledge-intensive goals need full pipeline
  if (researchRelevance.shouldResearch && researchRelevance.category === "knowledge_intensive") {
    return 2;
  }

  // Planning intent with good context → single LLM call for decomposition
  if (intent === "planning" && contextSufficiency.isSufficient) {
    return 1;
  }

  // General assistance or ambiguous → single LLM call
  if (intent === "general_assistance" || intent === "research" || intent === "report") {
    return 1;
  }

  // Default: try deterministic first
  return 0;
}

// ─── Intelligent Milestone Template Cache ───────────────────────────────────

interface MilestoneTemplate {
  category: string;
  keywords: string[];
  milestones: Array<{
    titleTemplate: string;
    description: string;
    estimatedMinutes: number;
    riskLevel: "Low" | "Medium" | "High";
    completionCriteria: string;
  }>;
  tasks: Array<{
    titleTemplate: string;
    description: string;
    estimatedMinutes: number;
    dayNumber: number;
    priority: "Low" | "Medium" | "High";
    milestoneIndex: number; // maps to milestones array index
  }>;
}

const MILESTONE_CACHE: MilestoneTemplate[] = [
  {
    category: "interview_prep",
    keywords: ["interview", "job", "placement", "hiring", "recruit", "campus"],
    milestones: [
      {
        titleTemplate: "Foundation & Knowledge Review",
        description: "Review core concepts, DSA fundamentals, and aptitude preparation.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "Core concepts reviewed and practice problems attempted"
      },
      {
        titleTemplate: "Technical & Communication Practice",
        description: "Practice technical questions, mock interviews, and HR round preparation.",
        estimatedMinutes: 150,
        riskLevel: "Medium",
        completionCriteria: "At least 2 mock interview sessions completed"
      },
      {
        titleTemplate: "Final Preparation & Documents",
        description: "Resume polish, document organization, and confidence building.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "All documents ready and final mock session done"
      }
    ],
    tasks: [
      { titleTemplate: "DSA & Aptitude Review", description: "Practice arrays, trees, quantitative, and logical aptitude questions.", estimatedMinutes: 90, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Core Concepts Deep Dive", description: "Review key technical concepts relevant to the role.", estimatedMinutes: 60, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Mock Technical Interview", description: "Simulate a technical interview with practice problems.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "HR Round Preparation", description: "Practice common HR questions: strengths, weaknesses, behavioral scenarios.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Resume & Document Check", description: "Update resume, organize certificates, and prepare all required documents.", estimatedMinutes: 45, dayNumber: 3, priority: "Medium", milestoneIndex: 2 },
      { titleTemplate: "Final Review & Confidence Session", description: "Quick revision of weak areas and mental preparation.", estimatedMinutes: 45, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "exam_study",
    keywords: ["exam", "test", "study", "revision", "syllabus", "semester", "finals", "midterm"],
    milestones: [
      {
        titleTemplate: "Syllabus Mapping & Material Collection",
        description: "Identify all topics, gather notes, and create a study plan.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Complete topic list and study materials organized"
      },
      {
        titleTemplate: "Core Topic Revision",
        description: "Systematic revision of all major topics with practice problems.",
        estimatedMinutes: 180,
        riskLevel: "Medium",
        completionCriteria: "All major topics revised with notes"
      },
      {
        titleTemplate: "Mock Tests & Final Revision",
        description: "Attempt mock tests and revise weak areas.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "At least 1 mock test completed and weak areas noted"
      }
    ],
    tasks: [
      { titleTemplate: "Gather Study Materials", description: "Collect all notes, textbooks, and online resources.", estimatedMinutes: 45, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Create Topic Checklist", description: "Map out all syllabus topics and prioritize by weightage.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Revise Core Topics", description: "Focus on high-weightage topics first.", estimatedMinutes: 120, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Practice Problems", description: "Solve previous year questions and practice sets.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Mock Test Attempt", description: "Take a full-length practice test under timed conditions.", estimatedMinutes: 90, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Weak Area Revision", description: "Review mistakes from mock test and fill knowledge gaps.", estimatedMinutes: 45, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "report_writing",
    keywords: ["report", "essay", "paper", "thesis", "write up", "document", "assignment"],
    milestones: [
      {
        titleTemplate: "Research & Outline",
        description: "Gather references, define structure, and create detailed outline.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Outline completed with section headers and key points"
      },
      {
        titleTemplate: "First Draft",
        description: "Write the complete first draft following the outline.",
        estimatedMinutes: 180,
        riskLevel: "Medium",
        completionCriteria: "Full first draft completed covering all sections"
      },
      {
        titleTemplate: "Review & Final Submission",
        description: "Proofread, format, and prepare for submission.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Polished document ready for submission"
      }
    ],
    tasks: [
      { titleTemplate: "Research & References", description: "Gather all source materials and references needed.", estimatedMinutes: 60, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Create Outline", description: "Structure the document with clear section headers and key points.", estimatedMinutes: 45, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Write Body Sections", description: "Draft the main content sections of the document.", estimatedMinutes: 120, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Write Introduction & Conclusion", description: "Complete the opening and closing sections.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Proofread & Format", description: "Check grammar, formatting, citations, and overall quality.", estimatedMinutes: 60, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Final Review & Submit", description: "Final read-through and submission preparation.", estimatedMinutes: 30, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "project_development",
    keywords: ["project", "build", "develop", "code", "app", "website", "software", "prototype"],
    milestones: [
      {
        titleTemplate: "Setup & Architecture",
        description: "Project initialization, technology selection, and architecture design.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Project repository created and architecture documented"
      },
      {
        titleTemplate: "Core Implementation",
        description: "Build the primary features and core functionality.",
        estimatedMinutes: 240,
        riskLevel: "Medium",
        completionCriteria: "Core features implemented and functional"
      },
      {
        titleTemplate: "Testing & Deployment",
        description: "Test, debug, and prepare for deployment or presentation.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "All tests passing and deployment ready"
      }
    ],
    tasks: [
      { titleTemplate: "Project Setup", description: "Initialize repository, install dependencies, and configure environment.", estimatedMinutes: 45, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Design Architecture", description: "Plan the system architecture, data models, and API structure.", estimatedMinutes: 60, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Build Core Features", description: "Implement the primary functionality of the application.", estimatedMinutes: 180, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "UI/UX Implementation", description: "Build the user interface and user experience components.", estimatedMinutes: 90, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Testing & Bug Fixes", description: "Write tests, fix bugs, and ensure stability.", estimatedMinutes: 90, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Documentation & Deploy", description: "Write documentation and prepare for deployment.", estimatedMinutes: 45, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "hackathon_mvp",
    keywords: ["hackathon", "mvp", "demo", "pitch", "competition", "frontend battle"],
    milestones: [
      {
        titleTemplate: "Rapid MVP Scope & Mockups",
        description: "Define minimal scope, select stack, and sketch layouts.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Clear scope boundaries and wireframes complete"
      },
      {
        titleTemplate: "Functioning Core & UI Integration",
        description: "Code the core logic, style with modern visuals, and connect mock APIs.",
        estimatedMinutes: 240,
        riskLevel: "High",
        completionCriteria: "Fully functional core flow with rich design"
      },
      {
        titleTemplate: "Pitch Prep & Live Demo Check",
        description: "Record demo video, prepare slide deck, and test live deployment.",
        estimatedMinutes: 90,
        riskLevel: "Medium",
        completionCriteria: "Slides ready and live link tested"
      }
    ],
    tasks: [
      { titleTemplate: "Scope Definition & Stack Setup", description: "Select tech stack and set up boilerplate.", estimatedMinutes: 30, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Mockup & UI Architecture", description: "Design core layouts and color palettes.", estimatedMinutes: 45, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Develop Core Functionality", description: "Implement primary interactive features.", estimatedMinutes: 150, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Polishing & Micro-animations", description: "Apply Harmonious CSS gradients, hover effects, and typography.", estimatedMinutes: 90, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Deploy to Vercel/Netlify", description: "Run build script, check console errors, and deploy.", estimatedMinutes: 30, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Pitch Slide Deck & Video", description: "Create compelling presentation deck outlining the user problem.", estimatedMinutes: 60, dayNumber: 3, priority: "High", milestoneIndex: 2 }
    ]
  },
  {
    category: "marathon_prep",
    keywords: ["marathon", "running", "gym", "workout", "fitness", "training", "exercise"],
    milestones: [
      {
        titleTemplate: "Assessment & Schedule Formulation",
        description: "Establish baseline mileage, plan workout schedule, and set nutrition strategy.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Structured weekly training plan defined"
      },
      {
        titleTemplate: "Progressive Endurance Training",
        description: "Complete key training runs and strength building sessions.",
        estimatedMinutes: 180,
        riskLevel: "Medium",
        completionCriteria: "All target miles completed without injury"
      },
      {
        titleTemplate: "Taper & Preparation Check",
        description: "Reduce mileage, hydrate, check gear, and plan race logistics.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Race kit selected and gear checked"
      }
    ],
    tasks: [
      { titleTemplate: "Determine Running Schedule", description: "Select weekly long run days and cross-training blocks.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Set Nutritional Guidelines", description: "Draft meal plan prioritizing clean carbohydrates and protein.", estimatedMinutes: 30, dayNumber: 1, priority: "Low", milestoneIndex: 0 },
      { titleTemplate: "Interval & Tempo Training", description: "Run speed training sessions to build lung capacity.", estimatedMinutes: 60, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Long Steady Run", description: "Execute a progressive long distance endurance run.", estimatedMinutes: 120, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Taper Workout & Stretching", description: "Short run followed by active flexibility session.", estimatedMinutes: 45, dayNumber: 3, priority: "Medium", milestoneIndex: 2 },
      { titleTemplate: "Race Day Logistics & Gear Prep", description: "Lay out clothes, race bib, shoes, and schedule morning transit.", estimatedMinutes: 45, dayNumber: 3, priority: "High", milestoneIndex: 2 }
    ]
  },
  {
    category: "travel_planning",
    keywords: ["travel", "flight", "itinerary", "trip", "vacation", "hotel", "booking"],
    milestones: [
      {
        titleTemplate: "Destination Research & Bookings",
        description: "Compare flights, select accommodation, and confirm dates.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Tickets and hotel booking confirmations received"
      },
      {
        titleTemplate: "Detailed Itinerary Outline",
        description: "Plan daily activities, coordinate transit, and make restaurant reservations.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "Day-by-day itinerary completed"
      },
      {
        titleTemplate: "Packing & Travel Document Prep",
        description: "Gather passports, visas, print boarding passes, and pack bags.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "All luggage packed and documents verified"
      }
    ],
    tasks: [
      { titleTemplate: "Book Flights & Hotels", description: "Finalize travel dates and book accommodation/transport.", estimatedMinutes: 60, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Buy Travel Insurance", description: "Procure insurance policy for trip safety.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Map out Sightseeing Spots", description: "Create list of must-visit places and check opening hours.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Book Local Tickets & Guides", description: "Reserve entry tickets for popular museums or activities.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Prepare Packing Checklist", description: "Categorize clothing, electronics, toiletries, and medication.", estimatedMinutes: 30, dayNumber: 3, priority: "Low", milestoneIndex: 2 },
      { titleTemplate: "Final Document Check", description: "Ensure passport is valid, copy visas, and organize offline files.", estimatedMinutes: 30, dayNumber: 3, priority: "High", milestoneIndex: 2 }
    ]
  },
  {
    category: "job_application",
    keywords: ["resume", "cv", "job application", "cover letter", "portfolio", "applying"],
    milestones: [
      {
        titleTemplate: "Asset Polish",
        description: "Refactor resume, update LinkedIn profile, and compile portfolio links.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Resume PDF ready and portfolio updated"
      },
      {
        titleTemplate: "Target List & Custom Cover Letters",
        description: "List target jobs, draft tailorable cover letters, and request referrals.",
        estimatedMinutes: 120,
        riskLevel: "Medium",
        completionCriteria: "Applications tailored for top 3 positions"
      },
      {
        titleTemplate: "Submission & Tracking Setup",
        description: "Submit applications and set up tracking sheet.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "All applications sent and tracker populated"
      }
    ],
    tasks: [
      { titleTemplate: "Update Resume Work History", description: "Add recent achievements using metric-driven bullet points.", estimatedMinutes: 60, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Polish Portfolio Projects", description: "Ensure project links are live and code repos are readable.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Identify 5 Target Openings", description: "Search job boards and company portals.", estimatedMinutes: 45, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Draft Cover Letters", description: "Write tailored letters matching job description keywords.", estimatedMinutes: 75, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Submit Applications", description: "Fill portals and upload customized documents.", estimatedMinutes: 30, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Create Application Tracker", description: "Set up spreadsheet with role, company, salary, status, and dates.", estimatedMinutes: 30, dayNumber: 3, priority: "Low", milestoneIndex: 2 }
    ]
  },
  {
    category: "coding_assignment",
    keywords: ["homework", "lab", "coding task", "coding assignment", "programming exercise"],
    milestones: [
      {
        titleTemplate: "Requirements Analysis & Setup",
        description: "Understand problem statement, write initial test cases, and set up boilerplate.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Local workspace compiles and edge-cases documented"
      },
      {
        titleTemplate: "Logic Implementation",
        description: "Code the core logic, helper methods, and resolve primary test suites.",
        estimatedMinutes: 180,
        riskLevel: "Medium",
        completionCriteria: "All basic tests passing successfully"
      },
      {
        titleTemplate: "Refactoring & Submission",
        description: "Clean up code style, optimize time complexity, add comments, and zip package.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Polished submission bundle exported"
      }
    ],
    tasks: [
      { titleTemplate: "Read Assignment Guidelines", description: "Identify constraints, input formats, and submission rules.", estimatedMinutes: 30, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Setup Git & Project structure", description: "Initialize repository and create entry files.", estimatedMinutes: 30, dayNumber: 1, priority: "Low", milestoneIndex: 0 },
      { titleTemplate: "Implement Core Data Structures", description: "Define classes, interfaces, and primary algorithms.", estimatedMinutes: 120, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Debug & Resolve Failures", description: "Run test cases and inspect error stack traces.", estimatedMinutes: 60, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Format Code & Lint", description: "Verify code style conforms to specifications using linters.", estimatedMinutes: 30, dayNumber: 3, priority: "Medium", milestoneIndex: 2 },
      { titleTemplate: "Verify Submission File", description: "Generate the required archive/artifact and run test execution.", estimatedMinutes: 30, dayNumber: 3, priority: "High", milestoneIndex: 2 }
    ]
  },
  {
    category: "presentation_prep",
    keywords: ["slides", "powerpoint", "deck", "pitch deck", "keynote", "presentation"],
    milestones: [
      {
        titleTemplate: "Storyboarding & Outline",
        description: "Determine target audience, structure narrative, and block out slide titles.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Detailed slide outline and narrative flow approved"
      },
      {
        titleTemplate: "Design & Slide Content",
        description: "Create visual layout, write concise bullet points, and add diagrams.",
        estimatedMinutes: 150,
        riskLevel: "Medium",
        completionCriteria: "All draft slides populated with content"
      },
      {
        titleTemplate: "Practice & Refinement",
        description: "Rehearse presentation delivery, check timings, and polish visual elements.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Rehearsals completed within time limits"
      }
    ],
    tasks: [
      { titleTemplate: "Draft Presentation Outline", description: "Define main goal, key findings, and action items.", estimatedMinutes: 30, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Select Template & Colors", description: "Pick cohesive presentation theme matching the topic.", estimatedMinutes: 30, dayNumber: 1, priority: "Low", milestoneIndex: 0 },
      { titleTemplate: "Design Key Visuals", description: "Build charts, graphs, and simple icons representing metrics.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Draft Slide Copy", description: "Ensure slide text is minimal and impactful.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Practice Speech Flow", description: "Present slides aloud to identify awkward transitions.", estimatedMinutes: 60, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Fix Alignment & Fonts", description: "Ensure all elements align correctly and formatting is uniform.", estimatedMinutes: 30, dayNumber: 3, priority: "Low", milestoneIndex: 2 }
    ]
  },
  {
    category: "event_organizing",
    keywords: ["party", "wedding", "meetup", "event", "workshop", "gathering", "birthday"],
    milestones: [
      {
        titleTemplate: "Logistics & Venue Booking",
        description: "Determine date, guest count, reserve venue, and set budget.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Venue reserved and budget allocated"
      },
      {
        titleTemplate: "Invitations & Vendor Setup",
        description: "Send invites, hire catering/equipment, and plan event itinerary.",
        estimatedMinutes: 150,
        riskLevel: "Medium",
        completionCriteria: "Vendors locked in and RSVPs received"
      },
      {
        titleTemplate: "Final Prep & Day-of Schedule",
        description: "Confirm details with vendors, prepare materials, and build checklist.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Step-by-step master plan ready"
      }
    ],
    tasks: [
      { titleTemplate: "Formulate Event Budget", description: "Allocate expenses for food, decorations, tickets, and rentals.", estimatedMinutes: 45, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Select Venue", description: "Contact potential venues and inspect conditions.", estimatedMinutes: 45, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Send Invites & Collect RSVP", description: "Create digital invite and email to distribution list.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Coordinate Catering Menu", description: "Choose items matching guest diet preferences.", estimatedMinutes: 90, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Confirm Guest Checklist", description: "Track dietary requirements and travel arrivals.", estimatedMinutes: 45, dayNumber: 3, priority: "Low", milestoneIndex: 2 },
      { titleTemplate: "Draft Day-of Schedule", description: "Map out hourly milestones from setup to cleanup.", estimatedMinutes: 45, dayNumber: 3, priority: "High", milestoneIndex: 2 }
    ]
  },
  {
    category: "language_learning",
    keywords: ["language", "vocab", "speak", "translation", "spanish", "french", "german", "english"],
    milestones: [
      {
        titleTemplate: "Assessment & Resources Setup",
        description: "Identify current level, choose learning application, and define grammar targets.",
        estimatedMinutes: 45,
        riskLevel: "Low",
        completionCriteria: "Target curriculum and study plan organized"
      },
      {
        titleTemplate: "Structured Study & Vocabulary",
        description: "Complete modules, study flashcards, and write practice paragraphs.",
        estimatedMinutes: 180,
        riskLevel: "Low",
        completionCriteria: "At least 50 new vocabulary cards reviewed"
      },
      {
        titleTemplate: "Conversation Practice & Assessment",
        description: "Conduct conversation practice session and complete comprehension test.",
        estimatedMinutes: 90,
        riskLevel: "Medium",
        completionCriteria: "Practice session done and feedback logged"
      }
    ],
    tasks: [
      { titleTemplate: "Gather Learning Materials", description: "Install vocabulary apps and select target reading content.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Study Basic Grammar Rules", description: "Review sentence structures and tense formations.", estimatedMinutes: 60, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Build Vocabulary Deck", description: "Write flashcards for daily usage nouns and verbs.", estimatedMinutes: 60, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Practice Speaking Exercises", description: "Record voice pronunciations and compare with native speakers.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Listen to Language Podcasts", description: "Spend time active listening to increase vocabulary retention.", estimatedMinutes: 45, dayNumber: 3, priority: "Low", milestoneIndex: 2 },
      { titleTemplate: "Conduct Self-Test", description: "Complete a grammar review test and note down mistakes.", estimatedMinutes: 45, dayNumber: 3, priority: "High", milestoneIndex: 2 }
    ]
  },
  {
    category: "financial_audit",
    keywords: ["tax", "taxes", "audit", "budget", "finance", "filing", "accounting"],
    milestones: [
      {
        titleTemplate: "Document Gathering & Organization",
        description: "Collect salary slips, bank statements, investment proofs, and expense invoices.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "All required tax documents collected in one folder"
      },
      {
        titleTemplate: "Filing Preparation & Calculations",
        description: "Calculate gross income, deduce tax liabilities, and identify deductions.",
        estimatedMinutes: 120,
        riskLevel: "Medium",
        completionCriteria: "Final calculation spreadsheet complete and verified"
      },
      {
        titleTemplate: "Tax Submission & Confirmation",
        description: "Fill portals, double check figures, submit tax returns, and archive confirmation.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Tax return successfully filed and receipt downloaded"
      }
    ],
    tasks: [
      { titleTemplate: "Collect Income Statements", description: "Download tax statements, payslips, and interest certificates.", estimatedMinutes: 45, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Compile Deductible Expenses", description: "Organize medical bills, donation receipts, and business expenses.", estimatedMinutes: 45, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Compute Total Deductions", description: "Sum up eligible tax-saving investments and exemptions.", estimatedMinutes: 60, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Perform Preliminary Calculation", description: "Use tax calculator to cross-check computed liability.", estimatedMinutes: 60, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Fill Tax Filing Forms", description: "Log in to the government portal and fill form entries.", estimatedMinutes: 45, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Archive Tax Package", description: "Save PDF copy of filed return and confirmation receipt.", estimatedMinutes: 15, dayNumber: 3, priority: "Low", milestoneIndex: 2 }
    ]
  },
  {
    category: "blog_publishing",
    keywords: ["blog", "article", "newsletter", "publish", "medium", "substack", "writing"],
    milestones: [
      {
        titleTemplate: "Drafting & Headline Selection",
        description: "Define topic key points, write the body draft, and create headlines.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Complete outline and raw text draft generated"
      },
      {
        titleTemplate: "Editing & Visual Placement",
        description: "Review tone, place images, format headings, and add relevant code snippets.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "Finished article ready for proofreading"
      },
      {
        titleTemplate: "Publishing & Promotion Campaign",
        description: "Publish post, schedule newsletter updates, and post to social networks.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Post live and distribution channels scheduled"
      }
    ],
    tasks: [
      { titleTemplate: "Research Article Topic", description: "Read background resources and outline key points.", estimatedMinutes: 45, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Draft Blog Body", description: "Write the body content without worrying about grammar yet.", estimatedMinutes: 45, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Edit and Refine Text", description: "Correct flow, grammatical issues, and sentence clarity.", estimatedMinutes: 60, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Insert Assets & Images", description: "Locate public domain images or generate graphics.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Publish Article Live", description: "Configure URL, SEO tags, categories, and press publish.", estimatedMinutes: 30, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Social Media Distribution", description: "Write announcement posts for LinkedIn, Twitter, or Discord.", estimatedMinutes: 30, dayNumber: 3, priority: "Low", milestoneIndex: 2 }
    ]
  },
  {
    category: "relocation",
    keywords: ["move", "apartment", "packing", "rent", "lease", "relocation"],
    milestones: [
      {
        titleTemplate: "Inventory Assessment & Sorting",
        description: "List all items, categorize into pack/donate/discard, and buy packing materials.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Sorted inventory sheet and packing boxes acquired"
      },
      {
        titleTemplate: "Systematic Room Packing",
        description: "Pack non-essential items first, label boxes, and secure fragile items.",
        estimatedMinutes: 240,
        riskLevel: "Medium",
        completionCriteria: "All items boxed and categorized with labels"
      },
      {
        titleTemplate: "Moving Logistics & Setup",
        description: "Book moving truck, update addresses, clean up rooms, and unpack essentials.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "Final moving inspection completed successfully"
      }
    ],
    tasks: [
      { titleTemplate: "Audit Household Belongings", description: "Create list of furniture, clothes, and documents to pack.", estimatedMinutes: 45, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Buy Moving Boxes & Tape", description: "Purchase sturdy boxes, bubble wrap, markers, and tape.", estimatedMinutes: 45, dayNumber: 1, priority: "Low", milestoneIndex: 0 },
      { titleTemplate: "Pack Non-Essential Rooms", description: "Box up library books, extra kitchenware, and seasonal clothes.", estimatedMinutes: 120, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Label Boxes Clearly", description: "Write room name and priority number on every box.", estimatedMinutes: 120, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Hire Moving Company", description: "Finalize quote and booking time with logistics vendor.", estimatedMinutes: 60, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Update Billing Addresses", description: "Notify bank, employer, and subscriptions of change.", estimatedMinutes: 60, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "literature_review",
    keywords: ["read", "book", "literature", "paper review", "novel", "academic"],
    milestones: [
      {
        titleTemplate: "Sources Selection & Outline",
        description: "Search research databases, download articles, and map bibliography targets.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Target citation list established and organized"
      },
      {
        titleTemplate: "Analytical Reading & Summarizing",
        description: "Extract key methodologies, research gaps, and findings from papers.",
        estimatedMinutes: 180,
        riskLevel: "Medium",
        completionCriteria: "Analysis grid showing comparisons completed"
      },
      {
        titleTemplate: "Writing Literature Summary",
        description: "Synthesize findings into cohesive review document and format references.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "Academic summary draft fully compiled"
      }
    ],
    tasks: [
      { titleTemplate: "Conduct Keyword Database Search", description: "Find academic articles on Google Scholar or ResearchGate.", estimatedMinutes: 30, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Organize Citation Library", description: "Import PDFs into reference managers like Zotero.", estimatedMinutes: 30, dayNumber: 1, priority: "Low", milestoneIndex: 0 },
      { titleTemplate: "Read Core Methodologies", description: "Analyze experimental setups and data outputs.", estimatedMinutes: 120, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Document Key Insights", description: "Write summary paragraphs mapping common theories.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Draft Synthesis Document", description: "Write introduction, thematic sections, and future paths.", estimatedMinutes: 90, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Compile Reference List", description: "Generate bibliography list matching formatting standard (APA/IEEE).", estimatedMinutes: 30, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "certification_course",
    keywords: ["course", "certification", "udemy", "coursera", "online class", "lecture"],
    milestones: [
      {
        titleTemplate: "Curriculum Intake & Plan",
        description: "Map course modules, locate coding sandboxes, and schedule study blocks.",
        estimatedMinutes: 45,
        riskLevel: "Low",
        completionCriteria: "Course syllabus mapped to training calendar"
      },
      {
        titleTemplate: "Lecture Consumption & Coding",
        description: "Watch video tutorials, build practical projects, and answer quizzes.",
        estimatedMinutes: 240,
        riskLevel: "Medium",
        completionCriteria: "At least 80% lectures completed with project code"
      },
      {
        titleTemplate: "Mock Exam & Final Certification",
        description: "Solve practice certification tests, take final exam, and verify diploma.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "Official certificate received and logged"
      }
    ],
    tasks: [
      { titleTemplate: "Setup Study Workspace", description: "Prepare notes application and code editor extensions.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Register for Exam Portal", description: "Create accounts on official certification portals.", estimatedMinutes: 15, dayNumber: 1, priority: "Low", milestoneIndex: 0 },
      { titleTemplate: "Watch Technical Lectures", description: "Complete primary video learning modules.", estimatedMinutes: 120, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Build Module Lab Projects", description: "Write test code mapping topics from lectures.", estimatedMinutes: 120, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Take Prep Quizzes", description: "Run mock exams to check topic weaknesses.", estimatedMinutes: 60, dayNumber: 3, priority: "Medium", milestoneIndex: 2 },
      { titleTemplate: "Submit Final Exam", description: "Complete official timed exam and claim certificate.", estimatedMinutes: 60, dayNumber: 3, priority: "High", milestoneIndex: 2 }
    ]
  },
  {
    category: "video_creation",
    keywords: ["video", "edit", "youtube", "recording", "script", "film"],
    milestones: [
      {
        titleTemplate: "Pre-Production & Scripting",
        description: "Outline video structure, write voiceover script, and organize visual assets.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Final video script and scene roadmap completed"
      },
      {
        titleTemplate: "Recording & Voiceover",
        description: "Record audio narration and capture clean screen/camera footage.",
        estimatedMinutes: 150,
        riskLevel: "Medium",
        completionCriteria: "All raw video and audio files exported"
      },
      {
        titleTemplate: "Editing, Polishing & Upload",
        description: "Cut video, sync audio, add title slides, export final cut, and publish.",
        estimatedMinutes: 180,
        riskLevel: "High",
        completionCriteria: "Polished video published online with descriptions"
      }
    ],
    tasks: [
      { titleTemplate: "Research Video Concept", description: "Map out user problem and identify target search terms.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Write Script Outline", description: "Draft the hook, introduction, primary concepts, and call-to-action.", estimatedMinutes: 60, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Record Narration Audio", description: "Capture voice narration in a quiet environment.", estimatedMinutes: 60, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Capture B-Roll Footage", description: "Record code walkthrough screen captures or face clips.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Edit Draft Timeline", description: "Compile clips, sync voice tracks, and cut pauses.", estimatedMinutes: 120, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Add Titles & Sound Effects", description: "Polish visual graphics, typography overlay, and background track.", estimatedMinutes: 60, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "product_launch",
    keywords: ["marketing", "launch", "campaign", "release", "promo", "advertising"],
    milestones: [
      {
        titleTemplate: "Goal Definition & Launch Deck",
        description: "Establish success metrics, design marketing assets, and draft press releases.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Marketing strategy document and launch deck finalized"
      },
      {
        titleTemplate: "Content Preparation & Scheduling",
        description: "Draft announcement newsletters, prepare product posts, and schedule promo dates.",
        estimatedMinutes: 150,
        riskLevel: "Medium",
        completionCriteria: "All marketing assets loaded into scheduling calendars"
      },
      {
        titleTemplate: "Go-Live Execution",
        description: "Submit product postings, publish blog articles, and monitor tracking.",
        estimatedMinutes: 90,
        riskLevel: "High",
        completionCriteria: "Product launch completed and analytics tracker active"
      }
    ],
    tasks: [
      { titleTemplate: "Define Target Personas", description: "Establish who the product serves and core value propositions.", estimatedMinutes: 45, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Design Graphic Banners", description: "Build screenshots and landing banners.", estimatedMinutes: 45, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Draft Product Hunt Post", description: "Write catchy tagline, detailed description, and maker's comment.", estimatedMinutes: 60, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Compose Email Announcement", description: "Write copy outlining key launch updates.", estimatedMinutes: 90, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Publish Product Live", description: "Deploy official releases on designated portals.", estimatedMinutes: 45, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Engage Launch Communities", description: "Answer user queries and collect early feedback.", estimatedMinutes: 45, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "scientific_experiment",
    keywords: ["lab", "experiment", "chemistry", "physics", "biology", "scientific", "data sheet"],
    milestones: [
      {
        titleTemplate: "Hypothesis & Experimental Design",
        description: "Establish thesis question, identify control variables, and prepare equipment list.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Detailed experimental protocol drafted"
      },
      {
        titleTemplate: "Procedure Execution & Data Collection",
        description: "Execute scientific steps, repeat trials, and document parameters.",
        estimatedMinutes: 180,
        riskLevel: "High",
        completionCriteria: "All trials completed and data grids filled"
      },
      {
        titleTemplate: "Lab Report & Conclusion",
        description: "Perform data calculations, plot results, and outline scientific findings.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "Finished scientific report compiled with graphs"
      }
    ],
    tasks: [
      { titleTemplate: "Research Laboratory Safety", description: "Review chemical datasheets and equipment hazards.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Gather Lab Materials", description: "Assemble sensors, measuring tools, and reagents.", estimatedMinutes: 30, dayNumber: 1, priority: "Low", milestoneIndex: 0 },
      { titleTemplate: "Conduct Calibration Trial", description: "Verify sensor parameters work under test bounds.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Execute Main Experiments", description: "Perform trials and capture measurements.", estimatedMinutes: 120, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Compute Statistical Analytics", description: "Calculate averages, error margins, and fit parameters.", estimatedMinutes: 60, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Draw Scientific Diagrams", description: "Plot data points using visualization tools.", estimatedMinutes: 60, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "hardware_prototype",
    keywords: ["hardware", "iot", "arduino", "raspberry", "soldering", "schematic"],
    milestones: [
      {
        titleTemplate: "Circuit Schematic & Bill of Materials",
        description: "Design connections, list components, and buy physical hardware parts.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Schematic complete and hardware parts ordered"
      },
      {
        titleTemplate: "Physical Assembly & Soldering",
        description: "Mount parts on breadboard, solder connections, and verify power lines.",
        estimatedMinutes: 180,
        riskLevel: "High",
        completionCriteria: "Hardware assembled without short circuits"
      },
      {
        titleTemplate: "Firmware Coding & Debugging",
        description: "Write peripheral test scripts, load code to device, and test functionality.",
        estimatedMinutes: 150,
        riskLevel: "Medium",
        completionCriteria: "Prototype successfully responds to input commands"
      }
    ],
    tasks: [
      { titleTemplate: "Draw Hardware Schematic", description: "Map pins, power buses, and resistors.", estimatedMinutes: 45, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Source Hardware Components", description: "Compare vendors and purchase microcontroller boards.", estimatedMinutes: 45, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Breadboard Component Layout", description: "Place sensors and run temporary jumper wires.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Solder Permanent Board", description: "Transfer prototype circuits onto PCB proto boards.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Write Peripheral Drivers", description: "Configure GPIO pins and initial serial communication.", estimatedMinutes: 90, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Test Full Integration Flow", description: "Ensure board sensors send telemetry correctly to host console.", estimatedMinutes: 60, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "startup_pitch",
    keywords: ["startup", "business plan", "founder", "equity", "fundraising", "investor"],
    milestones: [
      {
        titleTemplate: "Value Prop & Financial Model",
        description: "Document market size, define pricing, and project revenue milestones.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "Financial spreadsheet with assumptions finalized"
      },
      {
        titleTemplate: "Investor Slide Deck Design",
        description: "Draft 10-slide startup deck outlining team, problem, solution, traction, and ask.",
        estimatedMinutes: 180,
        riskLevel: "Medium",
        completionCriteria: "Visual investor slide deck ready"
      },
      {
        titleTemplate: "Founder Pitch Practice",
        description: "Rehearse presentation, build FAQ sheet for Q&A, and finalize investor outreach email.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "FAQ document ready and pitch timed"
      }
    ],
    tasks: [
      { titleTemplate: "Research Competitor Landscape", description: "Identify direct and indirect competitors.", estimatedMinutes: 60, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Build Revenue Projections", description: "Calculate CAC, LTV, and three-year financial forecast.", estimatedMinutes: 60, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Draft Deck Content", description: "Write clean, copy-edited titles for each slide.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Refine Slide Layouts", description: "Ensure slides present data cleanly using charts.", estimatedMinutes: 90, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Conduct Mock Pitch", description: "Present the deck to colleagues for active feedback.", estimatedMinutes: 60, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Write Investor Email Template", description: "Draft short outreach letter outlining startup metrics.", estimatedMinutes: 30, dayNumber: 3, priority: "Low", milestoneIndex: 2 }
    ]
  },
  {
    category: "home_renovation",
    keywords: ["renovation", "paint", "declutter", "cleaning", "repair", "furniture"],
    milestones: [
      {
        titleTemplate: "Design Concept & Procurement",
        description: "Map room design, measure spaces, and buy materials/supplies.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Concept approved and all materials delivered"
      },
      {
        titleTemplate: "Room Prep & Demolition",
        description: "Move furniture out, cover floors, patch holes, and sand walls.",
        estimatedMinutes: 150,
        riskLevel: "Medium",
        completionCriteria: "Room fully prepped for painting/installation"
      },
      {
        titleTemplate: "Execution & Furniture Setup",
        description: "Apply paint coats, install fixtures, and organize furniture layout.",
        estimatedMinutes: 240,
        riskLevel: "High",
        completionCriteria: "Renovation completed and room cleaned"
      }
    ],
    tasks: [
      { titleTemplate: "Measure Space & Draw Layout", description: "Take dimensions of wall heights and floor areas.", estimatedMinutes: 45, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Select Paint & Buy Tools", description: "Pick paint color and buy rollers, tape, and brushes.", estimatedMinutes: 45, dayNumber: 1, priority: "Low", milestoneIndex: 0 },
      { titleTemplate: "Empty Renovated Area", description: "Move furniture and boxes into temporary storage.", estimatedMinutes: 60, dayNumber: 2, priority: "Medium", milestoneIndex: 1 },
      { titleTemplate: "Sand and Tape Walls", description: "Smooth down wall textures and tape trim board outlines.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Apply Paint Coats", description: "Roll paint coats on walls and wait for dry times.", estimatedMinutes: 180, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Install Fixtures & Reorganize", description: "Rehang wall frames, position couches, and remove tape.", estimatedMinutes: 60, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  },
  {
    category: "meal_prep",
    keywords: ["meal prep", "cooking", "recipes", "healthy", "grocery list", "diet"],
    milestones: [
      {
        titleTemplate: "Recipe Selection & Grocery Shopping",
        description: "Plan healthy recipes, compile grocery ingredients, and purchase supplies.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "All recipe ingredients purchased and organized"
      },
      {
        titleTemplate: "Food Prep & Ingredient Chopping",
        description: "Wash vegetables, chop ingredients, and marinate proteins.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "All ingredients prepped and ready for cooking"
      },
      {
        titleTemplate: "Batch Cooking & Portioning",
        description: "Cook meals, allow to cool, and divide into glass meal containers.",
        estimatedMinutes: 120,
        riskLevel: "Medium",
        completionCriteria: "All meals portioned and stored in refrigerator"
      }
    ],
    tasks: [
      { titleTemplate: "Select Weekly Recipes", description: "Choose 3-4 simple meals matching target calories.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Write Organized Grocery List", description: "Categorize list by section (produce, dairy, pantry).", estimatedMinutes: 30, dayNumber: 1, priority: "Low", milestoneIndex: 0 },
      { titleTemplate: "Wash and Dice Produce", description: "Prep vegetables for steaming, roasting, or salads.", estimatedMinutes: 45, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Marinate Proteins", description: "Apply seasonings to chicken, tofu, or fish.", estimatedMinutes: 45, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Cook Batch Meals", description: "Roast vegetables, steam rice, and grill proteins simultaneously.", estimatedMinutes: 90, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Portion into Containers", description: "Label containers with meal type and date.", estimatedMinutes: 30, dayNumber: 3, priority: "Low", milestoneIndex: 2 }
    ]
  },
  {
    category: "devops_deployment",
    keywords: ["deploy", "devops", "aws", "docker", "kubernetes", "ci/cd", "server"],
    milestones: [
      {
        titleTemplate: "Environment Planning & Config",
        description: "Document cloud architecture, write docker configurations, and set secrets.",
        estimatedMinutes: 90,
        riskLevel: "Low",
        completionCriteria: "Dockerfiles and environment configs complete"
      },
      {
        titleTemplate: "Pipeline Build & Cloud Provisioning",
        description: "Write CI/CD workflow scripts and spin up cloud server containers.",
        estimatedMinutes: 180,
        riskLevel: "High",
        completionCriteria: "Build pipeline runs and server resources active"
      },
      {
        titleTemplate: "Production Deploy & Logging Check",
        description: "Deploy package to production domain, verify endpoints, and setup log monitors.",
        estimatedMinutes: 120,
        riskLevel: "Medium",
        completionCriteria: "App live on public URL and telemetry logs verifying health"
      }
    ],
    tasks: [
      { titleTemplate: "Write Docker Configuration", description: "Draft Dockerfile and docker-compose.yml configuration files.", estimatedMinutes: 45, dayNumber: 1, priority: "High", milestoneIndex: 0 },
      { titleTemplate: "Define Project Secret Keys", description: "Store secure API credentials in environment parameters.", estimatedMinutes: 45, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Write GitHub Actions Pipeline", description: "Draft build, lint, and deploy workflows.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Provision Cloud Infrastructure", description: "Create VM instances or serverless containers on AWS/GCP.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Trigger Production Deploy", description: "Merge release branch to main and verify CI/CD execution.", estimatedMinutes: 60, dayNumber: 3, priority: "High", milestoneIndex: 2 },
      { titleTemplate: "Setup Health Alerts", description: "Register monitoring services to alert on server issues.", estimatedMinutes: 60, dayNumber: 3, priority: "Low", milestoneIndex: 2 }
    ]
  },
  {
    category: "generic",
    keywords: [], // Fallback — matches anything not caught by other categories
    milestones: [
      {
        titleTemplate: "Kickoff & Planning",
        description: "Define scope, gather resources, and establish milestones.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "Scope defined and resources identified"
      },
      {
        titleTemplate: "Core Execution",
        description: "Complete the primary work required for this goal.",
        estimatedMinutes: 120,
        riskLevel: "Low",
        completionCriteria: "Primary deliverables completed"
      },
      {
        titleTemplate: "Review & Finalization",
        description: "Review work quality and finalize deliverables.",
        estimatedMinutes: 60,
        riskLevel: "Low",
        completionCriteria: "All work reviewed and finalized"
      }
    ],
    tasks: [
      { titleTemplate: "Initial Setup", description: "Prepare workspace and gather all necessary materials.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Define Action Plan", description: "Break down the goal into concrete steps.", estimatedMinutes: 30, dayNumber: 1, priority: "Medium", milestoneIndex: 0 },
      { titleTemplate: "Execute Primary Work", description: "Complete the main deliverable for this goal.", estimatedMinutes: 90, dayNumber: 2, priority: "High", milestoneIndex: 1 },
      { titleTemplate: "Review & Polish", description: "Review completed work and make refinements.", estimatedMinutes: 45, dayNumber: 3, priority: "Medium", milestoneIndex: 2 },
      { titleTemplate: "Finalize & Close", description: "Final checks and mark goal as ready.", estimatedMinutes: 30, dayNumber: 3, priority: "Medium", milestoneIndex: 2 }
    ]
  }
];

// ─── Template Matcher ───────────────────────────────────────────────────────

function findBestTemplate(title: string, context: string): MilestoneTemplate {
  const combined = `${title} ${context}`.toLowerCase();
  
  // Search for the best-matching category by keyword overlap
  let bestMatch: MilestoneTemplate | null = null;
  let bestScore = 0;

  for (const template of MILESTONE_CACHE) {
    if (template.keywords.length === 0) continue; // skip generic fallback
    const matchCount = template.keywords.filter(kw => combined.includes(kw)).length;
    if (matchCount > bestScore) {
      bestScore = matchCount;
      bestMatch = template;
    }
  }

  // Fallback to generic template if no keywords matched
  return bestMatch || MILESTONE_CACHE[MILESTONE_CACHE.length - 1];
}

// ─── Deterministic Schedule Builder ─────────────────────────────────────────

interface SchedulePreferences {
  workHoursStart: string;
  workHoursEnd: string;
  preferredSessionMinutes: number;
  avoidMornings: boolean;
  avoidWeekends: boolean;
  avoidEvenings: boolean;
}

function buildDeterministicSchedule(
  tasks: Task[],
  deadline: string,
  preferences: SchedulePreferences
): CalendarSession[] {
  const schedule: CalendarSession[] = [];
  const startHour = parseInt(preferences.workHoursStart.split(":")[0], 10);
  const endHour = parseInt(preferences.workHoursEnd.split(":")[0], 10);

  for (const task of tasks) {
    const taskDate = new Date();
    taskDate.setDate(taskDate.getDate() + (task.dayNumber - 1));

    // Skip weekends if preference is set
    if (preferences.avoidWeekends) {
      while (taskDate.getDay() === 0 || taskDate.getDay() === 6) {
        taskDate.setDate(taskDate.getDate() + 1);
      }
    }

    // Determine start time based on preferences
    let sessionStart = startHour;
    if (preferences.avoidMornings && sessionStart < 12) {
      sessionStart = 12; // Push to afternoon
    }
    if (preferences.avoidEvenings && sessionStart >= 18) {
      sessionStart = 14; // Push to afternoon
    }

    // Calculate end time based on task duration
    const durationHours = Math.ceil(task.estimatedMinutes / 60);
    let sessionEnd = Math.min(sessionStart + durationHours, endHour);

    const dateStr = taskDate.toISOString().split("T")[0];
    const startTimeStr = `${String(sessionStart).padStart(2, "0")}:00`;
    const endTimeStr = `${String(sessionEnd).padStart(2, "0")}:00`;

    schedule.push({
      id: `s-${task.id}`,
      taskId: task.id,
      title: `Work Block: ${task.title}`,
      date: dateStr,
      startTime: startTimeStr,
      endTime: endTimeStr,
      isSynced: false,
    });
  }

  return schedule;
}

// ─── Deterministic Goal Builder ─────────────────────────────────────────────

export interface DeterministicGoalResult {
  goal: Goal;
  aiCallsUsed: 0;
  templateCategory: string;
}

/**
 * Builds a complete Goal with milestones, tasks, and calendar schedule
 * using ZERO Gemini API calls. Uses cached templates + algorithmic scheduling.
 */
export async function buildGoalDeterministically(
  title: string,
  deadline: string,
  context: string
): Promise<DeterministicGoalResult> {
  console.log(`[CognitiveRouter] Building goal deterministically (0 AI calls): "${title}"`);

  // 1. Find best matching template
  const template = findBestTemplate(title, context);
  console.log(`[CognitiveRouter] Matched template category: "${template.category}"`);

  // 2. Get user preferences from World Model
  const worldModel = await constructWorldModelSnapshot();
  const preferences: SchedulePreferences = {
    workHoursStart: worldModel.userPreferences.workHoursStart,
    workHoursEnd: worldModel.userPreferences.workHoursEnd,
    preferredSessionMinutes: worldModel.userPreferences.preferredSessionMinutes,
    avoidMornings: worldModel.userPreferences.avoidMornings,
    avoidWeekends: worldModel.userPreferences.avoidWeekends,
    avoidEvenings: worldModel.userPreferences.avoidEvenings || false,
  };

  // 3. Calculate the date range from today to deadline
  const deadlineDate = new Date(deadline);
  const today = new Date();
  const totalDays = Math.max(1, Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

  // 4. Build milestones from template
  const milestones = template.milestones.map((m, idx) => {
    const targetDate = new Date();
    // Spread milestones proportionally across the available time
    const dayOffset = Math.floor((idx / template.milestones.length) * totalDays);
    targetDate.setDate(targetDate.getDate() + Math.max(dayOffset, idx));
    
    return {
      id: `m${idx + 1}`,
      title: m.titleTemplate,
      description: m.description,
      estimatedMinutes: m.estimatedMinutes,
      dependencies: idx > 0 ? [`m${idx}`] : [],
      targetDate: targetDate.toISOString().split("T")[0],
      completionCriteria: m.completionCriteria,
      status: "pending" as const,
      riskLevel: m.riskLevel,
    };
  });

  // 5. Build tasks from template
  const tasks: Task[] = template.tasks.map((t, idx) => ({
    id: `t${idx + 1}`,
    title: t.titleTemplate,
    description: t.description,
    estimatedMinutes: t.estimatedMinutes,
    dayNumber: Math.min(t.dayNumber, totalDays),
    isCompleted: false,
    completedAt: null,
    aiAssistance: null,
    priority: t.priority,
    relatedMilestoneId: `m${t.milestoneIndex + 1}`,
  }));

  // 6. Build calendar schedule deterministically
  const schedule = buildDeterministicSchedule(tasks, deadline, preferences);

  // 7. Format deadline nicely
  const deadlineFormatted = deadlineDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // 8. Compute deterministic analysis
  const feasibilityScore = totalDays >= tasks.length ? 85 : Math.max(40, 85 - (tasks.length - totalDays) * 10);
  const riskScore = totalDays <= 1 ? 60 : totalDays <= 3 ? 35 : 15;

  // 9. Assemble the Goal
  const goal: Goal = {
    id: "g-" + crypto.randomUUID().slice(0, 9),
    title,
    deadline,
    context: context || "",
    createdAt: new Date().toISOString(),
    status: "active",
    analysis: {
      deadlineFormatted,
      constraints: [`${totalDays} days available until deadline`],
      feasibilityScore,
      riskScore,
      complexity: totalDays <= 2 ? "High" : totalDays <= 5 ? "Medium" : "Low",
      risks: riskScore > 40
        ? ["Tight timeline may require prioritization of critical tasks"]
        : ["No significant risks detected with current timeline"],
      dependencies: template.milestones.slice(0, 2).map(m => m.description),
      explanation: `Deterministic plan generated using "${template.category}" template with ${tasks.length} tasks across ${milestones.length} milestones. No AI calls were needed for this goal type.`,
    },
    clarification: {
      questions: [],
      answers: {},
    },
    plan: {
      tasks,
      schedule,
      milestones,
    },
  };

  console.log(`[CognitiveRouter] Deterministic goal built: ${tasks.length} tasks, ${milestones.length} milestones, ${schedule.length} calendar sessions. AI calls: 0`);

  return {
    goal,
    aiCallsUsed: 0,
    templateCategory: template.category,
  };
}

// ─── Deterministic Progress Evaluator ───────────────────────────────────────

/**
 * Evaluates goal progress using pure algorithms instead of calling Gemini.
 * Used for simple task completion tracking (checkbox toggles).
 */
export function evaluateProgressDeterministically(goal: Goal) {
  if (!goal.plan?.tasks) {
    return {
      currentRiskLevel: "Low" as const,
      procrastinationIndicator: 0,
      riskExplanations: ["No tasks to evaluate."],
      recoveryPlan: null,
    };
  }

  const totalTasks = goal.plan.tasks.length;
  const completedTasks = goal.plan.tasks.filter(t => t.isCompleted).length;
  const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

  // Calculate days until deadline
  const deadlineDate = new Date(goal.deadline);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const remainingTasks = totalTasks - completedTasks;

  // Calculate expected progress based on time elapsed
  const totalDays = Math.max(1, Math.ceil((deadlineDate.getTime() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24)));
  const daysElapsed = totalDays - daysLeft;
  const expectedProgress = totalDays > 0 ? Math.round((daysElapsed / totalDays) * 100) : 100;

  // Procrastination = how far behind expected progress
  const procrastinationIndicator = Math.max(0, expectedProgress - completionPercentage);

  // Risk assessment
  let currentRiskLevel: "Low" | "Medium" | "High" = "Low";
  const riskExplanations: string[] = [];

  if (daysLeft === 0 && remainingTasks > 0) {
    currentRiskLevel = "High";
    riskExplanations.push(`Deadline is today with ${remainingTasks} task(s) remaining.`);
  } else if (remainingTasks > daysLeft * 2) {
    currentRiskLevel = "High";
    riskExplanations.push(`${remainingTasks} tasks remaining with only ${daysLeft} day(s) left. Average workload exceeds sustainable pace.`);
  } else if (procrastinationIndicator > 30) {
    currentRiskLevel = "Medium";
    riskExplanations.push(`Progress is ${procrastinationIndicator}% behind expected pace.`);
  } else {
    riskExplanations.push(`On track: ${completionPercentage}% complete with ${daysLeft} day(s) remaining.`);
  }

  return {
    currentRiskLevel,
    procrastinationIndicator,
    riskExplanations,
    recoveryPlan: currentRiskLevel === "High" ? {
      summary: `High risk detected. Compress estimates for remaining ${remainingTasks} task(s) by 25%.`,
      actions: [
        "Enable Rescue Mode",
        "Compress task duration estimates to fit tight timeline",
      ],
      revisedTasks: goal.plan.tasks
        .filter(t => !t.isCompleted)
        .map(t => ({
          taskId: t.id,
          revisedEstimate: Math.round(t.estimatedMinutes * 0.75), // compress by 25%
          action: "Compressed duration",
        })),
    } : null,
  };
}
