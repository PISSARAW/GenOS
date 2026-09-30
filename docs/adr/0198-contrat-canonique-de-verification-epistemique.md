# Contrat canonique de vérification épistémique

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Épistémologie, vérification, promotion
- **Décideurs** : GenOS
- **Lié à** : ADR 0036

## Contexte

AEIS dispose déjà d'adaptateurs d'exécution et de reçus HMAC, mais leurs objets
internes ne constituent pas un contrat stable commun pour les claims, les plans,
les reçus et les décisions de promotion. Un modèle ne doit pas pouvoir déclarer
sa propre sortie correcte.

## Décision

Ajouter une façade canonique au-dessus des reçus AEIS existants. Elle normalise
Claim, VerificationPlan, VerificationReceipt et PromotionDecision sans remplacer
les preuves signées. Une normalisation n'est utilisable que si le reçu AEIS est
signé, de confiance, lié au claim et à son digest d'évidence. La promotion exige
les seuils du plan et l'indépendance requise; une réfutation la bloque. Le modèle
peut proposer un plan, mais `llmWasJudge` reste toujours `false`.

Les classes de vérification servent à ordonner les vérificateurs disponibles;
elles ne déclarent pas que Lean, Z3 ou un autre outil spécialisé est installé.
Les types LLM-jugement sont exclus du plan exécutable.

## Conséquences

### Positives

- Les consommateurs disposent d'un contrat commun sans perdre la provenance AEIS.
- Les reçus invalides ou non liés deviennent indisponibles et ne peuvent promouvoir.

### Négatives

- Le digest d'évidence doit être fourni au claim pour accepter les reçus AEIS.
- Cette façade ne fournit pas à elle seule de nouveaux solveurs ni adaptateurs de domaine.

## Alternatives

- Remplacer le format de reçu signé AEIS : rejeté, car cela invaliderait la chaîne
  de confiance existante sans apporter de vérificateur supplémentaire.
- Laisser le modèle juger ses propres résultats : rejeté, car cela confond proposition
  et preuve.
