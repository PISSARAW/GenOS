# EVIDENCE dans les missions Rust

Le profil natif `integer_sum` admet une preuve uniquement depuis le résultat du
runner de processus installé localement. `ProcessEvidence` ne se désérialise pas
depuis un message ni depuis la sortie libre d'un worker. Le producteur et les deux
vérificateurs exécutent le calcul dans trois processus distincts. Leurs méthodes
de calcul sont configurées dans le programme Rust ; un client ne fournit pas de
code de vérification.

`mission_protocols::evidence::accept` vérifie l'identité du binding courant, la
source exacte, le résultat, le contexte, l'environnement, la politique et les
trois rôles. Les identifiants d'opération et les PID doivent être distincts. Les
sorties canoniques doivent concorder. Les phases locales `OFFER`, `CHALLENGE`,
`EVIDENCE`, `UPDATE` et l'acceptation sont écrites dans une même transaction
SQLite. Ces phases décrivent l'admission locale de la preuve ; elles ne prétendent
pas établir une conversation réseau avec trois autorités indépendantes.

Sous la transaction d'acceptation, les trois contextes SYNAPSE sont relus. Le
digest du tableau réellement envoyé à chaque processus doit correspondre au
tableau persistant, ainsi que le nombre d'éléments du résultat. Répéter un ancien
hash tout en changeant les valeurs du job ne permet pas de produire une preuve.
L'identité de chaque worker doit correspondre à son audience SYNAPSE native et au
membre du roster MORPH committé, sous la forme `run_id:role`. Trois rôles déclarés
par des jobs publics ne suffisent pas à créer trois acteurs autorisés.
Le prédicat optionnel `expected_sum` est relu depuis l'événement natif `ADMIT`,
dont le digest et la requête sont vérifiés contre le binding. Le remplacer par
`None` dans un appel à `ProcessEvidence::collect` ne supprime pas cette obligation.

Le SHA-256 du fichier source porte sur ses octets exacts. Il est distinct du
digest du tableau JSON décodé. L'acceptation lie aussi le digest complet du
binding : mission, incarnation, génération, workspace, requête, politique,
environnement et expiration. Une acceptation différente exige une révision
explicite ; elle ne remplace pas silencieusement une acceptation existante.

Avant la complétion ou la publication, `evidence::require` exige le sujet exact
`{source_hash,result_hash,context_hash}`, vérifie les digests persistés et contrôle
à nouveau le binding courant. L'exécuteur doit fournir ce sujet depuis sa source
et ses contextes courants, puis appliquer le CAS de publication sous le même
contrôle d'incarnation. Un reçu historique n'autorise aucune nouvelle action.
`require_in` permet d'effectuer ces contrôles dans la transaction du CAS final,
sans intervalle entre la validation du contexte et la mutation de la head.

Le pont historique `kernel_runtime_verifier` conserve sa portée : il vérifie les
reçus SQLite du runtime Node. `verified_report` refuse désormais un reçu d'un
autre objectif. Les textes de `Observations.worker_reports` restent des
hypothèses : contenir « evidence », « verified » ou « unverified » ne les transforme
pas en faits vérifiés.

Ce profil ne démontre que le calcul entier déclaré. La concordance de processus
distincts n'établit pas l'indépendance de leurs organisations, de leur code ou de
leur entraînement. Un hash assure l'intégrité d'un contenu ; l'autorité vient du
binding natif et de la frontière de confiance du runner, jamais du hash seul.
