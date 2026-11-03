# ADR 0765 — AEIS : obligations de réparation scellées

- **Statut** : Accepté
- **Date** : 2026-11-02
- **Domaine** : AEIS, oracles natifs, correction de code, promotion
- **Décideurs** : Maintenance GenOS
- **Lié à** : ADR 0763, ADR 0764, ADR 0360

## Contexte

Un témoin authentique établit qu'une commande a été exécutée. Il n'établit pas
que cette commande démontre la correction annoncée. Les commandes triviales
sont déjà filtrées, mais un test admissible peut rester sans pouvoir de détection.
L'oracle natif `workspace_claims` sait déjà relire une assignation scellée,
attacher les sources à leurs hashes et obtenir deux reçus dans des processus
distincts. Le langage d'expressions arithmétiques possède un compilateur et
un interpréteur bornés, sans exécution de JavaScript arbitraire.

## Décision

Étendre cet oracle par le type `code_repair_obligations`, fourni par l'hôte dans
`workerAssignment.workspaceVerificationContract` avant le lancement. Le worker
ne choisit ni les obligations, ni la baseline, ni les mutants dans son rapport.

Trois sources distinctes sont fixées : candidat mutable, baseline immuable et
suite d'obligations immuable, liée par SHA-256 à l'assignation. Chaque obligation
nommée contient une proposition, des entrées `a,b`, des valeurs attendues et un mode :

- `regression` : au moins un cas échoue sur la baseline ;
- `preservation` : tous les cas passent déjà sur la baseline.

Au moins une obligation de régression est exigée. Le candidat doit satisfaire
tous les cas. Chaque obligation doit détecter au moins un mutant ciblé et tous
les mutants qui lui sont assignés doivent être détectés. Un mutant hors langage
ou produisant un résultat non fini ne démontre pas la pertinence des tests.

Une violation du candidat est `refuted`. Une baseline inadéquate, un mutant
survivant ou une entrée inexploitable rendent la décision `inconclusive`.
Aucune de ces situations ne permet une promotion native.

Les reçus portent les hashes du contrat, du candidat, de la baseline et de la
suite, la couverture, les échecs initiaux et les mutants détectés par obligation.
Le consommateur vérifie ces liaisons avant utilisation courante : même un reçu
correctement signé avec une couverture tronquée est refusé. Les nouveaux modules
entrent dans le manifeste d'implémentation des vérificateurs.

Budgets, quorum de deux processus, nonces, fraîcheur, tenants, journal et gates
de promotion restent ceux de l'oracle natif.

## Conséquences

### Positives

- Obligations explicites et démonstration différentielle sans interprétation du récit du worker.
- Une commande verte ou un hash de fichier ne remplacent pas ces contrôles.
- Contre-exemples et limites sont conservés dans les reçus signés.

### Négatives et limites

- Premier domaine limité aux expressions arithmétiques du langage existant.
- Preuve limitée aux cas finis déclarés ; les descriptions ne sont pas des théorèmes.
- L'hôte choisit les valeurs attendues et les mutants : leur signature ne démontre pas l'exhaustivité.
- Les processus partagent compilateur et interpréteur, avec des ordres de parcours
  différents : aucune indépendance algorithmique n'est revendiquée.
- Extension sélectionnée explicitement par assignation ; les autres domaines restent disponibles.

## Alternatives

- Tests JavaScript fournis par le worker : rejetés pour cette étape, car le producteur contrôlerait son oracle.
- Second système de reçus : rejeté, car il dupliquerait budgets et autorité.
- Pertinence déduite du nom d'une commande : insuffisante pour établir les obligations.

## Vérification

Voir la [référence des obligations AEIS](../03-reference/aeis-obligations-de-reparation.md).
