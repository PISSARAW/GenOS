# Migration du catalogue AgentDNA vers Hachimoji — 2026-11-04

## Périmètre et protocole

Le catalogue initial comprend 227 fichiers `agents/dna/**/*.dna` au format v1,
tous non signés, ainsi que sept manifestes sans binaire : le daemon résident et
six profils de sécurité. La révision historique de référence est
`c31132799b29dfd6aae7e5f267323b0bc271df85`.

Les 227 fichiers sont transcodés depuis leurs instructions binaires historiques,
sans recompilation de leurs manifestes. Les sept autres sont compilés depuis
leurs manifestes versionnés. Les candidats sont préparés à part, qualifiés, puis
installés aux chemins canoniques. Les originaux restent dans Git et dans l'archive
locale de préparation, hors du répertoire auto-importé.

Le reçu [agentDnaHachimojiQualification.json](../../shared/agentDnaHachimojiQualification.json)
lie chaque source à sa nouvelle empreinte et à une empreinte sémantique. Il porte
les sorties des six programmes de preuve, leurs codes de retour et leur digest.
Sa portée est `encoding-equivalence`, avec `authorizesPromotion: false` et
`cognitiveImprovementDemonstrated: false`.

Empreinte du reçu courant :
`91fce57a9be82425a886a002cd076d8460c2a0bf61b0ec317bc7e29ae51c15a9`.
Le renouvellement a réexécuté les six programmes après normalisation des fins de
ligne du code dans l'empreinte des sources. Les empreintes des fichiers ADN
restent calculées sur leurs octets exacts.

## Contrôles exécutés

- Vérification des sources historiques dans Git, des empreintes physiques,
  des instructions et des états de régulation avant/après pour les 227 paires.
- Validation des 234 fichiers par le CLI Rust réel et le décodeur Node ; parité
  des empreintes et des séquences ; trois bits par base pour tous les brins.
- Conservation des rôles, outils, capacités, objectifs, température, `topP`,
  silençage, réseaux de régulation, plasmides et cicatrices des anciens binaires.
- Nouvelle identité, parent historique et lignée conservée ; statut `DRAFT` ;
  aucune reprise d'une sélection ou d'une promotion liée à l'ancienne empreinte.
- Idempotence, refus de fichier corrompu, de changement d'instruction et de preuve
  absente ou périmée ; refus de migration implicite de sources signées/scellées.
- Politique stricte de signature toujours bloquante ; les tests d'innovation
  confirment qu'une affirmation de preuve ne suffit pas à autoriser une promotion.
- Comparaison de l'expression de `LocalCodeWorker` : prompt, outils effectifs,
  réglages et empreinte de l'autorité exprimée identiques avant/après.

Les six programmes exécutés sont `test_hachimoji_catalog.cjs`,
`test_hachimoji_migration.cjs`, `test_hachimoji_runtime.cjs`,
`test_worker_genome_execution.cjs`, `test_genome_policy.js` et
`test_genome_innovation.js`, dans `backend/tests/`.

## ADN migré de LocalCodeWorker

Fichier : [local_code_worker.dna](../../agents/dna/integration/local_code_worker.dna).
Format : `AgentDNA/v2`, alphabet `ACGTPZBS`, trois bits par base.

```text
Chromosome maternel :
GTABSZPTTAGBBCATTTBBGCPZGZBBSZBGTGBBGZBGCBPSTZZSTPPBZZPZTPP

ROLE        TZBBSZBGTGBBGZBG                            → worker
MODEL_TEMP  CPAGSABPCZG                                 → 0.45
STRATEGY    TZASCCPZTCGGBZBTTCGBAZBGTABBPA               → tree-search
```

Le chromosome encode `LocalCodeWorker:worker`. Les instructions opérationnelles
restent portées par les gènes, notamment `OBJECTIVE_PRIMARY` : appliquer un patch
`genos.file-replacement/v1`, lancer les tests autorisés et revenir en arrière en
cas d'échec. La stratégie est une consigne transmise au modèle ; cette valeur ne
déclenche pas à elle seule un algorithme de recherche.

| Champ | Avant | Après |
| --- | --- | --- |
| Identité | `87abc603-5f5f-4a95-8403-e3c981a96603` | `19247964-1dee-406f-9d82-eaf085c7f1ba` |
| Génération | 0 | 1 |
| Empreinte | `e8e9292a033141dd6a8cbc805cc6af45157c5c7b9b9395dbd480413284474ad1` | `f5a1c593b8976e051839f98808739702e1848dfb7fd8d62798dbccc201053be4` |
| Température / topP | 0.45 / 0.9 | 0.45 / 0.9 |
| Outils du génome | diff, evidence_check, sandbox_exec, test | Identiques |

Une mission autorisant `genos_test`, `genos_sandbox_exec`, `genos_inspect` et
`genos_snapshot` conserve seulement les deux premiers après expression de ce
génome. Le runtime impose cette intersection ; les gènes ne donnent aucune
permission supplémentaire.

## Validation globale

| Vérification exécutée | Code de retour | Résultat |
| --- | --- | --- |
| Qualification dédiée et renouvellement | 0 | Six programmes sur six, 234 génomes qualifiés |
| `npm test` | 0 | Suite racine complète, jusqu'à l'inventaire final 14/14 |
| `cargo test --workspace` | 0 | 1 196 tests réussis, aucun échec ni test ignoré, 149 groupes |
| `python scripts/ci/check_code_quality.py` | 0 | 8 853 sources, aucune violation |
| `python scripts/ci/check_adr_index.py` | 0 | 930 fichiers et 930 lignes d'index |

La suite biologique incluse dans `npm test` réussit 11 cas sur 11. Les sorties
GQEL de progression indiquent explicitement des réponses de modèles synthétiques ;
elles ne sont pas utilisées pour revendiquer une amélioration cognitive.

## Limites

Il s'agit d'une migration de représentation et d'une qualification technique
bornée, sans démonstration d'amélioration cognitive. Les exigences de signature,
les leases, les budgets et les qualifications de mission continuent de s'appliquer.
Le daemon charge son binaire qualifié et expose sa liaison ; ses transitions
déterministes ne sont pas remplacées par une interprétation libre des gènes.

La base locale `backend/genos.db` inspectée en lecture seule ne contient aucune
ligne `agent_genomes`. Aucun état d'agent actif ni génome de tenant n'est réécrit.
Une autre installation déjà peuplée doit migrer ses copies et requalifier ses
attestations selon ses propres politiques, sans reprendre les anciennes signatures.

La décision est décrite dans l'[ADR 0788](../adr/0788-migration-catalogue-hachimoji-sous-preuves.md).
