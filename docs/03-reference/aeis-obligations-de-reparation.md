# AEIS : obligations de réparation et pertinence des preuves

- **Type** : référence
- **Statut** : domaine borné implémenté, sélection explicite par assignation
- **Date** : 2026-11-02
- **Décision** : [ADR 0765](../adr/0765-aeis-obligations-de-reparation-scellees.md)

## Garantie

Le type `code_repair_obligations` étend l'oracle natif `workspace_claims`.
L'hôte scelle un contrat avant le lancement du worker. AEIS vérifie le candidat
sur les obligations, démontre le défaut initial sur une baseline et vérifie que
la suite détecte les variantes fautives explicitement désignées.

La proposition formelle reste celle de l'oracle workspace : le résultat observé
satisfait ses postconditions scellées. Les preuves ne valident pas toutes les
affirmations libres du worker. Les descriptions expliquent les cas ; les valeurs
attendues constituent l'oracle effectif.

## Assignation hôte

Placer le contrat dans `workerAssignment.workspaceVerificationContract` du dispatch
existant. Il est conservé dans le contrat du worker et contrôlé par
`workspaceVerificationContract.assertMatches`. Le rapport du worker ne peut pas
remplacer la suite scellée.

```javascript
const contract = {
  version: 1,
  kind: 'code_repair_obligations',
  artifactPath: 'candidate.gexpr',
  baselinePath: 'baseline.gexpr',
  suitePath: 'obligations.json',
  obligationIds: ['negative', 'positive'],
  sources: [
    { path: 'candidate.gexpr', sha256: initialCandidateHash, mutable: true },
    { path: 'baseline.gexpr', sha256: baselineHash },
    { path: 'obligations.json', sha256: suiteHash }
  ],
  mutants: [
    { id: 'constant-zero', expression: '0', obligationIds: ['negative', 'positive'] },
    { id: 'wrong-boundary', expression: 'b', obligationIds: ['negative', 'positive'] }
  ]
};
```

Les hashes sont des SHA-256 hexadécimaux minuscules de 64 caractères, calculés
sur les octets des fichiers. Les trois chemins sont relatifs, confinés, distincts
et sans symlink. La baseline et la suite sont immuables. Le marqueur `mutable`
ne donne aucun droit d'écriture : les leases et politiques du runtime restent
requis. Le hash déclaré du candidat n'est pas exigé après édition ; la preuve
lie son contenu effectivement relu.

Exemple : baseline `a % b`, candidat `((a % b) + b) % b`.

## Suite scellée

```json
{
  "version": 1,
  "obligations": [
    {
      "id": "negative",
      "mode": "regression",
      "statement": "Les dividendes négatifs produisent les restes non négatifs déclarés.",
      "cases": [
        { "input": { "a": -1, "b": 4 }, "expected": 3 },
        { "input": { "a": -5, "b": 3 }, "expected": 1 }
      ]
    },
    {
      "id": "positive",
      "mode": "preservation",
      "statement": "Les résultats déclarés des dividendes positifs sont préservés.",
      "cases": [
        { "input": { "a": 5, "b": 4 }, "expected": 1 },
        { "input": { "a": 7, "b": 3 }, "expected": 1 }
      ]
    }
  ]
}
```

Les IDs de la suite et du contrat coïncident exactement. Les IDs dupliqués,
inconnus, entourés d'espaces ou les entrées dupliquées dans une obligation sont
refusés. Chaque obligation possède au moins un mutant ciblé.

## Décision

| Condition | Verdict |
| --- | --- |
| Un cas candidat est faux ou produit un nombre non fini | `refuted` |
| Une obligation `regression` ne montre aucun échec initial | `inconclusive` |
| Une obligation `preservation` échoue déjà sur la baseline | `inconclusive` |
| Un mutant ciblé satisfait encore tous les cas de son obligation | `inconclusive` |
| Un mutant est hors langage ou produit une sortie non finie | `inconclusive` |
| Expression candidate hors langage, contrat ou suite invalide | `inconclusive` |
| Tous les cas passent et les conditions de pertinence sont établies | `verified` |

Les validations de forme et de langage précèdent la décision : une entrée
inexploitable reste inconclusive même si un autre élément est également faux.
La vérification native exige deux reçus favorables ; aucun autre verdict
n'autorise la promotion.

## Reçus et relecture

`executionEvidence[].postconditions.coverage` conserve :

- le schéma `genos.code-repair-obligations/v1` et la portée `declared_finite_cases` ;
- `contractHash`, `artifactContentHash`, `baselineContentHash`, `suiteContentHash` ;
- chaque obligation, son mode, ses cas attendus et vérifiés, ses échecs candidats,
  son premier contre-exemple, ses échecs initiaux et ses mutants détectés ;
- le nombre de mutants vérifiés et `complete`.

La relecture exige les mêmes hashes, toutes les obligations, tous les cas,
les conditions de baseline et tous les mutants ciblés. Une couverture partielle
correctement signée reste inadmissible. Modifier le candidat invalide son assurance
courante sans effacer la décision historique ni les coûts.

## Bornes et limites

- 16 obligations, 128 cas au total, 16 mutants et 32 associations mutant/obligation.
- Trois fichiers d'au plus 32 Kio chacun ; contrat d'au plus 16 384 caractères.
- Entrées exactement `a,b`, entiers sûrs de valeur absolue au plus `10^6`.
- Valeurs attendues finies de valeur absolue au plus `10^12` ; comparaison numérique exacte.
- Expressions de 1 000 caractères et 180 tokens maximum : `a,b`, nombres,
  arithmétique et `Math.abs/min/max/floor/ceil`. Aucun `eval`, import ou accès fichier.
- Budgets, délais, nonces, leases et scopes de l'oracle natif existant.

Les processus sont séparés et parcourent les cas dans des ordres opposés. Ils
partagent l'interpréteur : aucune indépendance algorithmique n'est démontrée.
Suite et mutants sont scellés, sans garantie de confidentialité ; aucun test
secret ou holdout général n'est revendiqué. L'hôte reste responsable de la qualité
des valeurs attendues et des mutants. La preuve ne généralise pas aux entrées
non testées, à JavaScript arbitraire ou à la correction globale du projet.

## Vérification exécutable

```powershell
node backend/tests/test_aeis_repair_obligations.js
node backend/tests/test_aeis_repair_obligations_runtime.js
npm --prefix backend run test:aeis
```

La première sonde couvre candidats faux, suites inadéquates, sources altérées,
mutants survivants, bornes et couverture des reçus. La seconde exécute un vrai
dispatch avec transport de modèle local contrôlé, deux processus natifs, reçus
signés, coûts persistés et refus d'une preuve tronquée même correctement signée.
Elle vérifie aussi l'invalidation après modification de l'artefact. Aucun compte
provider réel n'est utilisé.
