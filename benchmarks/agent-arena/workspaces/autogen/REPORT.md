## Rapport technique

**Approche :**
- Implémenté la fonction `measure_latency` pour mesurer la latence en utilisant `std::time::{Duration, Instant}`.
- Ajouté des tests unitaires pour `measure_latency` et `bench_10k` pour valider les fonctionnalités et la performance.

**Choix :**
- Utilisation de `Instant` et `Duration` pour mesurer la latence avec une précision élevée.
- Tests unitaires pour s'assurer que la fonctionnalité fonctionne correctement et que la latence reste inférieure à 1ms.

**Trade-offs :**
- La précision des mesures de latence dépend de l'implémentation du timer sur le système d'exploitation.
- Les tests unitaires peuvent introduire un overhead minimal mais sont essentiels pour maintenir la qualité du code.

**Mesures :**
- Tous les tests se sont exécutés avec succès, confirmant que la latence moyenne est inférieure à 1ms.
