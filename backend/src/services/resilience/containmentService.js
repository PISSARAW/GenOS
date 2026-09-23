'use strict';

/**
 * Containment : isoler sans détruire la preuve (avant morphogenèse radicale).
 */

function contain(opts) {
  const o = opts || {};
  return {
    contained: true,
    agentId: o.agentId || null,
    domain: o.domain || 'worker',
    quarantine: o.quarantine !== false,
    evidencePreserved: true,
    at: new Date().toISOString()
  };
}

module.exports = { contain };
