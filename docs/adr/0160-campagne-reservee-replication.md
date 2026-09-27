# ADR 0160 — Campagne réservée et réplication indépendante

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Réplication, campagnes réservées, rejouabilité
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/reservedReplicationCampaignService.js` (`buildManifest`, `summarize`, `finalizeCampaign`, `artifactHash`)
  - Tests : `../../backend/tests/test_reserved_replication_campaign.js`

## Contexte

Une campagne de réplication pouvait réutiliser corpus et seeds déjà touchés, écarter les résultats négatifs et conclure sans intervalle ni artefact rejouable.

## Décision

La campagne réservée exige un manifeste (protocole, hash, ≥ 2 seeds) et refuse toute contamination préalable (`RESERVED_CONTAMINATION` si corpus touché). Elle conserve les résultats négatifs, calcule un intervalle à 95 % (Wilson) et produit un hash d'artefact SHA-256 rejouable. Une campagne n'est complète que si chaque seed a un résultat (`replayable` seulement si total = seeds du manifeste).

## Conséquences

- Positives : contamination refusée par construction, négatifs conservés, incertitude quantifiée, artefact rejouable et vérifiable.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; intervalle de Wilson asymptotique, profil par défaut conventionnel.
- Neutres : le taux de succès compte les `success` ; `failed` et `inconclusive` alimentent les négatifs.

## Alternatives

- **Réplication sur corpus partagé** : rejetée — fuite entre entraînement et réplication.
- **Conclusion sans intervalle ni hash** : rejetée — résultat non rejouable, non vérifiable.
