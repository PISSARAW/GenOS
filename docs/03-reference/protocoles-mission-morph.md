# MORPH sur les transitions natives de mission

Le branchement se trouve dans `morphogenesis/authorizedTransitionExecution.js`,
après l'admission native Rust et avant `runApplying`. Il est automatique pour
une mission effectivement présente dans `missions`. Il conserve les contrôles
de tenant, de principal, de snapshot, d'hystérésis, de signature et de plan du
pipeline natif. Aucun résultat fourni par le client n'est accepté comme preuve.

## Profil effectivement intégré

Le profil initial coordonne les changements entre les huit topologies du
contrat MORPH et les actions natives `rebind`. Il refuse les augmentations de
capabilities, `budgetPatch`, `spawn`, `retire` et les actions de génome. Ces
dernières auraient besoin d'adaptateurs d'effets et de reprise supplémentaires ;
un reçu local ne les rend pas automatiquement sûres.

L'effet est réel : `runApplying` modifie les rôles et relations du graphe
collectif, applique sa migration de topologie, produit son commit AgentGit et
persiste `collective_state`. La coordination MORPH conditionne cet appel ;
elle n'est pas seulement un journal écrit après la mutation.

## Autorité et décision

Les adaptateurs `morphNative`, `morphValues`, `morphTransition` et `morphRecovery`
emploient les vraies classes `MorphCoordinator` et `MorphParticipant`.
`PROPOSE → QUIESCE → CHECKPOINT → PREPARE → READY → COMMIT` précède l'application.
Le coordinateur conserve sa décision irrévocable dans sa DB avant l'appel natif.
Le participant consulte cette décision directement pour accepter COMMIT ; le
contenu d'un message ou un simple hash ne remplace pas cette lecture.

Le roster contient **un seul endpoint d'exécution natif local**. Ce profil ne
fabrique pas un quorum de workers : la quiescence des agents est celle contrôlée
par le snapshot natif. Les autres membres du graphe sont des membres du snapshot,
pas des participants ayant envoyé un ACK réseau. Le reçu READY est réellement
persisté par ce participant et relu par le coordinateur.

Chaque contrôle confronte l'admission aux vraies lignes
`morphogenesis_transition_snapshots`, au tenant et au principal. Le plan et le
snapshot doivent conserver leurs hashes exacts, et l'autorité doit rester
valide. La prévision d'état vérifie aussi les lignes d'agents, les membres,
la topologie et l'état collectif effectivement persisté. Une dérive après
admission refuse la mutation.

## Conservation et application

Le snapshot protocolaire conserve la topologie, les membres et les tâches
natives connues. Le checkpoint natif complet reste conservé comme evidence
de départ : leases, budgets, checkpoints de processus, références de fichiers,
genomes et état collectif y restent présents. Ces données opaques ne sont pas
converties en nouveaux droits ou en quantités de tokens supposées.

Ce profil ne transfère ni budget ni tâche entre propriétaires. Une nouvelle
transition conserve les records précédents ; une modification externe de
roster ou de topologie exige une nouvelle frontière d'admission plutôt qu'une
normalisation silencieuse. Le lien du plan protocolaire au plan natif et au
snapshot courant est inclus dans son identifiant de transition. Le binding
natif complet est conservé séparément avant la décision durable.

L'appel natif et son CAS de source sont sérialisés par le mutex de la vraie
connexion SQLite. Le callback de commit natif est vérifié avant et après son
attente. La transaction native termine **avant** toute déclaration APPLIED.
La vérification finale exige le statut natif `committed`, le graphe en mémoire
et le graphe SQL exactement attendus, y compris rôle, parent, topologie et
version. Le participant applique alors la version cible ; FINALIZE relit ses
vrais reçus et l'état natif.

## Échec et reprise

Un refus avant COMMIT peut restaurer le checkpoint natif préparé. Après COMMIT,
un échec natif ou une déconnexion du participant devient `recovery_required`.
Une compensation native éventuellement confirmée reste décrite comme telle ;
elle n'efface pas la décision MORPH et ne produit pas FINALIZE.

`morphRecovery.resume({db,req,snapshotId})` est une API interne de récupération.
Elle exige le même tenant et principal, une application native déjà committée,
le binding durable exact et une autorité encore valide. Elle relit le vrai
graphe et termine les ACK ; elle ne redispatche pas la transition native.
L'expiration de l'autorité initiale n'est pas contournée : au-delà de cette
échéance, une réadmission de récupération distincte est nécessaire.

Si RECOVERY_REQUIRED ne peut lui-même être journalisé, par exemple après
expiration, la réponse conserve `recorded:false` et sa raison. La décision
COMMIT déjà durable demeure consultable ; aucun rollback protocolaire n'est
prétendu. Les DB de conversation et d'effet sont distinctes : ce mécanisme
constitue une reprise locale explicite, pas une transaction distribuée ni un
consensus entre machines.

## Vérification

```text
node backend/tests/test_mission_protocols_morph.js
node backend/tests/test_mission_protocols_morph_recovery.js
node backend/tests/test_mission_protocols_morph_guards.js
```

Les tests exécutent le CLI Rust réel avec une clé de test éphémère, un vrai
workspace, le pipeline natif, AgentGit et les DB SQLite. Ils couvrent la mutation
persistée, le refus d'autorité manquante, la dérive de source après admission,
la coupure entre commit natif et ACK, la reprise sans nouveau commit, et une
compensation native qui conserve la décision MORPH irrévocable.
