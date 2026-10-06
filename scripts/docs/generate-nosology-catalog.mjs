import fs from 'node:fs';

const catalog = JSON.parse(fs.readFileSync(new URL('../../shared/nosology.json', import.meta.url), 'utf8'));
const directory = new URL('../../docs/01-concepts/nosologie/', import.meta.url);
const families = {
  Autoimmune: 'Auto-immunes', Degenerative: 'Dégénératives', Infectious: 'Infectieuses',
  Genetic: 'Génétiques', Cancer: 'Cancers', Metabolic: 'Métaboliques',
  Cardiovascular: 'Cardiovasculaires', Psychiatric: 'Psychiatriques', Environmental: 'Environnementales',
};

function codeList(items) { return items.map(item => `\`${item}\``).join(', '); }

function conditionRows() {
  return catalog.conditions.map(item => `| ${item.id} | ${families[item.category]} | ${codeList(item.markers)} | ${codeList(item.therapies)} |`).join('\n');
}

function therapyRows() {
  return catalog.therapies.map(item => {
    const guards = item.guards.map(guard => `${guard.marker} > ${guard.min}`).join(', ') || 'Aucune supplémentaire';
    const effects = item.side_effects.map(effect => `${effect.marker} +${effect.amount}`).join(', ') || 'Aucun effet supplémentaire défini';
    return `| ${item.id} | ${codeList(item.targets)} | −${item.amount} | ${guards} | ${effects} |`;
  }).join('\n');
}

function document() {
  return `# Catalogue runtime de nosologie computationnelle

Ce document est généré depuis [shared/nosology.json](../../../shared/nosology.json) par node scripts/docs/generate-nosology-catalog.mjs. Le catalogue couvre **${catalog.conditions.length} conditions**, **${Object.keys(families).length} familles** et **${catalog.therapies.length} contrats de transformation de marqueurs**, dont les 19 noms auparavant absents du runtime. Les autres variantes historiques de SystemicTherapy conservent leurs effets documentés dans la vue d'ensemble.

## Contrat commun

- Les marqueurs sont des mesures logicielles finies dans [0,1]. Un marqueur de condition strictement supérieur à 0,5 suffit à établir cette condition simulée. Une valeur absente ou invalide n'est jamais une preuve de guérison.
- L'application diminue uniquement les cibles présentes et valides, avec un plancher à zéro. Elle conserve les autres marqueurs et ne ressuscite pas une cellule apoptotique.
- Le résultat expose status (applied, no_target ou refused), marker_changes (avant/après), applied_markers, cured_pathologies et induced_side_effects. Un ancien résultat sans statut est unspecified et n'atteste aucune application.
- Une condition existante n'est retirée que si une cible a été modifiée par le traitement et si **tous** ses marqueurs sont présents, valides et inférieurs ou égaux à 0,5. Les autres diagnostics restent conservés.
- Les effets secondaires ci-dessous sont simulés uniquement lorsque leurs marqueurs de risque sont explicitement présents. Ces marqueurs sont bornés à 1 et l'effet constaté est retourné et journalisé. Un marqueur de risque invalide bloque l'application.
- Le tick synchronise les diagnostics sur les cellules actives. Les recommandations issues des marqueurs restent des propositions; elles ne déclenchent aucune mutation thérapeutique automatique.

## Conditions et routage

| Condition simulée | Famille | Marqueurs suivis | Thérapies possibles |
|---|---|---|---|
${conditionRows()}

## Opérateurs de marqueurs

| Identifiant SystemicTherapy | Cibles | Effet borné | Garde | Effet secondaire conditionnel |
|---|---|---|---|---|
${therapyRows()}

## Exécution persistante

La CLI genos biomimicry therapy --agent-id <cell_id> --therapy-type <identifiant-ou-JSON> --journal <journal> --authorization-file <autorisation> restaure la population et utilise une autorisation signée, liée à la mission, au génome, à l'état cellulaire et au reçu source. Les fichiers doivent rester dans GENOS_WORKSPACE_ROOT. L'API existante POST /api/rust/clinical-authorizations vérifie l'approbateur, le tenant, la population courante et les types du catalogue avant de signer.

Chaque tentative autorisée produit un reçu durable avec son statut. Sans effet, treatment_administered et success restent faux. Une nouvelle présentation de la même autorisation renvoie le reçu existant et n'applique pas une seconde mutation. La mémoire est mise à jour seulement après la persistance du reçu et de la population. Une signature invalide ou un état changé est refusé avant mutation.

L'exposition MCP dépend du catalogue d'outils et de la lease du client; la présence d'un opérateur Rust ne lui accorde aucun accès MCP automatique. La persistance ne dispense d'aucune preuve ni autorisation.

## Limites et vérification

Les identifiants inspirés de maladies et de médicaments désignent des abstractions GenOS. Les paramètres biologiques et pseudo-code des anciennes fiches ne sont pas des paramètres médicaux exécutables. Ce catalogue ne constitue ni un diagnostic médical humain ni une validation de traitement.

Les tests de crates/genos-biology/tests/nosology_catalog.rs parcourent toutes les conditions et tous les opérateurs; crates/genos-orchestrator/tests/nosology_authorization.rs vérifie le reçu, la restauration, les refus et l'idempotence. Le backend vérifie les types avec backend/tests/test_nosology_catalog.js. Exécution ciblée : cargo test -p genos-biology et cargo test -p genos-orchestrator --features api --test nosology_authorization (la persistance requiert cette feature). Vérification de ce document : node scripts/docs/generate-nosology-catalog.mjs --check.
`;
}

const output = new URL('catalogue-runtime.md', directory);
const expected = document();
if (process.argv.includes('--check')) {
  if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== expected) {
    console.error('Le catalogue documentaire ne correspond pas au catalogue runtime.');
    process.exitCode = 1;
  } else console.log('Catalogue documentaire nosologique à jour.');
} else {
  fs.writeFileSync(output, expected);
  console.log('Catalogue documentaire nosologique généré.');
}
