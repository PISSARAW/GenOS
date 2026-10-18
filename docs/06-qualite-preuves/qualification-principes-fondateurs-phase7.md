# Qualification des principes fondateurs — phase 7

- **Date** : 2026-10-18
- **Baseline qualifiée** : `2e30d2bada1b64eeadc38a8cf7f3015f7da1129b`
- **Périmètre** : mission verticale des phases 1 à 6
- **Résultat** : 19/19 principes à la note 4 dans ce périmètre borné
- **Reçu** : [principes-fondateurs-phase7.json](receipts/principes-fondateurs-phase7.json)

## Sens de la note 4

La note 4 signifie ici : mécanisme intégré, preuve exécutée avec code de sortie
zéro, refus observable, documentation et limite explicite. Elle ne signifie ni
perfection, ni couverture universelle du monorepo, ni vérité scientifique d'une
métaphore. Le reçu porte donc `universalClaim: false` et
`authorizesPromotion: false`.

Le manifeste canonique est
[`shared/foundationalPrinciplesQualification.json`](../../shared/foundationalPrinciplesQualification.json).
Le gate recalcule les digests des sources, exige les neuf observations de test
et refuse une preuve manquante, un code non nul, une référence hors dépôt, une
limite absente ou la confusion entre concept, métaphore et capacité.

## Résultats par principe

| ID | Principe | Note | Preuve décisive | Limite conservée |
|---|---|:---:|---|---|
| F01 | Runtime d’agents reproductible et supervisé | 4 | Autorité v2 et replay causal | Pas de déterminisme garanti des providers externes |
| F02 | État versionné | 4 | Snapshots immuables et replay vérifié | Tous les stores historiques ne sont pas couverts |
| F03 | Exécution contrefactuelle | 4 | Candidat et perturbation depuis le même snapshot | Espace des perturbations non exhaustif |
| F04 | Branches, forks, snapshots, diffs et replay | 4 | Diff et deux replays liés au run | Effets externes non transactionnels non annulés |
| F05 | Preuve avant promotion | 4 | Dossier v2 exigé par le gate | Parcours de stratégie v2 uniquement |
| F06 | Succès technique distinct de la vérité | 4 | Replay réussi mais non promotable sans reçus | Pas de garantie de vérité universelle |
| F07 | Falsifiabilité et contre-exemples | 4 | Contre-exemple signé donnant un rejet | Famille de perturbations bornée |
| F08 | Provenance | 4 | Hashes d'autorité, états, replays et dossiers | Chaîne qualifiée sur ce parcours |
| F09 | Reçus vérifiables | 4 | Canonicalisation, HMAC et revalidation | Infrastructure de clés partagée |
| F10 | Décisions bornées | 4 | Acteur, run, workspace, délai et appels liés | Intégrations hors runtime exclues |
| F11 | Autorité explicite | 4 | Enveloppe signée et rotation invalidante | Legacy en lecture seule |
| F12 | Leases d’outils | 4 | Refus outil, délai, workspace et quota | Catalogue complet non rejoué |
| F13 | Budgets tokens, temps, CPU, spawn et délégation | 4 | Réservation, cumul, refus et rollback | CPU Rust et quota noyau universel ouverts |
| F14 | Isolation des workspaces | 4 | Racine réelle, cwd, env et capability liés | Pas de conteneur ni d'isolation réseau |
| F15 | Garde-fou fail-closed | 4 | Cas négatifs à chaque frontière qualifiée | Pas d'affirmation universelle |
| F16 | Évidence indépendante | 4 | Deux acteurs distincts, reçus signés, même diff | Indépendance matérielle non démontrée |
| F17 | Promotion, rejet, quarantaine et escalade | 4 | Quatre dispositions persistées et bornées | Effets post-décision propres au déploiement |
| F18 | Résilience et récupération | 4 | Quarantaine idempotente ou refus d'ambiguïté | Capsules Trinity uniquement |
| F19 | Concept, métaphore et capacité séparés | 4 | Champs distincts et mutation négative du gate | Prose historique non entièrement scannée |

## Commande et observations

Commande de qualification :

```powershell
node backend/tests/test_foundational_principles_qualification.js
```

Le 2026-10-18, les neuf tests référencés ont terminé avec code zéro. Le reçu
conserve leur digest de sortie, le hash du manifeste et un digest des sources
référencées. Les mutations négatives ont confirmé que le gate refuse une
observation absente ou en échec, une capacité sans limite et une confusion entre
concept et capacité.

Les gates globaux restent des observations séparées : `npm test` est bloqué dans
`test_gqwf_trinity_mission_qualification.js` par `INVALID_WORKER_ARTIFACT`, le
contrôle qualité global voit des violations concurrentes hors phase 7 et la
suite Rust complète est coûteuse à reconstruire dans `aws-lc-sys`. Aucun de ces
états n'est transformé en réussite par le reçu de qualification.
