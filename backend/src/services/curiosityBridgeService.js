'use strict';

/**
 * @file curiosityBridgeService.js
 * @description Pont Node ↔ Rust pour la curiosité NCE.
 *
 * Le backend Node calcule la curiosité via curiosityService (learning progress,
 * novelty, IG, affordances) et l'écrit dans un fichier JSON partagé.
 * Le Rust (genos-orchestrator/observer.rs) lit ce fichier et injecte la valeur
 * dans WorldState.curiosity_hint, qui pilote Goal::Explore dans drives.rs.
 */

const fs = require('fs');
const path = require('path');
const { computeCuriosity } = require('./curiosityService');

const BRIDGE_FILE = path.join(process.env.GENOS_WORKSPACE_ROOT || process.cwd(), '.genos', 'curiosity_bridge.json');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Calcule et écrit la curiosité NCE pour le Rust.
 * @param {Array} explorationDomains - Domaines d'exploration avec leurs records
 * @param {Object} options - Options de calcul
 * @returns {number} Le score de curiosité écrit (0-1)
 */
async function writeCuriosityHint(explorationDomains, options = {}) {
  if (!explorationDomains || explorationDomains.length === 0) {
    return writeHint(0.0);
  }

  // Calcule la curiosité pour chaque domaine et prend le top
  let topCuriosity = 0.0;
  for (const domain of explorationDomains) {
    const score = computeCuriosity(domain, {
      weights: options.weights,
      predictionVariance: domain.predictionVariance,
      cost: domain.cost,
      risk: domain.risk,
    });
    if (score > topCuriosity) topCuriosity = score;
  }

  return writeHint(topCuriosity);
}

function writeHint(value) {
  try {
    ensureDir(BRIDGE_FILE);
    const payload = {
      curiosity_hint: value,
      timestamp: new Date().toISOString(),
      version: 1,
    };
    fs.writeFileSync(BRIDGE_FILE, JSON.stringify(payload));
  } catch (_) {
    // Bridge non critique : si l'écriture échoue, le Rust utilise son signal par défaut
  }
  return value;
}

/**
 * Lit le fichier de bridge (pour vérification/testing).
 */
function readCuriosityHint() {
  try {
    if (!fs.existsSync(BRIDGE_FILE)) return 0.0;
    const data = JSON.parse(fs.readFileSync(BRIDGE_FILE, 'utf8'));
    return Number(data.curiosity_hint) || 0.0;
  } catch (_) {
    return 0.0;
  }
}

module.exports = {
  writeCuriosityHint,
  readCuriosityHint,
  BRIDGE_FILE,
};
