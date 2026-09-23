/**
 * Registre des harnesses d'exécution (HCL, étape 1).
 * GenOS reste l'autorité : identité, contrats, budgets, leases,
 * snapshots et promotion. Le registre ne fait que router vers
 * des drivers déclarant leurs capacités.
 */
const drivers = new Map();

function normalizeName(name) {
  return String(name || '').trim().toLowerCase();
}

function registerHarness(entry) {
  const name = normalizeName(entry && entry.name);
  if (!name) throw Object.assign(new Error('Harness name is required.'), { code: 'HARNESS_NAME_REQUIRED' });
  if (!entry.driver) throw Object.assign(new Error(`Harness '${name}' has no driver.`), { code: 'HARNESS_DRIVER_REQUIRED' });
  drivers.set(name, { capabilities: entry.capabilities || {}, driver: entry.driver });
  return name;
}

function getHarness(name) {
  const key = normalizeName(name);
  if (!drivers.has(key)) throw Object.assign(new Error(`Unknown harness '${key}'.`), { code: 'UNKNOWN_HARNESS' });
  return drivers.get(key);
}

function listHarnesses() {
  return Array.from(drivers.keys()).sort();
}

function supportsCapabilities(declared, required) {
  return required.every((capability) => declared.includes(capability));
}

function matchHarness(requirements) {
  const needed = (requirements && requirements.capabilities) || [];
  for (const name of listHarnesses()) {
    const entry = drivers.get(name);
    const offered = entry.capabilities.provides || [];
    if (supportsCapabilities(offered, needed)) return name;
  }
  return null;
}

function clearRegistry() {
  drivers.clear();
}

module.exports = {
  registerHarness,
  getHarness,
  listHarnesses,
  matchHarness,
  clearRegistry,
};
