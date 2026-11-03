# Audit de la mission « Le Dernier Sas » — 2026-11-03

- Périmètre : parcours Node A-Team, workspace `D:\scenario-court-metrage`.
- Révision de départ : `3a39a383f93655113bed58d90c949bddc291e152` avec modifications locales préexistantes.
- Sources : lecture SQLite en mode read-only, événements réels des workers,
  payloads, services de dispatch et évaluateurs. Les tests synthétiques sont
  distingués de la mission réelle.

## Constats vérifiés avant correction

Le run `ateam_4bac0a63b517962115cc7caa37d336ab` est `BLOCKED`. Son auteur
`worker_e075522b426b3a782ad90698ead5072e` a livré seulement « Le Dernier Sas ».
Le dramaturge `worker_b2eb6396e60cd79e82feacbc2a3b81b9` a produit 14 mots et
aucun `integrationConstraints`. Le critique final n'a pas été libéré.
Les refus persistés sont `WORKER_INTEGRATION_CONSTRAINT_MISSING` et
`GQEL_FINAL_ARTIFACT_MISSING`, avec clôture `success: false`.

Le run suivant `ateam_29523e109c80a3f37a1aace297ee3c56` a accepté un auteur
ayant produit 253 mots de résumé sans dialogues. Ses quatre critères sont
auto-déclarés satisfaits avec `mission` comme référence. L'état `completed`
de cet auteur n'atteste donc pas un scénario complet. Ce run a ensuite atteint
`BLOCKED`, avec un échec de l'observateur d'intégration.

Le correctif précédent du premier payload ne suffisait pas : `attachEnvelope`
et `buildWorkerMission` perdaient encore les handoffs et critères. De plus,
`screenplay` n'était pas un alias de l'évaluateur créatif. Seul le dernier
membre portait GQEL, alors que son type était `verifier_worker` : sa sortie
attendue était un rapport de vérification et non le texte du scénario.

## Concepts effectivement mobilisés

| Concept | Ancien parcours observé | Portée et correction |
| --- | --- | --- |
| A-Team et WorkGraph | Run canonique, dépendances et blocage observés | Conservés ; un terminal créatif doit intégrer les contributions. |
| Morphogenèse | Pas de preuve de passage au planificateur dans le dispatch direct | Activation explicite ajoutée, plan validé et conservé ; topologie simple A-Team, aucune revendication de composition ou adaptation exécutée. |
| Variantes d'organisation | `boundary_spanner`, contrats d'interfaces déclarés | La relance doit choisir une chaîne compatible avec des livraisons séquentielles. Une politique déclarée n'est pas sa validation. |
| Cellules, génomes et spécialisation | WorkerKinds, incarnation et méthodes persistées | Conservation du type et des contrats dans le run ; refus d'un critique vérificateur comme producteur du scénario. |
| Isolation et snapshots | Workspaces privés et snapshots de preuve référencés | Conservés ; aucun droit d'écriture global accordé aux modèles. |
| Budgets et Garage | Réservations, jetons, latence, places et exécutions persistés | Conservés ; chaque revue et réparation doit rester mesurée et bornée. |
| Autorité et leases | Enveloppes signées et identités des runs | Conservées ; aucun reçu historique ne vaut autorité courante. |
| Handoffs et communication | Producteur scellé, mais champs perdus chez le consommateur | Propagation sur les parcours direct et différé ; schéma local du rapport et validation exacte des reçus côté WorkGraph. |
| Oracle natif, AEIS et EVIDENCE | Domaine `worker_artifact`, vérifications de type et méthode | Leur portée est structurelle ; ils ne démontrent pas la qualité dramaturgique. Les portes ne sont pas abaissées. |
| GQEL | Contrat global seulement au terminal ; alias d'évaluateur manquant | Évaluateur créatif raccordé ; producteurs créatifs contrôlés avant transmission ; revues fraîches avec citations et reçus liés au contenu. |
| GVX, provenance et clôture | Événements, identité, preuves de run et verdict collectif | Conservés ; export subordonné à la clôture acceptée et à l'artefact final signé persisté. |
| Mémoire et apprentissage | Débriefs enregistrés même après refus | Recherche de mémoire négative et diagnostic de développement exécutés ; aucune mémoire n'est présentée comme preuve de réussite. |
| NCE — écologie créative | `executeRequestedAction` retourne avant `runOrchestratedMission`, qui appelle `applyNceEnhancements` | Le dispatch direct ne prouve pas l'exécution de NCE. Le nouveau parcours ne revendique pas de cycle écologique non observé. |
| AGOW et contrôle cognitif global | Des raccords existent dans la planification native de l'orchestrateur | Une commande A-Team directe n'est pas une campagne AGOW générale ; seuls les événements effectivement persistés constituent des observations. |
| Ontogenèse, SHEV, NSCP et ETT | Aucune boucle longitudinale ou recherche contrefactuelle dédiée prouvée pour cette commande | Une mission bornée de rédaction ne justifie pas d'activer artificiellement ces boucles. Leur absence est explicite. |
| GNS, homéostasie et reprise | Raccords présents dans le runtime | Présence du code distincte d'une régulation ou restructuration effectivement observée ; ne pas annoncer une activation générale. |
| Trinity, Biome, Syncytium, Rhizome, Holobionte, Biocénose, Métapopulation | Aucun run spécifique prouvé pour cette commande | Non requis simultanément pour ce scénario. Ne pas les déclarer exécutés parce qu'ils existent dans le registre. |

## Contrats de correction

Voir [ADR 0782](../adr/0782-livraison-scenario-sous-preuves.md). L'exigence de
dialogues est explicite, pour préserver les œuvres volontairement muettes.
Le minimum de mots est une borne de complétude commandée, pas une estimation
automatique de durée. Les lecteurs doivent encore juger la causalité, les
actions, la continuité, le dénouement et le rythme depuis le contenu lui-même.

L'export `finalArtifactOutput` refuse toute sortie sans qualité, tout changement
de destination après formation, les chemins sortants, symlinks et flux NTFS,
ainsi que l'écrasement d'un fichier différent. Son reçu contient le chemin,
le SHA-256 relu, la taille, le run collectif et le reçu GQEL source. Une reprise
du run terminé peut retenter la livraison sans régénérer ni remplacer le texte.

## Vérification en cours

Les tests ciblés vérifient propagation native, refus d'un titre ou résumé,
absence de dialogues, métadonnées préservées, identités de handoff inventées,
publication liée aux octets, idempotence et refus d'écrasement.
Les suites GQEL existantes testent aussi les revues fabriquées, citations
absentes, budgets, annulation et rejeu. Leurs réponses modèles sont synthétiques.
Les résultats des contrôles complets et de la relance réelle seront ajoutés
après observation ; aucun succès de mission n'est encore revendiqué ici.

## Incidents observés pendant la qualification réelle

La première relance corrigée (`ateam_d3b0b0d8113c7dcd2c71ac30388292b6`)
a été refusée sur le schéma générique de rapport. Le parseur des réponses
streamées utilisait ce schéma lorsqu'une enveloppe JSON nécessitait extraction,
malgré un contrat explicite différent. Il valide désormais l'objet extrait
contre le contrat demandé et ne complète aucun champ inventé.

La deuxième relance (`ateam_a45a437572ef8bfa1ad00fb74c2cfb3b`) a réussi
les quatre contrôles de calibration. Son premier brouillon comportait 1 210 mots.
La lecture réelle a consommé son plafond de 10 000 jetons et n'a pas fourni
une revue complète : le refus est conservé. Les erreurs natives de schéma
mesurées sont maintenant comptées et peuvent être réparées dans le budget
protocolaire ; les sorties tronquées restent terminales. Le niveau de
raisonnement du lecteur est une option explicite, normalisée et scellée dans
`qualityRuntime.reviewers`, afin de réserver de la sortie à la revue.

La troisième relance utilise `reasoningEffort: "low"` pour le lecteur GLM,
un auteur Gemma, les mêmes exigences artistiques et un critère supplémentaire
explicite `distinct_voices`. Elle ne récupère aucun reçu de réussite des essais
précédents et conserve un nouveau run, ses budgets et ses autorisations.

Ce troisième essai a été refusé pour omission d'`acceptanceEvaluations`.
L'exemple de schéma de base ajouté en dernier au prompt contredisait le
contrat A-Team plus complet. Le prompt se termine désormais par le contrat
effectif complet, partagé avec le validateur ; aucun champ de preuve manquant
n'est fabriqué par le runtime.

Le quatrième essai (`ateam_9b06196e35ee73018cd4d96e2c999433`) a démontré
une réparation réelle : 1 049 mots insuffisants, puis 1 526 mots en 7 scènes,
score GQEL 80 et aucun défaut selon le contrat et son lecteur. Il a ensuite
échoué dans l'oracle natif : le subprocessus isolé ne possède volontairement
pas la clé HMAC nécessaire à l'authentification du reçu GQEL. Le nouveau pont
vérifie le reçu durable côté contrôle puis transmet une attestation Ed25519
avec clé publique épinglée, liée au reçu, au worker et au run. Le test isolé
réel refuse absence de clé, signature ou run altérés, contenu modifié et
autre clé. Il vérifie aussi que le sandbox n'hérite pas du secret parent.

Ce refus a été conservé ; le brouillon GQEL n'a pas été publié comme scénario
collectif validé. La cinquième relance utilise des autorisations et lectures
fraîches avec ce raccord d'oracle, sans réutiliser l'attestation refusée.
