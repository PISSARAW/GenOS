# ADR 0627 — Raccord de l'exécution cognitive ETT à des workers GenOS réels

- **Statut** : Partiel — seam d'injection implémenté (worker/solveur optionnel) ; mode LLM/réseau et frontières restent à lever par ADR
- **Date** : 2026-10-19
- **Domaine** : cognition endogène, exécution bornée, workers, preuve
- **Lié à** : ADR 0626, ADR 0012, ADR 0235, ADR 0295, ADR 0325

## Contexte

L'ETT v1 (PR1–PR8) livre une chaîne de contrôle durable et falsifiable, mais son
runner (`backend/src/services/endogenousThoughtRunnerService.js`) reste une
simulation déterministe en processus : il recopie l'hypothèse, le falsificateur et
le plan de preuve dans une proposition `completed_unverified`, place la tâche en
`verifying` et le run Ontogenèse en `unverified`, avec une consommation déclarée
nulle (`usage: { tokens: 0, usd: 0, seconds: 0 }`). Aucune recherche n'est
déléguée à un LLM ou à un solveur, et aucun worker GenOS n'est lancé. En
conséquence, la métrique primaire
(`découvertes_utiles_vérifiées / coût_normalisé`) ne peut pas être alimentée par
des mesures réelles, et l'hypothèse comparative de l'ETT ne peut pas être
évaluée.

Le présent ADR propose une tranche supplémentaire (PR9) qui raccorde le runner à
des workers GenOS réels **sans abaisser les frontières de sécurité** de l'ETT :
autorité SHEV, confinement, budgets, barrière de preuve indépendante, absence
d'action externe et de promotion restent non ablatables.

## Décision proposée

### 1. Seam d'injection plutôt qu'un appel direct

Le runner n'appelle pas directement un LLM. Il reçoit, via l'entrée normalisée,
un délégué optionnel `worker` (fonction ou descripteur de worker GenOS). Trois
modes coexistent :

- `simulation` (défaut, comportement actuel) : aucun worker, usage nul, mode
  `ett-read-only-simulation`.
- `worker` : délégation à un worker GenOS réel fourni par l'appelant ; usage
  mesuré.
- `solver` : délégation à un solveur déterministe (formel) ; usage mesuré en
  secondes/CPU, zéro jeton LLM.

Le mode est scellé dans l'autorisation SHEV (`details.mode`) et dans le reçu, de
sorte qu'un rejeu identique restitue le même mode et qu'un mode différent pour
le même épisode provoque un conflit d'idempotence.

### 2. Contrat du worker

Le délégué expose une fonction bornée :

```text
runBoundedSearch({ question, budget, boundaries, signal }) ->
  { proposal: { hypothesis, method, falsifier, expectedEvidence, sourceRefs },
    usage: { tokens, usd, seconds },
    evidenceRefs: string[] }
```

Contraintes enforced par le runner :

- respect du budget : `usage.tokens <= budget.tokens`, `usage.usd <= budget.usd`,
  `usage.seconds <= budget.seconds` ; tout dépassement rejette avec
  `ENDOGENOUS_RUN_BUDGET_EXCEEDED` et ne persiste aucun reçu ;
- pas d'action externe : le worker ne reçoit aucune capacité de mutation, de
  réseau ou d'écriture hors de la proposition ; les frontières négatives du reçu
  restent scellées ;
- idempotence : le worker n'est invoqué qu'à la première matérialisation ; le
  rejeu relit le reçu persisté sans réinvoquer le worker ;
- timeout : `budget.seconds` borne la durée ; dépassement = échec explicite.

### 3. Mesure et normalisation des coûts

La consommation déclarée par le worker est relue et validée (non fait confiance
aveuglément) : le runner recalcule `cost_normalisé` selon
`shared/endogenousThoughtMetrics.v1.json` et persiste à la fois la consommation
brute et la valeur normalisée dans le reçu. Une dimension dont le budget vaut
zéro exige une consommation nulle.

### 4. Autorité et vérification inchangées

- L'autorisation SHEV `ett-run` lie désormais aussi le mode et l'identité du
  worker/solveur.
- Le vérificateur indépendant (PR7) classe toujours la proposition ; le mode
  d'exécution n'élève pas le statut au-delà de `completed_unverified` côté
  runner.
- L'apprentissage (PR8) consomme uniquement des résultats vérifiés, quel que
  soit le mode.

### 5. Frontières qui ne peuvent pas être ablatées (rappel)

Comme pour PR1–PR8, les ablations expérimentales ne retirent jamais : l'autorité
SHEV, le confinement et l'absence de réseau côté runner, les budgets, la barrière
de preuve indépendante. L'ablation SHEV neutralise seulement sa contribution à
la génération d'initiative.

## Conséquences

### Positives

- Alimente la métrique primaire par des mesures réelles sans casser la chaîne de
  contrôle.
- Préserve l'idempotence et la reprise : le worker n'est invoqué qu'une fois.
- Permet une comparaison honnête entre `simulation`, `worker` et `solver` sous
  mêmes budgets et scénarios.

### Négatives

- Le runner devient dépendant d'un délégué externe ; sa testabilité exige des
  doubles (mocks) déterministes.
- La validation de la consommation déclarée ajoute de la complexité au runner
  (risque de dépassement des limites de paramètres/complexité du gate qualité).
- Nécessite une mise à jour du schéma de reçu et du contrat
  `EndogenousThoughtRun` pour porter le mode et la consommation normalisée.

## Preuves exécutables (à ajouter)

- `test_endogenous_thought_runner.js` : mode simulation inchangé (usage nul) ;
  mode worker avec double déterministe (usage non nul, budget respecté) ; rejeu
  sans réinvocation ; dépassement de budget rejeté ; idempotence par mode.
- Test de parité contrat/schéma pour le nouveau champ `mode`.
- Test de reprise après redémarrage avec worker invoqué une seule fois.

## Alternatives écartées

- **Appeler directement un LLM depuis le runner** : confond transport et décision,
  viole la frontière read-only et l'absence de réseau scellée par le reçu.
- **Mesurer un coût synthétique sans worker** : n'alimente pas la métrique par
  des données réelles, conserve le faux succès.
- **Rendre le worker obligatoire** : casse la chaîne existante et les tests
  actuels ; la simulation reste nécessaire comme contrôle (`planned_control`).

## Notes d'implémentation (indicatives)

- `normalizeInput` : accepter `input.worker` (optionnel) et `input.executionMode`
  (défaut `simulation`), avec validation.
- `runPayload` : ajouter `mode` et `normalizedCost` ; `usage` issu du worker en
  mode non simulation.
- `materializeRun` : invoquer le worker dans la transaction, valider le budget,
  puis persister ; en cas d'échec, la transaction rollback et l'épisode reste
  `QUEUED`.
- Préserver le défaut `simulation` pour la compatibilité ascendante.
