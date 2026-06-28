import {
  getEpisodicMemories,
  saveEpisodicMemory,
  getSemanticMemories,
  getPreferenceMemories,
  getDecisionMemories,
  saveDecisionMemory,
  getReflectionMemories,
  saveReflectionMemory
} from "../db.js";
import {
  MemoryContext,
  EpisodicMemory,
  SemanticMemory,
  PreferenceMemory,
  DecisionMemory,
  ReflectionMemory
} from "../types.js";

/**
 * Calculates a basic keyword overlap score between query terms and text
 */
function getKeywordOverlap(text: string, query: string): number {
  const queryTerms = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );
  if (queryTerms.size === 0) return 0;
  
  const textWords = text.toLowerCase().split(/\W+/);
  let matches = 0;
  for (const word of textWords) {
    if (queryTerms.has(word)) {
      matches++;
    }
  }
  return matches;
}

/**
 * Builds the contextual memory slice for a specific goal execution flow.
 */
export async function retrieveMemoryContext(
  title: string,
  context: string
): Promise<MemoryContext> {
  console.log(`[Memory] Building memory context for goal: "${title}"`);
  const query = `${title} ${context}`;

  // 1. Get all preference memories (always relevant for planning/scheduling)
  const allPreferences = await getPreferenceMemories();

  // 2. Get semantic memories, prioritizing keyword overlap or falling back to recent ones
  const allSemantic = await getSemanticMemories();
  const sortedSemantic = allSemantic
    .map((m) => ({ ...m, score: getKeywordOverlap(m.fact, query) }))
    .sort((a, b) => b.score - a.score || b.lastUpdated.localeCompare(a.lastUpdated));
  const relevantSemantic = sortedSemantic.slice(0, 10).map(({ score, ...m }) => m);

  // 3. Get episodic memories
  const allEpisodic = await getEpisodicMemories();
  const sortedEpisodic = allEpisodic
    .map((e) => ({
      ...e,
      score: getKeywordOverlap(`${e.outcome} ${e.lessonsLearned.join(" ")}`, query),
    }))
    .sort((a, b) => b.score - a.score || b.timestamp.localeCompare(a.timestamp));
  const relevantEpisodic = sortedEpisodic.slice(0, 5).map(({ score, ...e }) => e);

  // 4. Get decision memories
  const allDecisions = await getDecisionMemories();
  const sortedDecisions = allDecisions
    .map((d) => ({
      ...d,
      score: getKeywordOverlap(`${d.context} ${d.selectedOutcome}`, query),
    }))
    .sort((a, b) => b.score - a.score || b.timestamp.localeCompare(a.timestamp));
  const relevantDecisions = sortedDecisions.slice(0, 5).map(({ score, ...d }) => d);

  // 5. Get reflection memories
  const allReflections = await getReflectionMemories();
  const sortedReflections = allReflections
    .map((r) => ({ ...r, score: getKeywordOverlap(r.insight, query) }))
    .sort((a, b) => b.score - a.score || b.timestamp.localeCompare(a.timestamp));
  const relevantReflections = sortedReflections.slice(0, 5).map(({ score, ...r }) => r);

  console.log(
    `[Memory] Context compiled: ${allPreferences.length} preferences, ${relevantSemantic.length} facts, ${relevantEpisodic.length} episodes.`
  );

  return {
    preferences: allPreferences,
    semanticFacts: relevantSemantic,
    recentEpisodes: relevantEpisodic,
    historicalDecisions: relevantDecisions,
    activeReflections: relevantReflections,
  };
}

/**
 * Creates and logs an Episodic Memory record.
 */
export async function logEpisodicMemory(
  participants: string[],
  outcome: string,
  relatedGoals: string[],
  lessonsLearned: string[]
): Promise<void> {
  const episode: EpisodicMemory = {
    id: "ep-" + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    participants,
    outcome,
    relatedGoals,
    lessonsLearned,
  };
  await saveEpisodicMemory(episode);
  console.log(`[Memory] Logged Episodic Memory: "${outcome}"`);
}

/**
 * Creates and logs a Decision Memory record.
 */
export async function logDecisionMemory(
  decisionId: string,
  context: string,
  alternativesConsidered: string[],
  selectedOutcome: string,
  supportingEvidence: string[],
  confidence: number
): Promise<void> {
  const decision: DecisionMemory = {
    id: "dec-" + Math.random().toString(36).substr(2, 9),
    decisionId,
    context,
    alternativesConsidered,
    selectedOutcome,
    supportingEvidence,
    confidence,
    userOverrideStatus: "none",
    timestamp: new Date().toISOString(),
  };
  await saveDecisionMemory(decision);
  console.log(`[Memory] Logged Decision Memory: "${selectedOutcome}" (Confidence: ${confidence}%)`);
}

/**
 * Creates and logs a Reflection Memory record.
 */
export async function logReflectionMemory(
  insight: string,
  sourceGoalId?: string,
  category: string = "plan_reflection"
): Promise<void> {
  const reflection: ReflectionMemory = {
    id: "ref-" + Math.random().toString(36).substr(2, 9),
    insight,
    sourceGoalId,
    timestamp: new Date().toISOString(),
    category,
  };
  await saveReflectionMemory(reflection);
  console.log(`[Memory] Logged Reflection Memory insight for Goal ${sourceGoalId}`);
}
