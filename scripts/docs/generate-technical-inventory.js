const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const outputPath = path.join(root, 'docs/03-reference/inventaire-technique.md');
const strategyFamilies = [
  require(path.join(root, 'backend/src/strategies/families/coreStrategies')),
  require(path.join(root, 'backend/src/strategies/families/temporalCollectiveStrategies')),
  require(path.join(root, 'backend/src/strategies/families/knowledgeResilienceStrategies')),
  require(path.join(root, 'backend/src/strategies/families/animalControlStrategies')),
].flat();
const tools = require(path.join(root, 'backend/src/db/seedTools')).MCP_TOOLS_LIST;

function jsFiles(directory, recursive = false) {
  const absolute = path.join(root, directory);
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return recursive ? jsFiles(relative, true) : [];
    return entry.isFile() && entry.name.endsWith('.js') ? [relative] : [];
  });
}

function registeredBioHandlerCount() {
  const registryPath = path.join(root, 'backend/src/services/mcpBioTools/handlers/index.js');
  const source = fs.readFileSync(registryPath, 'utf8');
  const registry = source.match(/const TOOL_HANDLERS = \{([\s\S]*?)\n\};/);
  if (!registry) throw new Error(`Unable to read TOOL_HANDLERS from ${registryPath}`);
  return (registry[1].match(/^\s+genos_[\w]+(?=\s*:)/gm) || []).length;
}

function inventory() {
  const strategies = strategyFamilies;
  const primitiveReferences = strategies.flatMap((strategy) => strategy.primitives);
  return {
    serviceFilesDirect: jsFiles('backend/src/services').length,
    serviceFilesRecursive: jsFiles('backend/src/services', true).length,
    controllerFilesDirect: jsFiles('backend/src/controllers').length,
    controllerFilesRecursive: jsFiles('backend/src/controllers', true).length,
    strategies: strategies.length,
    primitiveReferences: primitiveReferences.length,
    uniquePrimitives: new Set(primitiveReferences).size,
    declaredMcpTools: new Set(tools.map((tool) => tool.name)).size,
    registeredBioHandlers: registeredBioHandlerCount(),

    bioHandlerFiles: jsFiles('backend/src/services/mcpBioTools/handlers').length,
  };
}

function render(counts) {
  const date = new Date().toISOString().slice(0, 10);
  return `# Inventaire technique vérifiable\n\nGénéré le ${date} par \`node scripts/docs/generate-technical-inventory.js\`.\n\nCes mesures comptent les éléments définis dans la colonne « Méthode ». Elles décrivent le dépôt au moment de la génération ; elles ne mesurent ni la maturité, ni l'état de santé, ni la disponibilité runtime.\n\n| Mesure | Valeur | Méthode reproductible |\n| --- | ---: | --- |\n| Fichiers JavaScript de services (directs / récursifs) | ${counts.serviceFilesDirect} / ${counts.serviceFilesRecursive} | Fichiers \`.js\` directement sous \`backend/src/services\`, puis sous-arborescence comprise |\n| Fichiers JavaScript de contrôleurs (directs / récursifs) | ${counts.controllerFilesDirect} / ${counts.controllerFilesRecursive} | Fichiers \`.js\` directement sous \`backend/src/controllers\`, puis sous-arborescence comprise |\n| Stratégies déclarées | ${counts.strategies} | Familles de stratégies importées par le module strategyRegistry.js |\n| Références à des primitives / identifiants distincts | ${counts.primitiveReferences} / ${counts.uniquePrimitives} | Somme des tableaux \`primitives\` du registre / union de ces tableaux |\n| Outils MCP déclarés | ${counts.declaredMcpTools} | Noms distincts dans \`MCP_TOOLS_LIST\` de \`backend/src/db/seedTools.js\` |\n| Handlers biomimétiques enregistrés / fichiers sources | ${counts.registeredBioHandlers} / ${counts.bioHandlerFiles} | Clés de \`TOOL_HANDLERS\` / fichiers \`.js\` directs dans \`mcpBioTools/handlers\` |\n\nLes outils publics exposés par le serveur MCP peuvent former un sous-ensemble dépendant des leases et de la configuration. Les fichiers ne correspondent pas forcément un à un aux services, contrôleurs ou handlers enregistrés. Aucun total de tests n'est publié ici : leur décompte n'est pas normalisé par ce générateur.\n`;
}

function main() {
  const contents = render(inventory());
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== contents) {
      console.error('Inventaire absent ou obsolète : exécutez node scripts/docs/generate-technical-inventory.js');
      process.exitCode = 1;
    }
    return;
  }
  fs.writeFileSync(outputPath, contents);
  process.stdout.write(`${outputPath}\n`);
}

main();
