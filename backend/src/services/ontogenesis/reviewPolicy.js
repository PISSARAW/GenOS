'use strict';

const { isActionAllowed } = require('./authorizationService');

/**
 * Revue pré-dispatch et règles coutumières (roadmap §P2).
 * Avant d'agir, pas après : classification de réversibilité,
 * règles par action (allow, on_request, ask_first, hand_off),
 * refus natifs conservés. Hors périmètre → ask_first (approbation).
 */

const POLICIES = ['allow', 'on_request', 'ask_first', 'hand_off'];
const VERDICTS = ['proceed', 'proceed_if_requested', 'ask_first', 'handoff', 'denied'];

function classifyAction(action) {
  if (action.scope === 'push' || action.scope === 'merge') return 'external';
  if (action.scope === 'commit') return 'irreversible';
  return 'reversible';
}

function matchScore(rule, action) {
  const match = (rule && rule.match) || {};
  let score = 0;
  if (match.scope !== undefined) {
    if (match.scope !== action.scope) return -1;
    score += 1;
  }
  if (match.branch !== undefined) {
    if (match.branch !== action.branch) return -1;
    score += 1;
  }
  if (match.pathPrefix !== undefined) {
    if (!String(action.path || '').startsWith(match.pathPrefix)) return -1;
    score += 1;
  }
  return score;
}

function findRule(rules, action) {
  let best = null;
  let bestScore = -1;
  for (const rule of rules || []) {
    if (!POLICIES.includes(rule.policy)) continue;
    const score = matchScore(rule, action);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function verdictForPolicy(policy) {
  if (policy === 'allow') return 'proceed';
  if (policy === 'on_request') return 'proceed_if_requested';
  if (policy === 'hand_off') return 'handoff';
  return 'ask_first';
}

function defaultVerdict(reversibility) {
  if (reversibility === 'external') return 'denied';
  if (reversibility === 'irreversible') return 'ask_first';
  return 'proceed';
}

function reviewAction(config, action) {
  const reversibility = classifyAction(action);
  if (reversibility === 'external') return { verdict: 'denied', reason: `${action.scope}-non-autorise`, reversibility };
  const base = isActionAllowed(config, action);
  if (!base.allowed) return { verdict: 'ask_first', reason: base.reason, reversibility };
  const authority = (config && config.authority) || {};
  const rule = findRule(authority.rules, action);
  if (!rule) {
    const verdict = defaultVerdict(reversibility);
    return { verdict, reason: `defaut-${reversibility}`, reversibility, rule: null };
  }
  return { verdict: verdictForPolicy(rule.policy), reason: `regle-${rule.policy}`, reversibility, rule: rule.policy };
}

module.exports = { POLICIES, VERDICTS, classifyAction, findRule, reviewAction };
