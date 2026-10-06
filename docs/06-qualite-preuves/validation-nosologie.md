# Validation de la nosologie computationnelle

Date : 2026-10-06. Périmètre : catalogue des 28 conditions, neuf familles, 48 contrats de marqueurs et 59 variantes SystemicTherapy.

## Résultats observés

| Vérification | Résultat |
|---|---|
| cargo test -p genos-biology --lib --tests --jobs 1 | 97 réussis : 78 existants, 12 tests de catalogue et 7 régressions. |
| cargo test --workspace --test nosology_authorization --offline --jobs 1 | 4 réussis : application durable, absence de cible, refus, signature/contexte invalide, restauration et idempotence. |
| node backend/tests/test_nosology_catalog.js | Réussi : types connus, paramètres normalisés et rejet des clés inconnues ou héritées. |
| node backend/tests/test_clinical_authorization.js | Réussi : autorisations explicites signées, liées à la cible et non expirées. |
| node scripts/docs/generate-nosology-catalog.mjs --check | Réussi : document synchronisé avec shared/nosology.json. |
| python scripts/ci/check_adr_index.py | Réussi sur le dossier courant : 384 fichiers, 384 lignes, aucun problème. |
| Hooks des commits de code | Réussis : 15 puis 8 fichiers source vérifiés, aucune violation ni dette nouvelle. Blocs Receipt vérifiés. |
| cargo test --workspace --bin genos commands::biomimicry::therapy::tests --offline --jobs 1 | 2 réussis : parsing des variantes et paramètres, absence de succès sans exécution. |
| Parcours HTTP → Rust → journal après redémarrage | Non validé : compilation de l’exemple interrompue par les limites de ressources et de génération des symboles Windows. |

Les tests Rust de biologie ont été exécutés dans une cible isolée avec symboles de débogage et compilation incrémentale désactivés. Le test d'autorisation a été exécuté avec les features du workspace, qui activent la feature api requise. Les commandes équivalentes de reproduction figurent dans le catalogue runtime.

## Contrôles globaux du dépôt

- python scripts/ci/check_code_quality.py : rejet du workspace courant, 341 violations dont 191 nouvelles par rapport à la baseline. Elles concernent des fichiers hors de cette implémentation. Aucune baseline ni règle n'a été modifiée pour obtenir un passage.
- npm test : échec de test_syncytium_speculation.js (SYNCYTIUM_OPERATION_ID_CONFLICT) et test_syncytium_speculative_variant.js (syncytium.history n'est pas une fonction). Les phases backend de base, autorité et AEIS ont passé; cet échec ne constitue pas une validation globale du dépôt.
- cargo test --workspace --jobs 2 : compilation interrompue par saturation du disque (ENOSPC dans futures-util et dépendances). Aucun succès global n'est déclaré.

Les anciens symboles de débogage, caches incrémentaux inactifs et exécutables de tests régénérables de target/debug ont été nettoyés pour poursuivre. Aucun reçu, base de données ou fichier source n'a été supprimé.

## Corrections vérifiées

- Dose nulle sans retrait de diagnostic; inflammation invalide refusée.
- Purge limitée à la signature demandée; isolement maintenu tant qu'un diagnostic subsiste et levé après résolution du dernier diagnostic ciblé.
- Mesures absentes ou invalides sans rémission annoncée; absence de cible distincte du refus et de l'application.
- Effet de marqueur rapporté avant/après et persisté avant mise à jour mémoire; rejeu sans nouvelle mutation.
- Effets secondaires de marqueur conservés tant que leur risque persiste; remplacement des cicatrices sans rémission fictive d'une mémoire prionique.

Ces résultats portent sur les contrats logiciels. Les scénarios ne valident aucune pathologie réelle.
