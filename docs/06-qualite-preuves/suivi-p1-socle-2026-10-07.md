# Suivi du socle P1 — 2026-10-07

- **Statut** : P1 démarré ; première extension L01 intégrée et qualifiée sur fixtures ; L01 reste partiel.
- **Portée** : L01 à L05 et L22, après clôture P0 au périmètre convenu.
- **Dernière revue** : 2026-10-07.

## Source et critères

Le [programme de réalisation](https://chatgpt.com/space/page_f582a574b6d4819182c266e9d429d922)
fixe le chemin L00 → L01 → L02 → L03/L04 → L05 ; L22 dépend de L01 et L02.
La Page a été relue au démarrage. Sa note P0 du 6 octobre est historique ; la
[clôture locale P0](audit-p0-concepts-2026-10-06.md) et les rapports du 7 octobre
conservent les preuves ultérieures. Les six niveaux spécifié, implémenté,
intégré, qualifié, évalué et répliqué restent distincts.

| Lot | État de lancement | Travail suivant nécessaire |
| --- | --- | --- |
| L01 Contrats et provenance | Première extension GVX intégrée et qualifiée sur fixtures ; lot partiel | Relier les missions générales et les reçus existants ; lifecycle des claims et rétractations ; compatibilité des autres consommateurs. |
| L02 Autorité et confinement | Contrats existants qualifiés par P0 ; extension P1 à entreprendre | Enveloppe commune liée au manifeste, révocation pendant le run, limites spawn/délégation et refus hors scope. |
| L03 Oracles indépendants | Composants AEIS/Lean et pilotes existants ; intégration P1 à entreprendre | Postconditions métier, fraîcheur, domaine et résolution vérifiée des références du manifeste. |
| L04 Mondes et replay | Snapshots et reprises bornées existants ; extension P1 à entreprendre | Branches appariées, journal d'interventions, aléas épinglés, recherche de fuites et bisection causale. |
| L05 Harnais et baselines | Pilotes P0 exploratoires disponibles ; campagne P1 à entreprendre | Runner GVX raccordé au manifeste, holdout inaccessible au candidat, coûts complets et puissance adaptée. |
| L22 Interfaces et observabilité | Clients de référence P0 qualifiés ; extension P1 à entreprendre | Inspection commune du manifeste, des coûts, preuves, rejets et reprises ; parité sémantique ciblée. |

## Première extension L01

L'[ADR 0349](../adr/0349-manifeste-experimental-gvx-et-provenance-p1.md)
étend `gvxExperimentProtocol` et le journal de développement existant. Le
manifeste `genos.gvx.experiment-manifest/v1` relie mission, run, claims,
hypothèses, interventions, versions, lignage, budgets et références d'artefacts
et de reçus. Les claims rejetés ou rétractés restent présents. Les déclarations
initiales ne peuvent pas porter un statut de vérification ou de support acquis.

Le plan v2 est persisté avant l'exécution des bras du nursery GVX. Sa clôture
refuse les changements de plan, de scope, de candidat et la rétrogradation vers
v1. Les résultats référencent son hash. Les plans anciens conservent leur
format et se lisent `legacy_unlinked` ; ils ne reçoivent aucune liaison fictive.

Le lecteur `readExperimentManifest(db, query)` prend `experimentId`, `scope`
et `entityId`. Il renvoie `linked`, `legacy_unlinked` ou null en absence de
plan dans ce scope. Le statut `linked` qualifie les relations et leur intégrité,
pas la vérité des claims ou une autorisation de promotion.

## Vérifications et limites

Exécuter `npm --prefix backend run test:p1-socle` pour les sondes L01 :
relecture dans un nouveau processus, altération de manifeste et de SQLite,
références inconnues, claims `verified` refusés, rejeu d'admission, changement
de plan, rétrogradation, scope étranger, succès sans preuve, migration
idempotente, compatibilité v1 et reprise du nursery.

Les quatre suites existantes `test_gvx_experiment_protocol`,
`test_gvx_experimental_nursery`, `test_gvx_development_ledger` et
`test_gvx_standard_cycle` passent après cette extension. Les sondes L01
passent également ; leurs bases sont temporaires et `.env` est désactivé.
La validation globale native termine également avec succès :

- `python scripts/ci/check_code_quality.py` : 5 387 fichiers, quatre violations
  historiques admises, **0 nouvelle**, code 0.
- `npm test` : code 0, avec découverte effective de `test:p1-socle`. Un poll
  après fermeture SQLite produit un avertissement dans la suite Garage,
  qui termine avec succès ; il reste conservé dans le journal.
- `cargo test --workspace` : **673 tests réussis, 80 suites, 0 ignoré**, code 0 ;
  compilation sur D: avec debug/PDB désactivé.
- Index ADR : 426 fichiers et lignes, zéro problème.

Les journaux, copie du programme, empreintes et `validation-summary.json` restent
hors Git sous
`C:/Users/Shadow/.codex/visualizations/2026/10/06/01a11128-3c02-7882-a146-5b1ec06e3434/p1-l01`.
L'état partagé inclut des changements d'autres travaux ; les fichiers propres
à L01 ont leurs empreintes capturées après validation, sans prétendre à un
snapshot atomique du dépôt entier.

Les versions, parents, artefacts et reçus sont des références déclarées,
avec hashes ; leur existence et leurs postconditions ne sont pas attestées
par le manifeste. Les tests du nursery utilisent un vérificateur réel
d'intégrité sur des bytes de fixture, sans oracle de succès métier ni modèle.
La reprise conserve un bras déjà committé ; aucun effet externe exactement
une fois n'est revendiqué. L01 complet, P1 complet et gain IA restent ouverts.

## Traçabilité du lancement

GenOS a fourni le checkpoint `snap-a7d8f742186b41f18d02828f1ba16d1b`, dont le
fichier local a été observé, et la décision
`decision-fd091459-c12e-467c-ab5f-2de1259005fa`. Les échecs connus ont été
relus, notamment succès de transport sans mission attestée et contexte mémoire
suffisant sans retrieval. La persistance de ces traces ne valide pas les tests.

L'expérience `196f20f6-4057-40b3-8a98-0a5141aebc2d` a été enregistrée avec
les validations exécutées et les limites de cette extension.
