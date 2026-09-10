/**
 * Service d'identité pour les agents GenOS.
 * Fournit l'attribution de noms riches, leurs significations philosophiques et symboliques,
 * ainsi que la présentation d'identité pour les prompts et la télémétrie.
 */

const crypto = require('crypto');

const IDENTITY_CATALOG = [
  { name: 'Kwame', meaning: 'Né un samedi (Akan) - Le planificateur méthodique' },
  { name: 'Chidi', meaning: "Dieu existe (Igbo) - L'esprit logique et rigoureux" },
  { name: 'Zola', meaning: 'Calme et amour (Kongo) - Le pacificateur et conciliateur' },
  { name: 'Nia', meaning: 'Objectif et dessein (Swahili) - La détermination inflexible' },
  { name: 'Tariq', meaning: "L'étoile du matin (Arabe / Nord-Africain) - L'éclaireur avant-gardiste" },
  { name: 'Ayo', meaning: 'Pleine de joie (Yoruba) - La créativité vivace' },
  { name: 'Amadou', meaning: 'Le loué (Peul / Bambara) - Le guide intègre' },
  { name: 'Kofi', meaning: 'Né un vendredi (Akan) - L\'observateur et auditeur patient' },
  { name: 'Mandla', meaning: 'La force (Zoulou) - Le bâtisseur résilient' },
  { name: 'Sekou', meaning: 'Le stratège sage (Mandinka) - Le protecteur de la mémoire' },
  { name: 'Griot', meaning: 'Le dépositaire de la tradition orale et des savoirs de GenOS' }
];

function getRandomIdentity(excludeNames = []) {
  const available = IDENTITY_CATALOG.filter((item) => !excludeNames.includes(item.name));
  const pool = available.length > 0 ? available : IDENTITY_CATALOG;
  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

function getStableIdentity(stableKey, excludeNames = []) {
  const available = IDENTITY_CATALOG.filter((item) => !excludeNames.includes(item.name));
  const pool = available.length > 0 ? available : IDENTITY_CATALOG;
  const digest = crypto.createHash('sha256').update(String(stableKey)).digest();
  const selected = pool[digest.readUInt32BE(0) % pool.length];
  const suffix = digest.toString('hex').slice(0, 6);
  return { ...selected, name: `${selected.name}-${suffix}` };
}

function findIdentityByName(name) {
  if (!name) return null;
  const normalized = String(name).trim().toLowerCase();
  return IDENTITY_CATALOG.find((item) => item.name.toLowerCase() === normalized) || null;
}

function formatSelfIntroduction(name, nameMeaning, role = '') {
  const baseName = name || 'Griot';
  const meaning = nameMeaning || (findIdentityByName(baseName)?.meaning || 'Agent de l\'écosystème GenOS');
  const roleText = role ? ` en qualité de ${role}` : '';
  return `Je m'appelle ${baseName}, ce qui signifie '${meaning}'. C'est l'identité et le sens que je porte dans l'écosystème GenOS${roleText}.`;
}

function generateAgentIdentity(options = {}) {
  const { preferredName, role, excludeNames = [], stableKey } = options;
  if (preferredName) {
    const matched = findIdentityByName(preferredName);
    return {
      name: preferredName,
      name_meaning: matched ? matched.meaning : `Spécialiste dédié à la mission (${role || 'Agent autonome'})`,
      introduction: formatSelfIntroduction(preferredName, matched?.meaning, role)
    };
  }

  const selected = stableKey ? getStableIdentity(stableKey, excludeNames) : getRandomIdentity(excludeNames);
  return {
    name: selected.name,
    name_meaning: selected.meaning,
    introduction: formatSelfIntroduction(selected.name, selected.meaning, role)
  };
}

module.exports = {
  IDENTITY_CATALOG,
  getRandomIdentity,
  getStableIdentity,
  findIdentityByName,
  formatSelfIntroduction,
  generateAgentIdentity
};
