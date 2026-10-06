# Audit P0 des concepts GenOS

- **Statut** : audit initial réalisé ; qualification des consommateurs et pilotes ouverte.
- **Portée** : 649 références du programme de recherche ; contrats, chemins candidats,
  baseline de tests et conditions d'entrée du socle P1.
- **Dernière revue** : 2026-10-06.

## Périmètre et méthode

L'[audit détaillé](https://chatgpt.com/space/page_631a0f45db2c8191aec6f1391eca8a15)
conserve les 649 références et leur affectation aux lots du
[programme](https://chatgpt.com/space/page_f582a574b6d4819182c266e9d429d922).
Elles correspondent à 617 clés canoniques distinctes ; 54 clés apparaissent
dans plusieurs contextes. Une même clé ne prouve pas l'équivalence des mécanismes.

La première collecte observe le checkout `474b345473f7add78539c8f2f82492500561bf7f`
avec des modifications locales préexistantes. Les empreintes de sources et journaux
restent dans le dossier local `p0-audit` associé à cette conversation ; ils ne sont
pas ajoutés au dépôt. La lecture n'est pas un snapshot atomique du checkout.

Le sondage de `canonicalConceptRegistry.resolveConceptReferences` utilise le
catalogue de capacités existant, sans exécuter les outils résolus. Les indicateurs
`available` et `executable` décrivent des contrats, pas les fonctionnalités de
recherche proposées. Les références littérales et imports fournissent des candidats
à lire ; leur présence ne prouve ni effet causal ni bénéfice empirique.

| État déclaré initial | Références |
| --- | ---: |
| Contrat exécutable | 287 |
| Contrat accessible | 190 |
| Conditionnel ou indisponible | 171 |
| Résolution absente | 1 |

L'entrée absente est MsgPack (`C576`). Le service
`backend/src/services/bioPolymerPersistenceService.js` utilise déjà `msgpackr` :
l'écart initial concerne le registre d'interfaces.

L'audit statique Node examine 2 484 services : 1 936 accessibles par imports
statiques, 261 classés `test-only`, 277 `unresolved` et 10 `dynamic-wiring`.
Ces catégories nécessitent une lecture des consommateurs avant toute décision
sur l'utilisation ou la suppression d'un module.

## Baseline exécutée

Environnement observé : Node 24.18.0, Rust et Cargo 1.97.1, Python embarqué 3.12.14.

| Commande | Résultat initial et limite |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Échec : 5 236 fichiers contrôlés, 299 violations dont 153 nouvelles ; baseline inchangée. |
| `npm test` | 55 assertions backend passent, puis arrêt sur `@biscuit-auth/biscuit-wasm` absent ; suites suivantes non exécutées. |
| `cargo test --workspace` | Échec de lien PDB `LNK1318 LIMIT (12)` sur `token_bucket` et `topology_transition` ; C: presque saturé. |
| Contrôles ciblés | 14 commandes sur 16 passent ; assertions fonctionnelles, sans comparaison scientifique. |

Les deux échecs ciblés attendent des raccourcis de provenance : tampon système
à partir d'un identifiant `seed-*`, et promotion avec le seul booléen
`independentVerification`. Le code actuel exige des attributs de vérification
pour la mémoire et un reçu vérifié pour la promotion. Leur correction doit
conserver les cas de refus et ajouter des preuves au cas positif.

Après l'échec Rust, seuls les deux PDB incomplets et les symboles de treize exemples
créés pendant cette compilation ont été retirés, sous `target/debug`, avec contrôle
des chemins et dates. Environ 2 Go ont été récupérés. Aucun succès de test Rust
n'est déduit de la compilation partielle.

Le premier appel de checkpoint GenOS a expiré sans fichier. Lors de la reprise P0,
un nouvel appel a réussi et son fichier a été observé. La persistance GenOS des
décisions et expériences demeure distincte de la vérification et de la promotion.

## Qualification à poursuivre

| Priorité | Travail | Critère observable |
| --- | --- | --- |
| B01 | Rétablir la dépendance Biscuit et exécuter la chaîne Node interrompue | Autorité et suites aval réellement exécutées. |
| B02 | Trier les 153 violations nouvelles sans relâcher la baseline | Corrections attribuables, puis gate sans nouvelle dette. |
| B03 | Aligner les deux tests de provenance | Raccourcis refusés, cas positif soutenu par preuve qualifiée. |
| B04 | Raccorder MsgPack et qualifier sa persistance | Référence résolue, aller-retour réel et entrée corrompue contrôlée. |
| B05 | Qualifier les pilotes code, mémoire et raisonnement vérifiable | Oracle réel, état initial épinglé, baseline et cas négatif. |
| B06 | Lire les consommateurs candidats, d'abord L01 à L05 et L22 | Parcours d'exécution identifié et effets relus. |
| B07 | Vérifier la reprise du checkpoint | Appel réussi et fichier relu ; acquis lors de la reprise. |

Les pilotes doivent séparer réussite fonctionnelle et amélioration comparative.
Un reçu signé garantit une provenance selon son contrat, pas la vérité de la tâche.
Le test de transfert GVX utilise un vérificateur injecté retournant `verified: true` ;
il qualifie le cycle sur fixture, pas un gain du receveur. Les campagnes GVX holdout
et les baselines MBH-like/Lipson-like restent à qualifier conformément au
[plan de puissance](../02-orchestration/plan-puissance-benchmark-gvx.md).

P0 conserve sa couverture complète et ses écarts ouverts. Sa clôture exige les
consommateurs qualifiés et les trois pilotes ; aucun gain de recherche ni passage
à P1 n'est annoncé par la seule couverture du catalogue.
