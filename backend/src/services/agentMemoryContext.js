/**
 * GenOS Agent Memory Context Provider
 * Formats cognitive memories, failure pitfalls, and golden paths for runtime prompt injection.
 */

const vectorMemory = require('./vectorMemoryService');
const { getDatabase } = require('../db');

function truncateWords(text = '', maxLen = 250) {
  const str = String(text || '').trim();
  if (str.length <= maxLen) return str;
  const cut = str.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.7 ? cut.slice(0, lastSpace) : cut) + '...';
}

/**
 * Retrieves relevant experiences, pitfalls, and golden paths for a given task
 * @param {string} agentId
 * @param {string} task
 * @param {object} options
 * @returns {Promise<object>}
 */
async function retrieveAgentMemories(agentId = '', task = '', options = {}) {
  const searchRes = await vectorMemory.searchMemory(task, { ...options, limit: options.limit || 5, ownerId: agentId });
  const allScored = searchRes.allScoredExperiences || [];

  const experiences = allScored.filter(e => e.id !== 'signal_ignorance' && e.status !== 'FAILURE').slice(0, 4);
  const pitfalls = searchRes.pitfallsToAvoid || [];
  const goldenPaths = searchRes.topSuccessfulGoldenPaths || [];

  // Also query recent failures from genome_decisions if pitfalls are empty
  let additionalFailures = [];
  try {
    const db = await getDatabase();
    const rows = await db.all(
      "SELECT title, content FROM genome_decisions WHERE category = 'Failure' AND created_by = ? ORDER BY created_at DESC LIMIT 3",
      agentId
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

function formatGoldenPath(g) {
  if (!g) return '';
  const title = g.title ? `[${g.title}] ` : '';
  const summary = g.summary || g.content || '';
  return `${title}${summary}`.trim();
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

    // Uptake synaptic vesicles from the synaptic cleft
    let vesicleEngrams = [];
    try {
      vesicleEngrams = await vectorMemory.uptakeVesicles(agentId);
    } catch {}

    let epistemicShield = null;

    if (vesicleEngrams.length > 0) {
      const regularVesicles = [];
      for (const v of vesicleEngrams) {
        if (v.content && v.content.includes('[SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD]')) {
          epistemicShield = v.content;
        } else if (v.content) {
          regularVesicles.push(`  * ⚡ ${truncateWords(v.content, 250)}`);
        }
      }
      if (regularVesicles.length > 0) {
        sections.push(`- Vésicules Synaptiques Reçues (Synaptic Cleft) :\n${regularVesicles.join('\n')}`);
      }
    }

    if (experiences.length > 0) {
      const expLines = experiences.map(e => {
        const title = e.title ? `[${e.title}] ` : '';
        const summary = truncateWords(e.summary || e.content || '', 250);
        const weight = e.weight !== undefined ? ` (force: ${Number(e.weight).toFixed(1)})` : '';
        return `  * ${title}${summary}${weight}`;
      });
      sections.push(`- Souvenirs & Leçons Apprises :\n${expLines.join('\n')}`);
    }

    if (pitfalls.length > 0) {
      const pitLines = pitfalls.map(p => {
        const desc = truncateWords(p.summary || p.content || p.title || '', 200);
        return `  * ⚠️ ${desc}`;
      });
      sections.push(`- Pièges & Échecs à Éviter Absolument (Anti-Trauma) :\n${pitLines.join('\n')}`);
    }

    if (goldenPaths.length > 0) {
      const gpLines = goldenPaths.map(g => `  * 🎯 ${formatGoldenPath(g)}`);
      sections.push(`- Golden Paths Connus :\n${gpLines.join('\n')}`);
    }

    if (sections.length === 0 && !epistemicShield) return '';

    let promptBlock = '';
    if (epistemicShield) {
      promptBlock += `${epistemicShield}\n\n`;
    }
    if (sections.length > 0) {
      promptBlock += `[MÉMOIRE COGNITIVE & EXPÉRIENCES PERTINENTES (GraphRAG)]\n` +
        `Tu disposes des souvenirs suivants issus d'expériences antérieures sur des problèmes analogues. Utilise-les pour guider tes choix :\n` +
        sections.join('\n\n') + '\n\n';
    }
    return promptBlock;
  } catch {
    return '';
  }
}

/**
 * Parses and formats a golden path into a clean step flow for the prompt
 * @param {object} g
 * @returns {string}
 */
function formatGoldenPath(g) {
  const title = g.title ? `[${g.title}]` : '';
  const rawData = g.content || g.summary || '';
  let steps = [];

  if (Array.isArray(g.turns)) {
    steps = g.turns;
  } else if (Array.isArray(g.goldenPathSteps)) {
    steps = g.goldenPathSteps;
  } else if (typeof rawData === 'string' && (rawData.trim().startsWith('[') || rawData.trim().startsWith('{'))) {
    try {
      const parsed = JSON.parse(rawData);
      if (Array.isArray(parsed)) {
        steps = parsed;
      } else if (parsed && Array.isArray(parsed.goldenPathSteps)) {
        steps = parsed.goldenPathSteps;
      } else if (parsed && Array.isArray(parsed.turns)) {
        steps = parsed.turns;
      }
    } catch {
      // not JSON, fallback below
    }
  }

  if (steps.length > 0) {
    const formattedSteps = steps.map((s, idx) => {
      const num = s.step || idx + 1;
      const action = s.action || s.type || s.classification || 'step';
      const detail = s.detail || s.thought || s.cmd || s.action || '';
      return `${num}. [${action}] ${detail}`.trim();
    }).slice(0, 6).join(' -> ');

    return `${title} ${formattedSteps}`.trim();
  }

  const fallbackText = (g.summary && !g.summary.startsWith('[') ? g.summary : g.title || g.summary || '').slice(0, 300);
  return `${title} ${fallbackText}`.trim();
}

/**
 * Persists an experience summary to vector memory after mission execution and deposits exosomes
 * @param {string} agentId
 * @param {string} task
 * @param {string} summary
 * @param {object} [options={}]
 * @returns {Promise<string|null>}
 */
async function compileExecutionMemory(agentId = 'agent', task = '', summary = '', options = {}) {
  if (!summary) return null;
  try {
    const isFailure = Boolean(options.isFailure || options.status === 'failed' || options.outcome === 'failed');
    
    // Epistemic validation: reject hallucinations, placeholders, and unverified claims
    const epistemics = require('./epistemics');
    const perception = epistemics.validateMemoryPerception({ summary, title: task });
    if (perception.isInvalid()) {
      return null;
    }

    const category = isFailure ? 'Failure' : 'Experience';
    const content = `Task: ${task}\nResult: ${summary.slice(0, 1000)}`;
    const memId = await vectorMemory.storeMemory(agentId, content, null, {
      category,
      organizationId: options.organizationId,
      projectId: options.projectId
    });

    // Only secrete positive exosomes into the extracellular matrix for successful missions
    if (!isFailure) {
      try {
        const engramContent = `Agent ${agentId} learned from task "${task.slice(0, 100)}": ${summary.slice(0, 400)}`;
        const { textToVector } = require('./memoryScoring');
        await vectorMemory.depositExosome({
          new_engrams: [{
            content: engramContent,
            vector: textToVector(engramContent)
          }],
          plasmid_name: `plasmid_${agentId}_${Date.now()}`,
          plasmid_code: `// Epigenetic transmission from ${agentId}\n// Task: ${task.slice(0, 80)}\n// Insight: ${summary.slice(0, 200)}`,
          organizationId: options.organizationId,
          projectId: options.projectId
        });
      } catch {}
    }

    return memId;
  } catch {
    return null;
  }
}

module.exports = {
  retrieveAgentMemories,
  formatCognitiveMemoryPrompt,
  compileExecutionMemory,
  formatGoldenPath
};
