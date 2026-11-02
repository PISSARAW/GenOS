# Intégrer une boucle GQEL

- **Statut** : Partiel ; API Node.js disponible, intégration automatique à toutes les topologies non établie.
- **Portée** : appel direct et contrôle optionnel des artefacts workers.
- **Dernière revue** : 2026-11-02

Le [concept](../01-concepts/gqel.md) explique le rôle de GQEL. La
[référence](../03-reference/gqel-boucle-elevation-qualite.md) décrit les champs et
les limites exécutables ; le [runbook](../04-exploitation/gqel.md) couvre le diagnostic.

## Choisir le point d'intégration

GQEL s'applique à un livrable. Il ne sélectionne pas une topologie et ne crée
pas de workers. L'appelant lui fournit un générateur asynchrone, puis remet le
résultat à ses propres validateurs de preuves.

| Surface | Raccord constaté | Responsabilité restante de l'appelant |
| --- | --- | --- |
| API Node.js | `executeElevationLoop({ contract, generator })` | Modèle, ressources, preuves et stockage |
| Artefact worker | `validateWorkerArtifact` appelle le contrôleur de qualité si configuré | Fournir le contrat et gérer le refus |
| A-Team | Émission d'une obligation sur critères non vérifiés | Planifier la réparation ; aucun appel automatique à la boucle |
| Trinity | Expériences et gates propres au runtime Trinity | Adaptateur explicite si une expérience doit utiliser GQEL |
| Morphogenèse | Construction et transition des organisations | Adaptateur explicite ; GQEL ne modifie pas le graphe |

Le dépôt n'expose pas d'outil MCP, de route REST ou de commande CLI dédiée à
GQEL dans les surfaces examinées. Les imports Node constituent ici la surface
opérable, pas une option universelle de `genos_orchestrate`.

## Exemple reproductible sans fournisseur LLM

Depuis la racine du dépôt, exécuter ce JavaScript avec Node.js, par exemple via
`node` et son entrée standard. Les deux réponses sont fixes : cet exemple
vérifie la boucle, sans mesurer un gain de modèle.

```javascript
const assert = require('node:assert/strict');
const {
  compileQualityContract,
  executeElevationLoop
} = require('./backend/src/services/qualityElevation/qualityElevationService');

async function main() {
  const contract = compileQualityContract({
    mission: 'Produire un module JavaScript qui additionne deux nombres.',
    domain: 'software_engineering',
    policy: 'balanced'
  });
  const candidates = [
    'function add(a, b) { return a + b; }',
    'function add(a, b) { return a + b; }\n'
      + 'module.exports = { add };\n'
      + '// Test: add(2, 3) === 5'
  ];
  const result = await executeElevationLoop({
    contract,
    generator: async ({ iteration }) => candidates[iteration - 1]
  });
  assert.equal(result.finalStatus, 'promoted');
  assert.equal(result.totalIterations, 2);
  assert.equal(result.demonstratedGain, 25);
  console.log({
    status: result.finalStatus,
    iterations: result.totalIterations,
    score: result.bestVersion.score,
    gain: result.demonstratedGain
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Résultat attendu : `promoted`, deux itérations, score 100 et gain 25. Le commentaire
`// Test` suffit à l'heuristique ; il ne constitue pas un test exécuté de `add`.

## Raccorder un générateur réel

Le callback reçoit `{ iteration, prompt, repairPrompt }` ; les deux champs de
prompt contiennent le même texte. Il retourne une chaîne ou un objet reconnu
par l'évaluateur. L'autre forme d'appel accepte un driver exposant `generate`
et les options dans le second argument : `executeElevationLoop(driver, options)`.

L'adaptateur doit choisir et tracer le fournisseur, le modèle et ses paramètres,
conserver les réponses et mesurer le coût réel. Pour une comparaison à modèle
constant, il doit maintenir cette identité sur toutes les conditions.

Les erreurs du générateur remontent à l'appelant : GQEL n'ajoute ni retry réseau,
ni conversion automatique en résultat terminal. Les limites de temps, tokens,
coût et annulation doivent être imposées par l'adaptateur ou son runtime.

## Configurer le contrôle d'un worker

Le fragment suivant décrit le champ lu par le validateur ; il ne constitue pas
un contrat worker complet ni la preuve que chaque composeur le propage :

```javascript
const qualityElevation = {
  domain: 'software_engineering',
  minScore: 85,
  options: {
    threshold: 85,
    requiredExports: ['add']
  }
};
// À placer dans worker.workerContract.qualityElevation.
```

`minScore` est le seuil du contrôleur worker ; `minQualityScore` est le champ du
compilateur de boucle. `options` est transmis directement à l'évaluateur worker.
La boucle, elle, ne transmet actuellement que `mission` à son évaluateur.

Le contrôle intervient après validation structurelle de l'artefact. Un artefact
invalide produit `WORKER_QUALITY_ELEVATION_FAILED` ; un score valide mais sous
`minScore` produit `WORKER_QUALITY_SCORE_DEFICIENT`. Sans champ `qualityElevation`,
le contrôleur retourne `null`. Il ne relance pas le générateur.

## Composer avec les autres mécanismes

Dans [Trinity](topologies/trinity.md), une intégration peut utiliser GQEL à
l'intérieur d'un monde, mais le score ne remplace ni la comparaison scellée ni
les gates de promotion. Pour attribuer un gain à GQEL, conserver le même traitement
des mondes témoins et tracer le budget supplémentaire de réparation.

La [morphogenèse](topologies/morphogenese.md) agit sur l'organisation. Une
stagnation GQEL ne déclenche actuellement aucune transition morphologique :
`mutate_strategy` ajoute une consigne textuelle au prochain prompt. Tout changement
de topologie reste soumis aux contrats et autorités morphogénétiques existants.

Dans A-Team, `repairObligation.status = pending_repair` décrit des critères à
réparer. Il faut une planification explicite pour transformer cette obligation
en nouvelle exécution, puis revérifier les preuves. Ce résultat n'est pas une
obligation AEIS scellée ni une preuve que la réparation a été exécutée.

## Remettre un résultat à la mission

Conserver le contrat, toutes les versions, les évaluations et les comparaisons.
Vérifier le contenu de `bestVersion` séparément du statut : l'acceptation utilise
la dernière version, alors que la meilleure est sélectionnée par une autre règle.
Soumettre ensuite l'artefact exact aux tests et à l'oracle de mission. Le booléen
local `promoted` ne dispense d'aucun de ces contrôles.
