/**
 * GenOS Cryptobiosis Spore & Trehalose Vitrification Service
 * Biomimetic anhydrobiosis, osmotic vitrification, and spore germination.
 */

const crypto = require('crypto');
const { pack, unpack } = require('msgpackr');

const DEFAULT_TREHALOSE_CONCENTRATION = 0.85;
const DEFAULT_BUNKER_ARMOR = 500;

function vitrifyState(state, options = {}) {
  const trehalose = Number.isFinite(options.trehalose) ? Math.max(0, Math.min(1, options.trehalose)) : DEFAULT_TREHALOSE_CONCENTRATION;
  const armor = Number.isInteger(options.armor) ? options.armor : DEFAULT_BUNKER_ARMOR;
  const rawBlob = pack(state || {});
  const hasher = crypto.createHash('sha256');
  hasher.update(rawBlob);
  const payloadHash = hasher.digest('hex');

  return {
    payloadHash,
    rawBlob,
    trehaloseConcentration: trehalose,
    bunkerArmor: armor,
    vitrifiedAt: new Date().toISOString(),
    hydrationLevel: 0.0,
    isVitrified: true
  };
}

function germinateSpore(vitrifiedSpore, environment = {}) {
  if (!vitrifiedSpore || !vitrifiedSpore.rawBlob) {
    throw new Error('INVALID_SPORE: Missing vitrified spore payload');
  }
  const trehalose = vitrifiedSpore.trehaloseConcentration ?? 0;
  if (trehalose < 0.2) {
    throw new Error('OSMOTIC_COLLAPSE: Insufficient trehalose cryoprotection (< 0.2)');
  }
  const warmAndWet = environment.warmAndWet !== false;
  const nutrients = environment.nutrients !== false;
  if (!warmAndWet || !nutrients) {
    throw new Error('DORMANT: Environmental conditions (warm, wet, nutrients) not satisfied for germination');
  }

  const restored = unpack(vitrifiedSpore.rawBlob);
  return {
    state: restored,
    germinatedAt: new Date().toISOString(),
    hydrationLevel: 1.0,
    status: 'thawed'
  };
}

module.exports = {
  vitrifyState,
  germinateSpore,
  DEFAULT_TREHALOSE_CONCENTRATION,
  DEFAULT_BUNKER_ARMOR
};
