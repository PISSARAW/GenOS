# Audit de la mission « Le Dernier Sas » — 2026-11-03

- Périmètre : parcours Node A-Team, workspace `D:\scenario-court-metrage`.
- Révision de départ : `3a39a383f93655113bed58d90c949bddc291e152` avec modifications locales préexistantes.
- Sources : lecture SQLite en mode read-only, événements réels des workers,
  payloads, services de dispatch et évaluateurs. Les tests synthétiques sont
  distingués de la mission réelle.

## Résultat livré le 4 novembre

La mission `ateam_e7bc26a41280d55703ffd09fdc63d3bd` a terminé avec
`completion.success: true`. L'auteur et le dramaturge sont des workers natifs
terminés, avec couverture vérifiée 2/2 et transmission acceptée. Les lectures
indépendantes GQEL ont validé les onze critères du contrat, dont les trois
contrôles supplémentaires de continuité. Le lecteur GLM a passé ses contrôles
de calibration ; les producteurs utilisent Gemma dans des exécutions distinctes.

Le fichier `D:\scenario-court-metrage\LE_DERNIER_SAS.md` contient six scènes,
1 855 mots utiles selon GQEL, 1 937 unités séparées par des espaces dans le
fichier complet, et un score de 80/100. Sa taille relue est de 12 122 octets.
Le SHA-256 relu correspond à l'artefact final signé :
`a3eac5680aa945e41c971d1a056c3cb7df1ff2f0fb400383ddde8a18bf97a6f3`.
Le reçu de qualité source est
`gqel-46f9f7e54cb4a94f03e1e27d91450ac5ab7b68ace83044c0fdcfab721adb92c6`.

L'auteur a consommé 59 851 jetons mesurés sur 100 000 autorisés, après refus
d'un premier texte de 1 285 mots puis acceptation de 1 782 mots utiles. Le
dramaturge a consommé 36 194 jetons sur 100 000 ; sa version finale a été
acceptée dès la première lecture. Les deux oracles natifs sont acceptés avec
deux sous-processus chacun. Les deux replays `basic` ont recalculé et vérifié
la genèse et la trace de mémoire chaînée du snapshot, sans nouvelle inférence.
Ce replay ne constitue pas une nouvelle mesure de la qualité dramaturgique.

Une reprise réelle a authentifié de nouveau le reçu signé et la ligne durable,
refait la livraison idempotente puis relu le même SHA-256. Les preuves et
trajectoires sont conservées dans
`D:\GenOS-runs\screenplay-repair-20261103\validation-finale.json`, avec le
run canonique dans `team-state-final.json` et le reçu authentifié dans
`verified-final-delivery.json`. La durée de vingt minutes reste une cible de
jeu évaluée à la lecture ; aucune durée filmée ou répétée n'est prétendue mesurée.

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

## Vérification

Les tests ciblés vérifient propagation native, refus d'un titre ou résumé,
absence de dialogues, métadonnées préservées, identités de handoff inventées,
publication liée aux octets, idempotence et refus d'écrasement.
Les suites GQEL existantes testent aussi les revues fabriquées, citations
absentes, budgets, annulation et rejeu. Leurs réponses modèles sont synthétiques.
Les 25 tests de la suite qualité ont réussi, ainsi que les tests ciblés des
contrats natifs, des vingt types de workers, de leur incarnation et des plafonds
canoniques. Le contrôle complet de qualité a vérifié 8 824 fichiers avec zéro
violation nouvelle. `cargo test --workspace` a terminé avec le code 0 le
4 novembre, après reconstruction du binaire courant : 1 194 tests Rust réussis,
zéro échec. `npm test` a également terminé avec le code 0, jusqu'aux quatorze
suites de composition d'inventaire. `git diff --check` a terminé avec le code 0.
Les journaux complets sont conservés dans le dossier externe de qualification :
`code-quality-final.log`, `quality-suite-final.log`, `cargo-test-final-nov4.log`
et `npm-test-qualified.log`.

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

## Qualification complémentaire et reprise du 4 novembre

| Essai | Observation réelle | Traitement |
| --- | --- | --- |
| v5 — `ateam_7998abf3708cbafb70363a79e5bfdec1` | Révision de 1 121 vers 1 720 mots ; continuité des équipements refusée, puis réponse de forme invalide. | Brouillon conservé sans publication ; schéma complet rappelé aussi après les instructions de réparation. |
| v6 — `ateam_8d9176fc984b20f75aced4c8c5b28d0a` | Erreur de syntaxe dans un fichier modifié simultanément. | Syntaxe corrigée ; retrait du remplissage automatique des acquittements positifs. Une transmission absente reste refusée. |
| v7 — `ateam_8439995a37c079162d70f4ea017c15c9` | Auteur terminé : 1 894 mots, GQEL et oracle natif acceptés. Critique arrêté avant inférence pour dépassement de la fenêtre de contexte. | Fenêtre configurée à 65 536 jetons, dans les limites du fournisseur ; budgets collectifs conservés. |
| v8 — `ateam_9596cbc539a94b56e16355faf95f14e1` | Auteur terminé : 2 010 mots. Critique terminé. Dramaturge refusé : métadonnées créatives manquantes et duplication du scénario. | Une seule représentation canonique du texte : le schéma créatif natif interdit `artifactText` et exige toujours hypothèses, test proposé et provenance. |

Les critères d'acceptation des producteurs créatifs sont désormais dérivés des
contrôles indépendants authentifiés et cités du reçu GQEL, pour les identifiants
exactement couverts. Un critère absent reste `null`, même si le modèle l'avait
auto-déclaré satisfait. Le rapport conserve cette déclaration originale pour
audit. Les évaluations des handoffs restent produites par le consommateur ;
aucun acquittement positif ni contrainte générique n'est inventé.

L'auteur v7 a aussi produit huit reçus OMEGA, un dossier EVIDENCE durable et une
attestation native acceptée avec deux sous-processus. Ces observations attestent
le parcours exécuté ; elles ne constituent pas l'activation de tous les concepts
du catalogue. Le plan de morphogenèse conservé est une proposition pour une
topologie simple, sans preuve d'une restructuration adaptative exécutée.

La reprise du 4 novembre a rencontré un disque C: plein, provoquant des erreurs
SQLite. Les artefacts non suivis de l'ancienne campagne du 17 octobre ont été
déplacés vers `D:\GenOS-storage\archived-runs`, avec conservation de leur chemin
par jonction. Les nouveaux temporaires de qualification sont placés sur D:.
Une première exécution de `npm test` a également révélé un `GENOS_BIN` pointant
sur une ancienne installation dépourvue de la commande `genome` ; la vérification
doit utiliser le binaire reconstruit depuis le dépôt.

Les 24 tests de la suite qualité ont réussi après cette reprise, dont les tests
du pont d'oracle isolé, des critères signés et de la publication liée aux octets.
La relance v9 est enregistrée sous `ateam_88ac3363f835fcfb5a0485a40993a7af`.
Sa clôture et la livraison restent à constater avant toute revendication finale.

L'essai v9 a finalement produit un scénario GQEL accepté de 2 136 mots,
après correction d'un défaut de rythme. Sa clôture native a correctement refusé
67 083 jetons mesurés contre un plafond de worker à 40 000, malgré une allocation
d'équipe à 100 000. Le plafond de qualité créative est maintenant explicite et
borné ; l'allocation traverse aussi l'incarnation persistée et le dispatch CLI.
Les tests refusent toujours un dépassement cumulatif de l'allocation.

L'essai v10 (`ateam_e98e850f690ea9fd262e8ceeacec7dc2`) a atteint la clôture
collective `success: true` avec trois membres terminés et une couverture vérifiée
de 3/3. Son scénario a été exporté, puis l'enregistrement du reçu a rencontré un
conflit de révision : le débrief avait avancé l'état. La correction relit le run,
revérifie l'artefact signé et conserve les champs du débrief lors d'une reprise
bornée. La reprise réelle a enregistré le reçu et vérifié le SHA-256
`a7663d2c8381e815f2220ae18a641fb4e8589c907d10fb06616e3692931b4b72`.

La relecture humaine du texte v10 a cependant identifié une contradiction de
chronologie et une frontière de contamination insuffisamment établie, malgré
la revue automatique favorable. Cela démontre la limite du lecteur unique et
du contrat initial : une signature authentifie une évaluation bornée, pas une
vérité esthétique ou physique universelle. Le texte signé v10 est archivé dans
le dossier externe de qualification. Une note de relecture factuelle et trois
critères durs supplémentaires imposent à la relance v11 une nouvelle rédaction
et de nouvelles revues : chronologie, frontière propre/sale et continuité des
équipements. Aucun reçu v10 ne vaut validation de la nouvelle version.

Les essais v11 et v12 ont été arrêtés avant toute inférence par la vérification
canonique du contrat. Le premier révélait l'absence de l'allocation de qualité
dans la reconstruction du contrat ; le second révélait que le temps global du
parent avait été transmis comme plafond du worker. L'allocation de jetons est
maintenant gelée dans `mission.qualityTokenAllocation`, contrôlée à l'admission,
et la propagation des jetons conserve les plafonds locaux de temps/CPU. Les
tests passent aussi pour une allocation d'équipe d'une heure et un worker
limité à trente minutes ; une augmentation forgée ou une allocation effacée
est refusée. L'essai v13 a effectivement démarré son auteur avec un budget
natif de 100 000 jetons et 1 800 000 ms.

L'auteur v13 a été refusé à 1 270 mots, puis accepté à 1 766 mots utiles.
Le critique intermédiaire a pourtant déclaré le texte trop court sans comptage
chiffré et a produit un verdict `reject`, refusé par sa clôture native. Le
handoff contient bien les 11 115 caractères du candidat révisé : aucun résumé
ni ancien candidat n'a remplacé la version sélectionnée. Ce refus n'est pas
converti en succès. La formation v14 conserve deux producteurs créatifs natifs,
auteur puis dramaturge, chacun soumis aux lecteurs indépendants et aux boucles
de réparation GQEL. Cette configuration emploie une critique consommable par
le cycle créatif plutôt qu'un certificat générique d'acceptation intermédiaire.
Le seuil de complétude est renforcé à 1 600 mots utiles ; tous les critères
durs de continuité et la validation finale restent obligatoires. Le brouillon
ancien est archivé pour éviter la recopie de ses défauts ; la rédaction repart
du brief et de la note de relecture.
