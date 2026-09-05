/**
 * GenOS Agent Memory Context Provider
 * Formats cognitive memories, failure pitfalls, and golden paths for runtime prompt injection.
 */

const vectorMemory = require('./vectorMemoryService');
const { getDatabase } = require('../db');

/**
 * Retrieves relevant experiences, pitfalls, and golden paths for a given task
 * @param {string} agentId
 * @param {string} task
 * @param {object} options
 * @returns {Promise<object>}
 */
async function retrieveAgentMemories(agentId = '', task = '', options = {}) {
  const searchRes = await vectorMemory.searchMemory(task, { limit: options.limit || 5 });
  const allScored = searchRes.allScoredExperiences || [];

  const experiences = allScored.filter(e => e.id !== 'signal_ignorance' && e.status !== 'FAILURE').slice(0, 4);
  const pitfalls = searchRes.pitfallsToAvoid || [];
  const goldenPaths = searchRes.topSuccessfulGoldenPaths || [];

  // Also query recent failures from genome_decisions if pitfalls are empty
  let additionalFailures = [];
  try {
    const db = await getDatabase();
    const rows = await db.all(
      "SELECT title, content FROM genome_decisions WHERE category = 'Failure' ORDER BY created_at DESC LIMIT 3"
    );
    additionalFailures = rows.map(r => ({ summary: `${r.title}: ${r.content}` }));
  } catch {}

  const combinedPitfalls = pitfalls.length > 0 ? pitfalls : additionalFailures;

  return {
    experiences,
    pitfalls: combinedPitfalls.slice(0, 3),
    goldenPaths: goldenPaths.slice(0, 2)
  };
}

/**
 * Formats the cognitive memory block to inject into the agent prompt
 * @param {string} agentId
 * @param {string} task
 * @param {object} options
 * @returns {Promise<string>}
 */
async function formatCognitiveMemoryPrompt(agentId = '', task = '', options = {}) {
  try {
    const { experiences, pitfalls, goldenPaths } = await retrieveAgentMemories(agentId, task, options);
    const sections = [];

    if (experiences.length > 0) {
      const expLines = experiences.map(e => {
        const title = e.title ? `[${e.title}] ` : '';
        const summary = (e.summary || e.content || '').slice(0, 250);
        const weight = e.weight !== undefined ? ` (force: ${Number(e.weight).toFixed(1)})` : '';
        return `  * ${title}${summary}${weight}`;
      });
      sections.push(`- Souvenirs & Leçons Apprises :\n${expLines.join('\n')}`);
    }

    if (pitfalls.length > 0) {
      const pitLines = pitfalls.map(p => {
        const desc = (p.summary || p.content || p.title || '').slice(0, 200);
        return `  * ⚠️ ${desc}`;
      });
      sections.push(`- Pièges & Échecs à Éviter Absolument (Anti-Trauma) :\n${pitLines.join('\n')}`);
    }

    if (goldenPaths.length > 0) {
      const gpLines = goldenPaths.map(g => {
        const summary = (g.summary || g.title || '').slice(0, 200);
        return `  * 🎯 ${summary}`;
      });
      sections.push(`- Golden Paths Connus :\n${gpLines.join('\n')}`);
    }

    if (sections.length === 0) return '';

    return `[MÉMOIRE COGNITIVE & EXPÉRIENCES PERTINENTES (GraphRAG)]\n` +
      `Tu disposes des souvenirs suivants issus d'expériences antérieures sur des problèmes analogues. Utilise-les pour guider tes choix :\n` +
      sections.join('\n\n') + '\n\n';
  } catch {
    return '';
  }
}

/**
 * Persists an experience summary to vector memory after mission execution
 * @param {string} agentId
 * @param {string} task
 * @param {string} summary
 * @returns {Promise<string|null>}
 */
async function compileExecutionMemory(agentId = 'agent', task = '', summary = '') {
  if (!summary) return null;
  try {
    const content = `Task: ${task}\nResult: ${summary.slice(0, 1000)}`;
    return await vectorMemory.storeMemory(agentId, content, null);
  } catch {
    return null;
  }
}

module.exports = {
  retrieveAgentMemories,
  formatCognitiveMemoryPrompt,
  compileExecutionMemory
};
