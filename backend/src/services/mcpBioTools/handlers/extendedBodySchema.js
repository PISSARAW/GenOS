/**
 * @file extendedBodySchema.js
 * @description Redéfinition du schéma corporel étendu : quand un agent
 * intègre un outil ou un sous-worker, son "corps" neurologique s'étend
 * jusqu'au bout de l'outil — le tournevis devient prolongement du bras.
 *
 * Inspiration biologique : plasticité du schéma corporel. Les neurones
 * qui codaient la main activent désormais quand l'outil touche quelque
 * chose. L'outil est "branché" au système nerveux central.
 *
 * État : `extendedBodies` est une Map en mémoire de session. Redémarrage
 * du serveur MCP = tous les schémas corporels perdus. Persistance
 * prévue dans ADR ultérieur (voir docs/adr/).
 */

const extendedBodies = new Map();

/**
 * Crée ou met à jour un schéma corporel étendu.
 * bodyId peut être un agentId ou un workerId.
 */
function updateBodySchema(bodyId, toolOrWorker, modality) {
  let corps = extendedBodies.get(bodyId);
  if (!corps) {
    corps = {
      bodyId,
      membres_natifs: ['mains', 'vision', 'langage'],
      membres_etendus: [],
      outils_intégrés: [],
      workers_intégrés: [],
      originatedAt: new Date().toISOString(),
      lastExtendedAt: null
    };
  }

  addIfMissing(corps.outils_intégrés, toolOrWorker);
  addIfMissing(corps.membres_etendus, modality);
  corps.lastExtendedAt = new Date().toISOString();
  extendedBodies.set(bodyId, corps);

  return corps;
}

function addIfMissing(arr, item) {
  if (!arr.includes(item)) arr.push(item);
}

/**
 * Évalue le degré d'intégration.
 */
function integrationDegree(corps) {
  if (!corps) return { degré: 0, statut: 'non_intégré' };
  const total = corps.outils_intégrés.length + corps.workers_intégrés.length;
  if (total === 0) return { degré: 0, statut: 'non_intégré' };
  if (total <= 2) return { degré: 0.4, statut: 'en_attachement' };
  if (total <= 5) return { degré: 0.7, statut: 'intégré' };
  return { degré: 1.0, statut: 'pleinement_intégré' };
}

function makeOutput(opts) {
  return { configured: opts.configured, success: opts.success, status: opts.status, transport: opts.transport, output: opts.output };
}

/** Handler action : list. */
function handleList() {
  const tous = Array.from(extendedBodies.entries()).map(([id, corps]) => ({
    bodyId: id,
    ...integrationDegree(corps),
    membres_etendus: corps.membres_etendus,
    outils_intégrés: corps.outils_intégrés,
    workers_intégrés: corps.workers_intégrés
  }));
  return makeOutput(true, true, 'completed', 'local',
    JSON.stringify({ corps_etendus: tous, count: tous.length }, null, 2));
}

/** Handler action : attach. */
function handleAttach(bodyId, args) {
  const outil = args.tool || args.outil || args.modality || 'outil_inconnu';
  const modality = args.modality || `${outil}_sensorimotor`;
  const corps = updateBodySchema(bodyId, outil, modality);
  const degré = integrationDegree(corps);

  return makeOutput(true, true, 'completed', 'local',
    JSON.stringify({
      bodyId,
      action: 'attach',
      outil_intégré: outil,
      modalité: modality,
      corps: {
        membres_natifs: corps.membres_natifs,
        membres_etendus: corps.membres_etendus,
        outils_intégrés: corps.outils_intégrés,
        degré_intégration: degré.degré,
        statut: degré.statut
      },
      interprétation: `L'outil "${outil}" est maintenant intégré au schéma corporel de "${bodyId}". Neurones de la main s'adaptent.`
    }, null, 2));
}

/** Handler action : detach. */
function handleDetach(bodyId, args) {
  const toolToRemove = args.tool || args.outil || args.modality;
  const corps = extendedBodies.get(bodyId);

  if (!corps) {
    return makeOutput(true, false, 'tool_error', 'local',
      `Aucun schéma corporel trouvé pour "${bodyId}".`);
  }

  if (toolToRemove) {
    corps.outils_intégrés = corps.outils_intégrés.filter(t => t !== toolToRemove);
    corps.membres_etendus = corps.membres_etendus.filter(m => m !== toolToRemove && !m.includes(toolToRemove));
  }
  corps.lastExtendedAt = null;
  extendedBodies.set(bodyId, corps);

  const degré = integrationDegree(corps);
  return makeOutput(true, true, 'completed', 'local',
    JSON.stringify({
      bodyId,
      action: 'detach',
      tool_removed: toolToRemove,
      degré_intégration: degré.degré,
      statut: degré.statut,
      interprétation: `Outil retiré du schéma corporel de "${bodyId}".`
    }, null, 2));
}

/** Handler action : status. */
function handleStatus(bodyId) {
  const corps = extendedBodies.get(bodyId);
  const degré = integrationDegree(corps);

  const output = corps
    ? JSON.stringify({
        bodyId,
        corps: {
          membres_natifs: corps.membres_natifs,
          membres_etendus: corps.membres_etendus,
          outils_intégrés: corps.outils_intégrés,
          workers_intégrés: corps.workers_intégrés,
          degré_intégration: degré.degré,
          statut: degré.statut,
          lastExtendedAt: corps.lastExtendedAt
        },
        interprétation: `Schéma corporel de "${bodyId}" : ${corps.outils_intégrés.length} outil(s) intégré(s), degré ${degré.degré.toFixed(2)}.`
      }, null, 2)
    : JSON.stringify({
        bodyId,
        corps: null,
        interprétation: `Aucun schéma corporel étendu pour "${bodyId}".`
      }, null, 2);

  return makeOutput(true, true, 'completed', 'local', output);
}

/**
 * Handler principal. Actions : attach, detach, status, list.
 */
function handleExtendedBodySchema(args, run) {
  const action = (args.action || 'status').toLowerCase();
  const bodyId = args.body_id || args.agent_id || args.worker_id || 'agent-default';

  if (action === 'list') return handleList();
  if (action === 'attach') return handleAttach(bodyId, args);
  if (action === 'detach') return handleDetach(bodyId, args);
  return handleStatus(bodyId);
}

function handleExtendedBodySchemaError(e) {
  return { configured: true, success: false, status: 'tool_error', transport: 'local', output: e.message };
}

module.exports = { handleExtendedBodySchema, handleExtendedBodySchemaError };
