# ADR 0046 — Routage minimal suffisant et mémoire des meilleurs résultats

## Statut

Accepté.

## Contexte

L'orchestrateur lançait systématiquement une machinerie lourde, même pour `2+2`.
La demande décrite exige : classifier avant d'exécuter, choisir le chemin minimal
suffisant, mémoriser le meilleur résultat connu et le réutiliser jusqu'à
invalidation ou amélioration réelle.

## Décision

1. Toute requête `orchestrate` passe par `requestProfilerService.profileRequest`,
   qui produit `RequestProfile` (intention, mode épistémique, environnement,
   complexité, vérification, temporalité, action, objectifs) et une
   `request_class` déterministe par heuristiques.
2. `executionRouterService.chooseExecutionPath` applique l'échelle
   `primitive -> procedure -> single_worker -> adaptive_worker -> specialists ->
   collective -> large_search` et ne monte que sur preuve (espace de recherche,
   parallélisme, solveur, revue indépendante, risque).
3. `bestKnownResultService` + migration `071-request-memory` persistent
   `request_problems` (population + champion) et `request_results`
   (`PROVISIONAL / VERIFIED / STALE / SUPERSEDED / REFUTED`, dépendances,
   horizon de validité, trajectoire d'exécution, utilité, coût).
4. `backend/bin/requestMemoryBridge.cjs` court-circuite `genos-orchestrate` :
   champion réutilisé si dépendances identiques et non expiré, primitive
   arithmétique exécutée sans worker, résultat de mission archivé en
   `PROVISIONAL` avec dette épistémique explicite.
5. Contrat d'échange : `spec/request-memory.schema.json`.

## Conséquences

- `2+2` ne crée aucun agent et retourne un reçu déterministe.
- Une question répétée retourne le champion sans recalcul.
- Un changement de dépendances (`repo_head`, horizon temporel) invalide en
   `STALE` au lieu de réutiliser silencieusement.
- La promotion d'un meilleur candidat passe par comparaison explicite et
   bascule l'ancien champion en `SUPERSEDED`, jamais par remplacement silencieux.
- Les classes non couvertes retombent sur `single_worker` : extension par
   composition, sans casser le routage existant.
