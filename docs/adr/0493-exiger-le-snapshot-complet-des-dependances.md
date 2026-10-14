# ADR 0493 — Exiger le snapshot complet des dépendances

- **Statut** : Accepté et implémenté pour la réutilisation mémoire de requête.
- **Date** : 2026-10-15
- **Domaine** : Réutilisation des résultats, dépendances et invalidation de cache.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0492, transition de champion ; ADR 0480, rejeu lié au run.

## Contexte

`bestKnownResultService.depsChanged` comparait uniquement les clés envoyées par
le demandeur. Une clé omise n'invalidait pas le résultat; sans aucune clé,
l'ancien champion `VERIFIED` était considéré réutilisable même lorsque le
résultat stockait des dépendances. Les objets mal formés étaient aussi
interprétés comme des dépendances vides.

## Décision

La comparaison porte sur l'ensemble des clés et sur leurs valeurs structurées.
Une dépendance supprimée ou modifiée invalide le résultat. Si le résultat stocke
des dépendances et que le demandeur n'en fournit aucune photographie, le service
retourne un échec de réutilisation sans muter l'état du champion. Les cartes de
dépendances invalides, stockées ou fournies, échouent également en mode
fail-closed.

## Conséquences

### Positives

- Une réponse versionnée ne peut plus être réutilisée quand son environnement
  dépendant n'a pas été fourni au contrôle courant.
- L'ajout, le retrait et la modification d'une dépendance sont détectés.
- L'absence de photographie empêche la réutilisation sans détruire le champion,
  ce qui permet de réessayer avec les dépendances exactes.

### Négatives

- Les consommateurs doivent fournir la carte de dépendances complète; un
  contrôle partiel ne peut plus réutiliser le résultat.

## Alternatives

- Comparer uniquement les clés présentes dans la demande : rejeté, car une clé
  omise peut modifier le résultat sans invalider le cache.
- Marquer immédiatement le champion périmé quand les dépendances manquent :
  rejeté, car l'absence de photographie ne prouve pas que l'environnement a
  changé.
