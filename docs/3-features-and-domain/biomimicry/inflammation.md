# Inflammation & Fièvre — Mode Dégradé

> **Concept** : Hausse de température et restriction locale pour confiner une infection.
> **Statut** : implémenté (genos-core::biomimicry::inflammation)

## Bénéfice
Face à une menace (ex: prompt injection massive), l'essaim se met en "Fièvre Systémique". Il limite de lui-même les accès disques, ralentit les rate-limits pour éviter les dépassements de budget, et confine les agents touchés. La fièvre redescend (esolve_over_time) une fois l'incident passé.
