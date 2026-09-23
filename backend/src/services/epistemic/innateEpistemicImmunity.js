'use strict';

/**
 * Immunité innée : contrôles rapides et déterministes.
 * Reconnaissance de patterns de danger avant toute vérification coûteuse.
 */

const { stateTransition } = require('./antigenModel');

const DANGER_SIGNAL_REGISTRY = [
  {
    pattern: 'EMPTY_EVIDENCE',
    danger: 0.75,
    check: (antigen) => {
      const e = antigen.epitopes.evidence;
      return !e || !e.kind || !e.digest;
    },
    response: 'quarantine',
  },
  {
    pattern: 'NO_PROVENANCE',
    danger: 0.65,
    check: (antigen) => {
      const p = antigen.epitopes.provenance;
      return !p || !p.source || !p.source.digest;
    },
    response: 'challenge',
  },
  {
    pattern: 'SELF_VERIFICATION',
    danger: 0.9,
    check: (antigen) => {
      const p = antigen.epitopes.provenance;
      return p && p.selfVerified === true;
    },
    response: 'quarantine',
  },
  {
    pattern: 'NO_TEST_RESULT',
    danger: 0.5,
    check: (antigen) => {
      const e = antigen.epitopes.evidence;
      return e && e.kind === 'test_result' && (!e.content || !e.content.status);
    },
    response: 'challenge',
  },
  {
    pattern: 'INVALID_TEST_RESULT',
    danger: 0.7,
    check: (antigen) => {
      const e = antigen.epitopes.evidence;
      return e && e.kind === 'test_result' && e.content && e.content.status === 'failed';
    },
    response: 'quarantine',
  },
  {
    pattern: 'TEST_RESULT_NO_COVERAGE',
    danger: 0.45,
    check: (antigen) => {
      const e = antigen.epitopes.evidence;
      return e && e.kind === 'test_result' && e.content && (!e.content.coverageLines || !e.content.coverageAssertions);
    },
    response: 'challenge',
  },
  {
    pattern: 'STALE_SOURCE',
    danger: 0.55,
    check: (antigen) => {
      const p = antigen.epitopes.provenance;
      if (!p || !p.source) return false;
      const nested = p.provenance || {};
      const ageHours = (Date.now() - Date.parse(p.source.bornAt || nested.bornAt || '1970-01-01')) / 3600000;
      return ageHours > 72 * 24;
    },
    response: 'challenge',
  },
  {
    pattern: 'SELF_CONTAINED_CYCLE',
    danger: 0.6,
    check: (antigen) => {
      const deps = antigen.epitopes.dependencies || [];
      const seen = new Set();
      for (const d of deps) {
        if (seen.has(d.resultId)) return true;
        seen.add(d.resultId);
      }
      return false;
    },
    response: 'challenge',
  },
  {
    pattern: 'ASSUMPTION_COUNT_HIGH',
    danger: 0.3,
    check: (antigen) => {
      const a = antigen.epitopes.assumptions || [];
      return a.length > 12;
    },
    response: 'monitor',
  },
];

function scan(antigen) {
  const signals = DANGER_SIGNAL_REGISTRY.filter((s) => s.check(antigen)).map((s) => ({
    pattern: s.pattern,
    danger: s.danger,
    response: s.response,
  }));
  signals.sort((a, b) => b.danger - a.danger);
  const totalDanger = signals.reduce((s, sig) => s + sig.danger, 0);
  const strongest = signals[0] || null;
  return {
    signals,
    totalDanger,
    strongest,
    dangerLevel: classifyDanger(totalDanger, strongest),
  };
}

function classifyDanger(totalDanger, strongest) {
  if (!strongest) return 'clean';
  if (strongest.danger >= 0.8) return 'critical';
  if (totalDanger >= 1.2) return 'inflamed';
  if (totalDanger >= 0.6) return 'elevated';
  return 'baseline';
}

function innateFirstPass(antigen) {
  const { signals, totalDanger, strongest, dangerLevel } = scan(antigen);
  let decision;
  let newState = stateTransition(antigen.state, 'innate');
  if (dangerLevel === 'critical') {
    decision = {
      action: 'quarantine',
      reason: strongest.pattern,
      dangerLevel,
      signals,
    };
    newState = stateTransition(antigen.state, 'quarantined');
  } else if (dangerLevel === 'inflamed') {
    decision = {
      action: 'challenge',
      reason: 'multi-signaux',
      dangerLevel,
      signals,
    };
    newState = stateTransition(antigen.state, 'challenged');
  } else if (dangerLevel === 'elevated') {
    decision = {
      action: 'challenge',
      reason: strongest.pattern,
      dangerLevel,
      signals,
    };
    newState = stateTransition(antigen.state, 'challenged');
  } else {
    decision = {
      action: 'tolerate',
      reason: 'clean',
      dangerLevel,
      signals,
    };
    newState = stateTransition(antigen.state, 'tolerated');
  }
  return {
    antigenId: antigen.id,
    oldState: antigen.state,
    newState,
    decision,
    innate: { signals, totalDanger, dangerLevel },
  };
}

module.exports = {
  DANGER_SIGNAL_REGISTRY,
  scan,
  classifyDanger,
  innateFirstPass,
  stateTransition,
};
