# Audit de complétude des concepts GenOS — 12 octobre 2026

Référence examinée : `f2e9161e` avec les modifications non commitées déjà présentes dans le checkout partagé. L'inventaire source est la pièce `Texte collé.txt` jointe à la demande. Trois agents ont audité les sections 1–19 en parallèle ; les sections 20–23 et les ajouts ont été examinés dans le même checkout. Les fichiers de travail préexistants n'ont pas été modifiés pour cet audit.

## Résultat et navigation

| Périmètre | Entrées de l'inventaire | Complètes selon les cinq critères | Matrice |
| --- | ---: | ---: | --- |
| Principes, biologie, génome, épistémologie, cognition, mémoire, coordination (1–7) | 214 | 0 | [audit 1–7](audit-concepts-01-07.md) |
| Créativité, physique, orchestration, topologies, organisations, capacités, workers et cycle (8–15) | 205 | 0 | [audit 8–15](audit-concepts-08-15.md) |
| Biomimétisme spécialisé, AEIS, nosologie et philosophie (16–19) | 131 | 5 | [audit 16–19](audit-concepts-16-19.md) |
| Interfaces, sécurité, exploitation et invariant central (20–23) | 88 | 3 | [audit 20–23](audit-concepts-20-23.md) |
| **Total des lignes de l'inventaire** | **638** | **8** | |
| Concepts absents ajoutés | 14 | 0 | [ajouts](audit-concepts-absents.md) |

Les 638 lignes ne représentent pas 638 notions uniques : l'inventaire répète notamment provenance, quorum, réplication, release et plusieurs termes philosophiques dans des sections différentes. Les doublons ont été conservés pour que chaque entrée fournie reçoive un verdict. Les 14 ajouts sont des concepts ou contrats explicitement documentés dans le dépôt ; cette extension n'affirme pas que tous les mots techniques du dépôt ont été inventoriés.

## Règle de décision

Une entrée est **complète** uniquement si, pour une même portée d'usage, elle est **implémentée**, **vérifiée par une exécution probante**, **démontrée par un scénario rejouable avec résultat observable**, **utilisable via une surface raccordée** et **documentée**. Les matrices indiquent `O`/`o` (oui), `P`/`p` (partiel), `N`/`n` (non) ou `?` (preuve non établie). Un test seulement présent, un catalogue, une API déclarative, un succès de transport ou une démonstration simulée ne satisfont pas automatiquement les cinq critères. Les statuts sont bornés par les limites indiquées dans chaque ligne ; ils ne sont pas des certificats de production.

Les huit lignes complètes sont : antigène épistémique, immunité adaptative, reçus AEIS, assemblées AEIS, non-promotion d'une analyse philosophique, API REST, SQLite WAL et authentification. Pour les trois dernières, la portée est celle des parcours HTTP/SQLite réellement exécutés dans `backend/tests/test_backend.js`, pas chaque route, protocole ou déploiement.

## Lacunes transversales qui empêchent une complétude plus large

1. **Chaînes intégrées insuffisamment démontrées.** Beaucoup de mécanismes ont du code, des contrats et des tests unitaires, mais aucun parcours ne relie encore entrée réelle, décision, effet, observation indépendante et reprise pour toute la portée annoncée. Le [contrat produit](../03-reference/contrat-produit-et-completude.md) avertit explicitement que la matrice topologique est déclarative.
2. **Portée expérimentale.** La navigation web, les sens animaux, plusieurs organisations dynamiques, la créativité et la philosophie s'appuient sur des simulations, fixtures ou services interprétatifs. Une analogie biologique ou philosophique ne prouve pas une capacité incarnée ni une vérité scientifique.
3. **Vérification du checkout incomplète ou négative.** Le scénario NCE a d'abord échoué dans le sandbox à `test_nce_workflows_e2e.js:111`, puis a passé hors sandbox sous Node 22. La qualification des workers échoue hors sandbox sous Node 24 (`medical_worker`) et Node 22 (`verifier_worker`) avec `ORACLE_BUDGET_EXPIRED` ; la cause précise reste à isoler. Les erreurs d'environnement ne sont pas requalifiées en défauts produit, et les échecs actuels ne sont pas maquillés en réussite.
4. **Frontières de production encore ouvertes.** L'isolation du worker local n'est pas une sandbox forte ; la haute disponibilité multi-nœud, la conformité réglementaire complète, la rétention légale des preuves et l'exhaustivité des scopes/permissions ne sont pas démontrées. Voir [sécurité](../05-securite-gouvernance/sandbox-execution-code.md) et [observabilité](../04-exploitation/observabilite.md).

## Priorités de qualification

1. Définir, pour chaque concept qui doit devenir une capacité produit, une portée précise et un contrat d'acceptation avec cas nominal, refus, budget, autorité et persistance.
2. Rejouer les scénarios de mission sur les surfaces réelles, enregistrer la commande, la version, les entrées, les reçus et le résultat externe vérifié. Couvrir en priorité les topologies, les 19 workers, la qualification du but de mission et la chaîne de promotion.
3. Isoler l'expiration du budget d'oracle des workers sur le checkout actuel, puis étendre les scénarios NCE et navigateur dans un environnement où les processus et workspaces sont autorisés. Comparer les résultats aux qualifications historiques sans les promouvoir automatiquement.
4. Maintenir cette matrice au niveau de la preuve par concept : une nouvelle entrée ou un changement de code ne passe à `O` qu'après vérification et démonstration sur la même portée.

## Vérifications de cette revue

`python scripts/ci/check_code_quality.py` : code 0 à deux reprises ; dernier passage 5 969 fichiers vérifiés, 8 violations historiques, 0 nouvelle. `npm test` lancé dans le sandbox : biologie 7/7, puis arrêt `EPERM realpath` dans `.genos-agent-worlds` ; le test ciblé de liaison de workspace passe hors sandbox. `npm test` relancé hors sandbox sous Node 24.18.0 : biologie 7/7, workspace PASS, backend 57/57, AEIS 41 suites et benchmark PASS, Syncytium 48 suites PASS, Axolotl 8 suites PASS, Biome 22 programmes PASS, daemon 43/43 PASS, capsules et OTLP PASS ; arrêt final au test natif `medical_worker` (`ORACLE_BUDGET_EXPIRED`). Le test natif relancé isolément sous Node 22.23.3 échoue sur `verifier_worker` avec le même code. Le scénario `test_nce_workflows_e2e.js` passe hors sandbox sous Node 22. `cargo test --workspace` : code 0 hors sandbox ; son premier essai dans le sandbox avait échoué sur la canonicalisation du chemin du dépôt. Les autres tests ciblés et leurs résultats sont listés dans chaque matrice.
