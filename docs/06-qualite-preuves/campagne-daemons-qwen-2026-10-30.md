# Qualification des daemons avec Qwen — 30 octobre 2026

## Résultat mesuré

Les douze missions du corpus territorial ont été exécutées dans les trois bras,
via `genos-orchestrate.cjs` puis le vrai dispatch, le runtime et Qwen. La révision
exécutée est `6b36768f36eb893e9a40dff7e4671620a987df0d` ; son checkout sur D: est propre.
Le modèle est `qwen2.5-coder:7b`, identifié aussi par son digest dans les artefacts.

**La correction du transport et la reprise du daemon sont prouvées. La
qualification fonctionnelle des missions n'est pas acquise.** Un candidat correct
au contrôle externe ne remplace jamais une acceptation sémantique GenOS.

| Bras | Missions retenues | Acceptées par GenOS | Au moins un candidat conforme aux contrôles objectifs | Appels Qwen | Tokens mesurés |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 12 | 0 | 1 | 25 | 50982 |
| B | 12 | 0 | 2 | 25 | 41567 |
| C | 12 | 0 | 3 | 25 | 55256 |

Les contrôles objectifs exigent le résultat au format demandé, ou un patch réel
avec tests indépendants. Un texte non structuré ne peut pas être déclaré correct
automatiquement. Les contraintes formelles d'un poème ne mesurent pas sa valeur
esthétique ; l'appréciation artistique et les images sonores restent à évaluer.

## Protocole et corrections

- A : worker GenOS et snapshot des sources, sans résident.
- B : même chemin, avec inventaire neutre supplémentaire ; volume de tokens non apparié.
- C : même chemin, avec daemon résident réel, indexation du HEAD, annonce et brief consommé.
- Chaque mission et chaque bras dispose de sa base SQLite et de son clone Git.
  L'ordre des bras tourne entre les missions. Il n'y a qu'une répétition par bras.
- Aucun contrat déterministe n'est injecté pour remplacer la génération Qwen.
  Aucun gate de preuve, bail, plafond ou confinement n'a été désactivé.

Les champs `readOnlyWorkspaceEvidence`, `executionDeadlineAt` et le mode worker
survivent au constructeur, au bootstrap et à la file de reprise. La classification
utilise l'identité persistée et non le mot `orchestrator` dans le nom de l'agent.
Le brief direct passe par le pont territorial existant, sans territoire de repli.
La dépendance navigateur est chargée à l'ouverture du navigateur : son absence
ne bloque plus le chargement d'un outil MCP sans navigateur.

Une erreur du protocole initial a été corrigée : `python tests/acceptance.py`
était refusé par la politique globale. Les six essais des missions 03 et 11 sont
conservés dans leurs dossiers d'origine ; six exécutions supplémentaires avec
`pytest`, déjà autorisé, les remplacent dans le tableau. Le sandbox est inchangé.
Un précontrôle vérifie que les tests échouent sur chaque fixture non corrigée.

## Détail des douze missions

| Mission | A | B | C |
| --- | --- | --- | --- |
| 01-math | refus / non qualifié | refus / non qualifié | refus / non qualifié |
| 02-data | refus / non qualifié | refus / non qualifié | refus / non qualifié |
| 03-code | refus / non qualifié | candidat conforme / gate refusée | candidat conforme / gate refusée |
| 04-logs | refus / non qualifié | refus / non qualifié | refus / non qualifié |
| 05-science | refus / non qualifié | refus / non qualifié | refus / non qualifié |
| 06-contract | refus / non qualifié | refus / non qualifié | refus / non qualifié |
| 07-health | refus / non qualifié | refus / non qualifié | refus / non qualifié |
| 08-music | refus / non qualifié | refus / non qualifié | refus / non qualifié |
| 09-art | refus / non qualifié | refus / non qualifié | refus / non qualifié |
| 10-history | refus / non qualifié | refus / non qualifié | candidat conforme / gate refusée |
| 11-audit | candidat conforme / gate refusée | candidat conforme / gate refusée | candidat conforme / gate refusée |
| 12-dossier | refus / non qualifié | refus / non qualifié | refus / non qualifié |

## Reprise après arrêt brutal

Le daemon de la mission 12 est arrêté avec `SIGKILL` après son bootstrap. Un
événement réel est journalisé pendant son absence. Le harnais attend l'expiration
réelle du bail, puis relance la même identité. Le contrôle Python vérifie le nouveau
fencing token, la nouvelle incarnation, l'avancement du curseur et les horodatages.
Résultat indépendant : **PASS**.
La première lecture, après seulement 2,5 secondes, voyait encore le curseur à 0
et le harnais a conservé `passed: false`. L'observation persistée finale le voit
à 2, avec l'événement émis pendant l'arrêt effectivement consommé. Les deux
observations sont conservées ; le contrôle indépendant utilise cette observation
finale et ne remplace pas le reçu initial. Le harnais de réutilisation attend
désormais aussi le message d'activation du nouveau processus.
Ce test porte sur le daemon et son journal ; il ne prouve pas la reprise d'une
inférence Qwen interrompue au milieu de sa génération.

## Contrôles indépendants et preuves

Le vérificateur Python n'importe pas GenOS et ne demande aucun jugement à Qwen.
Il recalcule les partitions, les statistiques, les positions des logs, les défauts
de données synthétiques, les durées musicales et l'historique Git. Pour les patches,
il contrôle les fichiers immuables, le diff autorisé et exécute les tests séparément.
Le palindrome subit aussi 512 entrées générées avec une graine fixe, comparées
à une normalisation indépendante ; l'audit recalcule directement le CSV.
Il recalcule aussi les hashes chaînés et les HMAC du journal avec la clé protégée
par DPAPI. Ses autotests rejettent des réponses mutées et un journal altéré.
Cette vérification séparée est exécutée par le même opérateur ; ce n'est pas une
certification par un tiers.

Le dossier `D:/GenOS-runs/daemon-final-6c78b83ab-20261030` contient :

- `campaign-checks.json` : révision, arbre Git, compteurs, champs durables et états daemons ;
- `results.json` et `*/independent-checks.json` : contrôles par mission et tentative ;
- `*/payload.json`, `http-*.request.json`, `http-*.response.json` : échanges bruts ;
- `*/genos.sqlite`, `database-evidence.json`, `authority-checks.json` : runs, gates et reçus ;
- `12-dossier/C/crash-recovery.json` : preuve d'arrêt et de reprise avec horodatages ;
- `runtime-source.tar`, scripts du protocole et `manifest-sha256.json` : reproduction et intégrité.

Les exécutables Ollama, modèles, workspaces, bases et artefacts sont sur D:.
Node et les dépendances existantes peuvent être lus sur C: ; `backend/node_modules`
est une jonction explicitement conservée et non une réinstallation sur D:.

## Échecs et limites

Le résultat `ORACLE_DOMAIN_UNAVAILABLE` reflète l'absence de contrat/méthode
attestable pour plusieurs résultats génériques. Le runtime refuse donc même un
candidat éventuellement juste : ce refus n'est pas une perte de champs.
Les sorties Qwen contiennent aussi des valeurs fausses, des consignes recopiées,
des formats non conformes et des réponses `unresolved`. Les échanges bruts permettent
de séparer ces causes. Une empreinte de source valide ne rend pas une affirmation vraie.

Une panne de reprise subsiste : `genos_replay` est appelé avec l'argument `basic`,
refusé par le CLI effectivement résolu (`Usage: genos.exe replay --agent-id ...`).
Les 19 échecs d'outil correspondants sont conservés dans `workflow-failures.json`.
Le chargement du registre est corrigé ; la compatibilité du protocole de replay
reste à corriger. Cela interdit de présenter toute la chaîne de reprise comme qualifiée.

La comparaison n'établit aucune amélioration causale due aux daemons : un essai par
bras et un contrôle B non apparié en tokens ne le permettent pas.

Les dix tests ciblés sortent avec le code 0 ; leur journal conserve un avertissement
asynchrone de fermeture SQLite. `cargo test --workspace` est passé sur le checkout
de développement C:. `npm test` échoue encore sur
`test_biological_worker_restart.js:36` (clôture refusée). Le gate global de la
révision finale signale 185 violations, dont 182 hors baseline. Les gates de commit
ont accepté les corrections ciblées sans nouvelle violation. La suite globale
n'est donc pas verte ; aucune qualification complète n'est revendiquée.

## Commits de correction

- `7374b3e44` : contexte direct, champs d'exécution et classification du worker ;
- `0bb44e975` : échéance commune aux reprises durables ;
- `6c78b83ab` : admission effective et budget réel de l'orphelinat ;
- `6b36768f3` : registre MCP utilisable sans dépendance navigateur.
