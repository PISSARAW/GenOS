# Raccorder la boucle causale aux reçus de stratégie

- **Statut** : Accepté pour les runs workers munis d'une preuve indépendante de qualité
- **Date** : 2026-10-15
- **Domaine** : Exécution, épistémologie, apprentissage causal
- **Décideurs** : GenOS maintainers
- **Lié à** : ADR 0525b, ADR 0524

## Contexte

`causalLoopService.processActionReceipt` validait déjà une preuve de qualité signée,
mais aucun chemin de production ne l'appelait. Le reçu biologique worker établit
la finalité, les garde-fous, le budget et une référence à une vérification native.
Il ne fournit pas à lui seul un score de qualité indépendant.

## Décision

Ajouter un pont après la persistance du reçu terminal. Il exige simultanément un
run terminé, un reçu worker vérifié et dans le budget, une référence d'oracle
natif, un événement `AGENT_COMPLETED` et une `qualityEvidence` signée dont
l'action est liée à l'ID du run et dont l'agent et le tenant correspondent au
contexte SQLite. Le pont transmet un fait épistémique minimal et le reçu à la
boucle causale; toute absence ou divergence est refusée.

Le pont reste conditionnel tant qu'une source du parcours ne fournit pas ce
contrat signé. Il ne convertit ni la réussite de transport ni l'attestation
binaire d'exécution en score qualitatif. L'appel est effectué après validation
de la persistance biologique, hors de sa transaction.

## Conséquences

### Positives

- La boucle possède désormais un appelant de production explicite.
- L'identité d'action, l'agent et les deux composantes du tenant sont vérifiées
  avant toute mise à jour épistémique, mémoire ou RPE.
- Les runs non admissibles restent hors de la boucle et le résultat expose le
  motif du refus.

### Négatives

- Les exécutions sans `qualityEvidence` signée restent sans apprentissage causal.
- La persistance durable et la reprise idempotente de l'historique de boucle ne
  sont pas couvertes par cette décision.

## Alternatives

- Déduire un score de `result.verified` : rejeté, car un statut d'exécution ne
  constitue pas une mesure indépendante de qualité.
- Promouvoir le succès du transport MCP ou orchestration : rejeté, car il ne
  prouve ni la validité du résultat ni sa qualité.
