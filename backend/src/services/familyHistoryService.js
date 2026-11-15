'use strict';

const crypto = require('crypto');

const FAMILY_TABLE = 'family_history';

function uuid() {
  return crypto.randomUUID();
}

async function ensureFamilySchema(db) {
  await db.run(`CREATE TABLE IF NOT EXISTS ${FAMILY_TABLE} (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    parent_id TEXT,
    event_type TEXT NOT NULL,
    narrative TEXT NOT NULL DEFAULT '',
    inherited_traits_json TEXT NOT NULL DEFAULT '{}',
    mutation_reason TEXT,
    generation INTEGER NOT NULL DEFAULT 0,
    branch_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (json_valid(inherited_traits_json))
  )`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_family_agent ON ${FAMILY_TABLE}(agent_id, created_at)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_family_branch ON ${FAMILY_TABLE}(branch_id)`);
  await db.run(`CREATE INDEX IF NOT EXISTS idx_family_parent ON ${FAMILY_TABLE}(parent_id)`);
}

async function recordFamilyEvent(db, params) {
  await ensureFamilySchema(db);
  const {
    agentId,
    parentId = null,
    eventType,
    narrative = '',
    inheritedTraits = {},
    mutationReason = null,
    generation = 0,
    branchId = null
  } = params;

  if (!agentId || !eventType) {
    throw new Error('recordFamilyEvent requires agentId and eventType');
  }

  const validTypes = ['birth', 'mutation', 'merge', 'fission', 'death', 'apoptosis', 'resurrection'];
  if (!validTypes.includes(eventType)) {
    throw new Error(`Invalid family event type. Must be one of: ${validTypes.join(', ')}`);
  }

  const id = params.id || uuid();
  await db.run(
    `INSERT INTO ${FAMILY_TABLE} (id, agent_id, parent_id, event_type, narrative, inherited_traits_json, mutation_reason, generation, branch_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO NOTHING`,
    id, agentId, parentId, eventType, narrative, JSON.stringify(inheritedTraits), mutationReason, generation, branchId
  );

  return { id, agentId, parentId, eventType, narrative, generation };
}

async function getAncestry(db, agentId, maxDepth) {
  await ensureFamilySchema(db);
  maxDepth = maxDepth || 5;
  const ancestry = [];
  const frontier = [{ agentId, depth: 0 }];
  const seen = new Set();
  while (frontier.length) {
    const current = frontier.shift();
    if (seen.has(current.agentId) || current.depth >= maxDepth) continue;
    seen.add(current.agentId);
    const events = await db.all(
      `SELECT * FROM ${FAMILY_TABLE} WHERE agent_id = ? ORDER BY created_at ASC`,
      current.agentId
    );
    if (!events || events.length === 0) continue;
    const parents = extractParents(events);
    ancestry.push({ agentId: current.agentId, events, parents, depth: current.depth });
    for (const parentId of parents) frontier.push({ agentId: parentId, depth: current.depth + 1 });
  }
  return ancestry;
}

function extractParents(events) {
  const result = new Set();
  for (const e of events) {
    if (e.parent_id) result.add(e.parent_id);
    try {
      const inherited = JSON.parse(e.inherited_traits_json || '{}');
      for (const parentId of inherited.parentIds || []) result.add(parentId);
    } catch (_) {}
  }
  return [...result];
}

async function getDescendants(db, agentId, maxDepth) {
  await ensureFamilySchema(db);
  maxDepth = maxDepth || 5;
  const descendants = [];
  let currentLevel = [agentId];
  let depth = 0;

  while (currentLevel.length > 0 && depth < maxDepth) {
    const nextLevel = new Set();
    const levelDescendants = new Map();
    for (const id of currentLevel) {
      const events = await db.all(
        `SELECT * FROM ${FAMILY_TABLE} WHERE parent_id = ? ORDER BY created_at ASC`,
        id
      );
      for (const e of events) {
        if (!levelDescendants.has(e.agent_id)) {
          levelDescendants.set(e.agent_id, { agentId: e.agent_id, parentId: id,
            eventType: e.event_type, generation: e.generation, branchId: e.branch_id,
            when: e.created_at });
        }
        nextLevel.add(e.agent_id);
      }
    }
    descendants.push(...levelDescendants.values());
    currentLevel = [...nextLevel];
    depth++;
  }

  return descendants;
}

function buildOriginStory(rootEvents) {
  if (rootEvents.length === 0) return 'Origine : lignée sans récit de naissance.';
  const birth = findEventByType(rootEvents, 'birth');
  return birth ? `Origine : ${birth.narrative || 'création sans récit.'}` : 'Origine : lignée sans récit de naissance.';
}

function buildAncestryStory(ancestry) {
  const lines = [];
  for (let i = ancestry.length - 1; i >= 0; i--) {
    const level = ancestry[i];
    const gen = level.events[0]?.generation ?? level.depth;
    const parentIds = extractParents(level.events);
    if (parentIds.length > 0) {
      lines.push(`Génération ${gen} : ascendant(s) ${parentIds.join(', ')}.`);
    }
    for (const evt of level.events) {
      if (evt.event_type === 'mutation' && evt.mutation_reason) {
        lines.push(`  → Mutation : ${evt.mutation_reason}`);
      }
    }
  }
  return lines;
}

function buildDescendantsStory(descendants) {
  const lines = [];
  if (descendants.length === 0) return lines;
  lines.push(`Descendance : ${descendants.length} événement(s) enregistré(s).`);
  for (const desc of descendants.slice(0, 5)) {
    lines.push(`  → ${desc.agentId.substring(0, 8)}… (${desc.eventType}, gen ${desc.generation})`);
  }
  return lines;
}

async function buildFamilyStory(db, agentId, opts) {
  opts = opts || {};
  const maxDepth = opts.maxDepth || 5;
  const ancestry = await getAncestry(db, agentId, maxDepth);
  const descendants = await getDescendants(db, agentId, maxDepth);

  const story = [];
  const root = ancestry.filter((level) => level.parents.length === 0)
    .sort((left, right) => right.depth - left.depth)[0];
  const rootEvents = root?.events || [];
  story.push(buildOriginStory(rootEvents));
  story.push(...buildAncestryStory(ancestry));
  story.push(...buildDescendantsStory(descendants));

  return {
    agentId,
    ancestryDepth: ancestryDepth(ancestry),
    descendantCount: descendants.length,
    narrative: story.join('\n'),
    continuity: evaluateFamilyContinuity(ancestry, descendants),
    ancestry: ancestry.map(a => ({ agentId: a.agentId, eventCount: a.events.length,
      parents: a.parents, depth: a.depth })),
    descendants: descendants.map(d => ({ agentId: d.agentId, eventType: d.eventType, generation: d.generation }))
  };
}

function findEventByType(events, type) {
  for (const e of events) {
    if (e.event_type === type) return e;
  }
  return null;
}

function ancestryDepth(ancestry) {
  return ancestry.reduce((maximum, level) => Math.max(maximum, level.depth + 1), 0);
}

function evaluateFamilyContinuity(ancestry, descendants) {
  return {
    hasAncestor: ancestry.length > 0,
    hasDescendant: descendants.length > 0,
    maxDepth: ancestryDepth(ancestry),
    lineageComplete: isLineageComplete(ancestry),
    hasMutationEvents: hasEventOfType(ancestry, 'mutation'),
    hasMergeEvents: hasEventOfType(ancestry, 'merge'),
    familySize: ancestry.length + descendants.length
  };
}

function isLineageComplete(ancestry) {
  if (ancestry.length === 0) return false;
  const roots = ancestry.filter((level) => level.parents.length === 0);
  return roots.length > 0 && roots.every((level) => hasEventInList(level.events, 'birth'));
}

function hasEventInList(events, type) {
  for (const e of events) {
    if (e.event_type === type) return true;
  }
  return false;
}

function hasEventOfType(ancestry, type) {
  for (const level of ancestry) {
    if (hasEventInList(level.events, type)) return true;
  }
  return false;
}

async function compareLineages(db, agentPair, opts) {
  const maxDepth = (opts || {}).maxDepth || 3;
  const ancestryA = await getAncestry(db, agentPair.agentA, maxDepth);
  const ancestryB = await getAncestry(db, agentPair.agentB, maxDepth);
  const ancestorsA = collectAncestors(ancestryA);
  return findCommonAncestor(ancestryA, ancestryB, ancestorsA);
}

function collectAncestors(ancestry) {
  const result = new Set();
  for (const level of ancestry) {
    for (const parent of level.parents) {
      result.add(parent);
    }
  }
  return result;
}

function findCommonAncestor(ancestryA, ancestryB, ancestorsA) {
  for (let i = 0; i < ancestryB.length; i++) {
    const level = ancestryB[i];
    for (const parent of level.parents) {
      if (ancestorsA.has(parent)) {
        const depthA = findDepth(ancestryA, parent);
        return classifyRelation(depthA, i, parent);
      }
    }
  }
  return { relation: 'unrelated' };
}

function findDepth(ancestry, parentId) {
  for (let i = 0; i < ancestry.length; i++) {
    if (ancestry[i].parents.includes(parentId)) return ancestry[i].depth;
  }
  return 0;
}

function classifyRelation(depthA, depthB, commonAncestor) {
  if (depthA === 0 && depthB === 0) return { relation: 'same', commonAncestor };
  if (depthA === 0) return { relation: 'ancestor', direction: 'a-is-ancestor-of-b', depth: depthB };
  if (depthB === 0) return { relation: 'ancestor', direction: 'b-is-ancestor-of-a', depth: depthA };
  return { relation: 'cousin', commonAncestor, depthA, depthB };
}

function formatFamilyStoryPrompt(familyStory) {
  const lines = [
    `[HISTOIRE FAMILIALE]`,
    `- Profondeur d'ascendance : ${familyStory.ancestryDepth}`,
    `- Descendance : ${familyStory.descendantCount} événement(s)`,
    `- Complétude de la lignée : ${familyStory.continuity.lineageComplete ? 'oui' : 'non'}`,
    `- Mutations dans la lignée : ${familyStory.continuity.hasMutationEvents ? 'oui' : 'non'}`
  ];

  if (familyStory.narrative) {
    lines.push('', `[RÉCIT]`, familyStory.narrative);
  }

  return lines.join('\n');
}

module.exports = {
  ensureFamilySchema,
  recordFamilyEvent,
  getAncestry,
  getDescendants,
  buildFamilyStory,
  compareLineages,
  evaluateFamilyContinuity,
  formatFamilyStoryPrompt,
  FAMILY_TABLE
};
