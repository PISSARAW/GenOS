# Composition de l'inventaire : P0, P1 et P2

Le plan d'audit du 2 novembre 2026 est traduit en trois lots. Les fonctions
introduites sont vérifiées dans leurs périmètres ci-dessous. Une campagne LLM
comparative et une qualification métier générale restent à exécuter séparément.

| Lot | Raccord livré | Vérification reproductible |
| --- | --- | --- |
| P0 | Clé canonique versionnée, alias normalisés, espace de noms contrôlé | `node backend/tests/test_inventory_p0.cjs` |
| P0 | Cinq niveaux explicites, sans déduire une qualification du catalogue | Même test ; `publication` et `lifecycle` des résolutions canoniques |
| P0 | Obligations A-Team consommées et checkpointées dans GQEL natif | Même test et suites GQEL natives |
| P1 | Profils AGOW/GNS/GQWF/ETT et dépendances | `node backend/tests/test_inventory_p1.cjs` |
| P1 | Observation, consolidation avant rappel, décision ultérieure | `node backend/tests/test_inventory_learning_loop.cjs` |
| P1 | Vingt organisations Node/Rust, champs comparés intégralement | `node backend/tests/test_organization_catalog_parity.cjs` ; `cargo test -p genos-orchestrator --test organization` |
| P1 | Transitions : leases signées, ressources, communication, compensation | Suites de transitions incluses dans `npm run test:inventory-composition` |
| P1 | Témoin, composition complète et ablations à plafonds égaux | `compositionCampaign.run` ; sonde synthétique dans `test_inventory_p1.cjs` |
| P2 | Compteurs dérivés des registres et tests philosophiques actualisés | `npm run docs:inventory:check` ; suite de composition |

## Résolution et niveaux de preuve

`resolveConceptReferences` retourne une clé `namespace:id@1`. Les objets
`{ id, namespace, version }` permettent de refuser une mauvaise version ou un
espace de noms incompatible. Une chaîne ancienne reste acceptée. Cette version
décrit le contrat de publication ; elle ne remplace pas les versions métier des
services ou leurs digests de preuve.

`lifecycle` sépare `declared`, `implemented`, `connected`, `activated` et
`qualified`. `null` signifie « inconnu dans ce périmètre ». Le catalogue ne
dispose pas de reçus de mission et laisse les trois derniers inconnus.
`available` et `executable` conservent leur contrat technique historique ; aucun
de ces champs n'accorde une autorité. Les adaptateurs biologiques et
philosophiques ne prouvent pas les propriétés décrites par leurs métaphores.

## Profils publiés

| Profil | AGOW | GNS | GQWF mission | ETT résident |
| --- | --- | --- | --- | --- |
| `observe` | `shadow` | activé en configuration | non requis | non requis |
| `bounded` | `bounded` | activé en configuration | requis | non requis |
| `resident` | `bounded` | activé en configuration | requis | requis |

`npm run activation:profile -- resident` imprime le profil et son diagnostic.
Le CLI seul ne fournit pas de base ni les fonctions du scheduler ; il retourne
donc le code 2. L'hôte peut appeler `activationProfiles.inspect` avec sa base,
son workspace enregistré et ses dépendances ETT. Le résultat contrôle des
prérequis, pas une activation ni une permission d'action. Le champ
`durableDatabase` est une attestation de l'hôte, pas une sonde de stockage.
Les sous-politiques AGOW, les autorisations GNS et les gates GQWF restent propres
à leurs mécanismes et sont revérifiées lors des effets réels.

## Réparation et mémoire

Une demande `genos.quality-repair-request/v1` doit nommer des critères du contrat
GQEL courant et une tentative bornée à 1 ou 2. Le contrôleur conserve son digest
et son plan avant génération. Les budgets, juges, tests protégés et reçus natifs
restent nécessaires. La validation GQEL n'est pas une promotion de mission.

Le rappel consolide au plus 50 épisodes dans le périmètre de l'agent courant.
Les seuils existants déterminent les leçons ; une observation seule ne devient
pas un résultat appris. `consolidate: false` permet le témoin. La sonde mesure
une décision ultérieure différente sur une politique déterministe et ne démontre
pas une réduction générale des défauts ou du coût des missions.

## Comparaisons reproductibles

`compositionCampaign.run({ components, seeds, budget, execute, verify })`
produit le témoin sans composants, la composition complète puis chaque retrait.
Chaque appel reçoit les mêmes plafonds `budget: { tokens, calls }`. L'ordre est
inversé pour les graines impaires. Le vérificateur doit retourner
`{ passed, artifactDigest, evidenceRefs }` pour l'artefact exact.

L'exécutant doit isoler son état et mesurer/imposer son budget réel. Le protocole
contrôle l'admission des usages après exécution. Une paire hors budget ou en
erreur n'entre pas dans le delta ; sans paire valide le delta vaut `null`.
Le champ `promotionEligible` reste faux. Les sondes actuelles sont synthétiques :
aucun gain général d'AGOW, GNS, GQWF ou ETT n'en est déduit. Une campagne réelle
doit définir corpus, exécutants isolés, reçus d'usage, vérification indépendante
et analyse des erreurs avant toute conclusion.

## Commandes de contrôle

```powershell
npm run test:inventory-composition
cargo test -p genos-orchestrator --test organization
npm run docs:inventory
npm run docs:inventory:check
python scripts/ci/check_code_quality.py
npm test
cargo test --workspace
```

Les compteurs sont dans [l'inventaire technique](../03-reference/inventaire-technique.md).
Décisions : [ADR 0766](../adr/0766-composition-inventaire-preuves.md) et
[ADR 0767](../adr/0767-profils-activation-et-comparaisons-bornees.md).
