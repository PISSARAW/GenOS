# ADR 0400 — Oracles de workers déterministes à sorties structurées

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : workers déterministes, preuves indépendantes et promotion
- **Décideurs** : équipe GenOS
- **Lié à** : [qualification des workers](../06-qualite-preuves/qualification-workers.md), [ADR 0398](0398-oracle-subset-sum-procedural-direct.md), [ADR 0399](0399-oracles-observation-workers-bornes.md)

## Contexte

Plusieurs workers natifs produisent des sorties déterministes et typées, mais
un reçu interne ou un contrôle de forme ne prouve pas que leur résultat suit
les entrées de la mission. Une promotion C2/C3 exige des calculs distincts
liés au run et à l'artefact observé.

## Décision

Ajouter des sujets scellés et des postconditions bornées pour six méthodes :
`trace_declared_causes`, `measure_lpt`, `synthesize_claims`,
`verify_procedure`, `falsify_procedure` et `teach_subset_sum`. Les deux
stratégies de chaque domaine sont exécutées par processus natifs séparés,
avec workspace, reçu, durée et résultat liés à l'allocation d'oracle. AEIS
exige les deux reçus indépendants avant d'accepter la décision.

Les vérifications portent uniquement sur les invariants déterministes :
relations causales déclarées, résultat de l'ordonnanceur LPT pour l'entrée
fournie, désaccords de positions portant la même revendication, cohérence du
verdict et du contre-exemple subset sum, et validité arithmétique du transfert
apprenant. Elles ne certifient pas la vérité causale, l'optimalité, la vérité
des affirmations, l'exhaustivité adversariale ni la qualité pédagogique.

## Conséquences

### Positives

- Six méthodes natives ont un chemin exécutable vers C2/C3 avec les reçus liés
  à leur tentative courante.
- Les échecs de validation réfutent le résultat observé ou refusent la
  promotion ; ils ne sont pas convertis en succès de transport.
- La portée limitée de chaque claim est enregistrée dans son domaine formel.

### Négatives

- La qualification reste une tâche fixture par méthode et ne démontre pas une
  compétence générale.
- Chaque nouvelle méthode nécessite un sujet scellé, des stratégies réellement
  séparées et des postconditions adaptées.

## Alternatives

- Réutiliser le reçu du worker comme preuve : rejeté, car le producteur ne peut
  pas s'attester lui-même.
- Promouvoir uniquement parce que l'artefact est typé : rejeté, car cela ne
  vérifie pas sa relation aux entrées de la mission.
