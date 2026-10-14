# ADR 0494 — Scoper la mémoire de requête au workspace

- **Statut** : Accepté et implémenté pour `bestKnownResultService`.
- **Date** : 2026-10-15
- **Domaine** : Cache de résultats, semantic ID et isolation des workspaces.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0492, promotion des résultats provisoires ; ADR 0493, snapshot complet des dépendances.

## Contexte

La table `request_problems` utilisait uniquement le `semanticId` produit depuis
la demande. Deux workspaces avec la même question partageaient le même
`request_problems` et le même champion, y compris son contenu et ses références
d'évidence. Le schéma ne portait pas de scope tenant.

## Décision

Toutes les opérations `bestKnownResultService` exigent un `scopeId` stable,
représentant le workspace ou le tenant autorisé. Le service dérive un identifiant
opaque par hachage SHA-256 de `scopeId` et du `semanticId`, puis utilise cette
clé pour la recherche, la version et la promotion du champion. L'identité
canonique d'origine demeure dans le dossier d'appel, hors de cette clé.

## Conséquences

### Positives

- Une demande de même contenu dans deux workspaces ne partage ni résultat ni
  champion.
- Une réutilisation sans scope échoue avant de lire une entrée.
- La clé en base n'expose pas directement le `semanticId` ou le scope.

### Négatives

- Les consommateurs doivent obtenir le scope depuis leur autorité de mission
  avant d'appeler le service; le service ne résout pas cette autorité lui-même.
- Les entrées historiques indexées par `semanticId` brut ne sont pas migrées
  automatiquement vers les clés scoped et ne sont pas réutilisables par cette
  API.

## Alternatives

- Garder un cache global pour les demandes identiques : rejeté, car le résultat
  peut contenir du contenu propre au workspace.
- Filtrer seulement au moment de la lecture par argument utilisateur : rejeté,
  car l'argument n'est pas une autorité et les mises à jour de champion restent
  partagées.
