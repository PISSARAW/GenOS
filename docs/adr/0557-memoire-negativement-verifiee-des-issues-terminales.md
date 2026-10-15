# ADR 0557 — Mémoire négative vérifiée des issues terminales

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : épistémologie, exécution worker, mémoire, apprentissage causal
- **Décideurs** : GenOS
- **Lié à** : ADR 0533, 0535a, 0537

## Contexte

`qualityEvidence` est une preuve de qualité utilisée par la boucle causale et la
promotion. Un échec terminal n'est pas une issue positive et ne doit pas recevoir
un score dérivé de son seul statut. Pourtant, rejeter toute observation négative
empêche de conserver une précaution lorsque le résultat négatif a été vérifié de
façon indépendante. Les champs d'échec produits par le worker ne suffisent pas :
ils sont des données de l'événement, pas une attestation.

## Décision

Ajouter une voie distincte `negativeOutcomeEvidence`, limitée à `AGENT_FAILED`,
`AGENT_RUNTIME_ERROR` et `WORKER_TASK_FAILED`. Elle doit être signée par un
vérificateur indépendant de confiance, déclarer exactement `success: false` et
`value: 0`, lier l'ID du run, l'agent et le tenant, et signer le hash canonique de
l'événement terminal ainsi que son type. Une altération de l'échec après signature
invalide la preuve.

Après persistance de l'événement dans le reçu biologique du worker, un store
idempotent conserve le couple événement/preuve avec leurs hashes et la portée
mission/tenant. Toute lecture revalide l'intégrité, la signature, l'affectation du
worker, le statut terminal et la présence de l'événement dans le reçu. Les entrées
sont injectées dans le contexte sous forme de pièges `FAILURE`; le texte de cause
fourni par le worker n'est pas promu en règle ni recopié dans la mémoire.

Cette voie ne crée jamais `qualityEvidence`, de récompense positive, de verdict de
promotion ou de preuve d'exactitude. Sans attestation négative valide, le résultat
reste indisponible pour la mémoire négative.

## Conséquences

### Positives

- Une issue négative vérifiée survit aux redémarrages et aux retries sans double
  consolidation.
- Les précautions restent isolées par agent, organisation et projet.
- Les expériences négatives ne peuvent pas se faire passer pour une réussite ni
  influer sur les portes de promotion positive.

### Négatives

- Aucun nouvel apprentissage négatif n'a lieu tant qu'un vérificateur indépendant
  ne signe pas le type d'issue et le hash canonique de l'événement.
- Les runs workers plus anciens sans événement terminal lié au reçu restent
  exclus de cette mémoire.

## Alternatives

- Convertir `AGENT_FAILED` en `qualityEvidence: { success: false }` : rejeté, car
  cela réutiliserait le contrat de preuve positive sans séparer la promotion et la
  consolidation négative.
- Mémoriser le texte d'échec fourni par le worker : rejeté, car le worker pourrait
  transformer une explication non vérifiée en précaution durable.
- Réutiliser l'oracle d'acceptation de complétion : rejeté, car sa preuve est
  définie pour accepter un résultat terminé, pas pour attester une issue négative.
