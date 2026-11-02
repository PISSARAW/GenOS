# ADR — GQEL : reçus de qualité durables liés à l’exécution

- **Date** : 2026-11-02
- **Statut** : implémenté ; tests locaux à évaluateurs synthétiques
- **Portée** : émission, persistance et contrôle d’un résultat GQEL de worker Node.js

## Contexte

Le contrôleur worker conservait la preuve de qualité dans une `WeakMap`, indexée
par l’objet JavaScript du worker. Une reconstruction de cet objet ou un autre
processus perdait cette preuve. Accepter le simple JSON d’une évaluation aurait
permis de fabriquer un verdict positif. Le `WeakSet` des évaluations effectivement
émises reste donc nécessaire au moment de l’émission initiale.

## Décision

`qualityReceiptService.issueQualityReceipt` exige un résultat GQEL promu localement,
une évaluation finale effectivement émise par le runtime, un comptage de consommation
complet, le contrat exact du worker et une autorité d’exécution active vérifiée par
`missionEnvelopeAuthority.assertRun`.

Le reçu lie l’identité du worker, la mission, le run, l’empreinte de l’autorité,
le contrat de qualité, l’artefact livré, l’évaluation complète et l’empreinte de la
session. Les identités, modèles et groupes de dépendance des lecteurs sont conservés
dans cette évaluation. La signature HMAC réutilise la clé du ledger GVX déjà requise
par l’autorité d’exécution ; aucune clé par défaut n’est introduite.

Les tables SQLite `gqel_quality_receipts` et `gqel_quality_checkpoints` conservent le
reçu, la session et les checkpoints signés. Une même séquence ne peut être réécrite
par cette API avec un contenu différent. Une même exécution et un même contrat ne
peuvent recevoir deux résultats contradictoires. Une altération du contenu stocké
est détectée à la relecture.

Le rapport de worker transporte `qualityElevationReceipt`. Le contrôle synchrone
vérifie sa signature et les empreintes contre l’artefact réellement remis. L’identité
du run doit venir du contexte du worker ou de l’événement de dossier, et non du
reçu lui-même. Un conflit entre ces deux contextes est refusé. Un worker enregistré
ne peut plus satisfaire ce contrôle grâce à la seule `WeakMap` locale.

Lorsque le runtime fournit un artefact typé, le reçu lie aussi son type et son
contenu complet via `deliveryContentDigest`. Modifier les hypothèses, les références
ou les autres champs sans changer le texte candidat invalide donc également le reçu.
La provenance enrichie par les validateurs reste soumise à leurs contrôles propres.

Pour un worker logiciel, le code examiné et le dossier livré sont deux objets
distincts. Le runtime peut fournir une liaison `codeEvidence` : bundle exact des
sources, empreintes des fichiers et reçu des tests exécutés. Avant signature, le
service vérifie la ligne persistée du reçu de tests, ses identités mission/worker/run,
le succès des commandes, les fichiers changés, l’état courant du workspace et les
références du dossier à ces fichiers et à ces tests. Le reçu conserve séparément
`reviewedArtifactDigest` et `artifactDigest` avec cette liaison.

Le parcours natif conserve un ensemble fixe des fichiers sources de la première
tentative. Une révision changeant cet ensemble est refusée avant toute émission de
reçu : retirer un fichier du bundle ne permet pas de conserver silencieusement une
modification antérieure non relue. Le support d’ajout/suppression de fichiers exige
une future union des sujets et une revérification de l’état composite ; il n’est pas
déclaré acquis par ce raccord conservateur.

## Conséquences

- Un autre processus peut relire un reçu sans transformer un JSON arbitraire en
  évaluation de confiance ; le rechargement vérifie aussi l’autorité active.
- Un reçu ne peut autoriser une nouvelle livraison après l’expiration de sa lease.
- La signature seule ne renouvelle aucune autorité : les portes de révocation,
  de preuve native et de promotion de mission restent applicables.
- Le reçu déclare explicitement `authorizesMissionPromotion: false`.
- L’ancien chemin en mémoire reste disponible pour les appels de bibliothèque
  sans identité de worker enregistré ; il ne prouve aucune mission native.
- Les checkpoints signés permettent de conserver les échecs sans délivrer de reçu
  positif et sans rouvrir une session persistée comme autorisation.

## Vérification

`node backend/tests/test_gqel_quality_receipts.cjs` couvre la lecture depuis un
nouveau processus Node.js, la falsification, les changements d’artefact, les replays
entre workers/runs/missions/autorités, la révocation et les conflits de checkpoint.

`node backend/tests/test_gqel_code_receipts.cjs` exécute réellement un test Node.js
dans un workspace temporaire puis vérifie le lien entre source évaluée, dossier,
reçu des tests et workspace. Les lecteurs GQEL de ces deux suites sont synthétiques :
ces tests qualifient les mécanismes, pas un gain de qualité artistique ou logiciel.

`node backend/tests/test_gqel_native_receipts.cjs` traverse l’étape native
`runEvidenceStage` avec une véritable autorité scellée et SQLite. Seule la réponse
du fournisseur de modèle est synthétique : le routage natif, les checkpoints,
l’émission signée, la relecture persistante et la porte finale worker sont exécutés.

## Alternatives

Conserver uniquement la `WeakMap` ne permet pas de traverser un redémarrage.
Conserver uniquement un hash de JSON ne prouve pas son origine. Accepter un reçu
d’un autre run comme nouvelle autorisation permettrait un replay. Ces alternatives
sont écartées.
