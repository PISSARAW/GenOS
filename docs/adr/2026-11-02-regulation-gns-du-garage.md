# Régulation GNS du Garage : mesure, autorité et effet vérifiable

## Contexte

Les raccordements GNS distribuent des observations et des propositions. Ils ne
fournissent pas encore un régulateur de ressources exécutant une réponse bornée
sur une mesure réelle et suivant son effet. Un transport terminé ou une baisse
de pression ne prouve pas une réparation métier.

## Décision

Le premier régulateur porte sur les nouvelles admissions du Garage. Il ne tue
aucun worker, ne suspend aucun processus et n'augmente aucun budget ou plafond.
Le scheduler existant du Garage appelle le régulateur à chaque tick. Lorsque
GNS est actif, il prélève dans SQLite capacité, occupation, nombre de requêtes
prêtes en attente et âge de la plus ancienne. La transaction source donne une
lecture cohérente. L'horodatage du prélèvement est conservé sans être remplacé
par celui d'une livraison ou d'un rejeu.

Les échantillons sont persistés dans le sidecar GNS avant leur projection. Les
échantillons non projetés sont rejoués ; la cadence minimale d'une seconde par
manager est vérifiée dans une transaction du journal, y compris entre processus.
Les sources natives portent leur propre référence `gns:garage-sample`, sans
fabriquer une référence à un événement de télémétrie inexistant. La couverture
mesurée concerne les compteurs du Garage, pas la santé globale de l'organisation.

Une prévision linéaire bornée utilise trois mesures croissantes, fraîches et de
capacité identique. Elle reste `PREDICTED_UNVERIFIED`, expire au terme de son
horizon et peut alimenter AGOW et les besoins morphogénétiques. Elle n'est pas
une pression effectivement mesurée. Une prévision ne commande rien par défaut.
Son usage pour inhiber des admissions exige `predictiveHold: true` dans la
politique signée et une demande effectivement en attente dans le Garage.

## Autorité

Deux activations sont distinctes : `GENOS_NERVOUS_ENABLED=1` pour observer,
`GENOS_NERVOUS_REGULATION=guarded` pour exécuter. Une politique explicite doit
être enrôlée sous la clé Ed25519 du mandat SHEV actif du projet. La signature
scelle organisation, projet, manager, acteur, limites, expiration et version
attendue. Le nonce est consommé avec la mise à jour de politique dans une
transaction source. La version augmente ; une clé remplacée ou un mandat révoqué
ne reconduit pas l'ancienne autorisation.

Avant l'effet, les contrôles d'autorité agent, Cedar, autorité de mission et
circuit breaker existants s'appliquent. Le signal doit correspondre à un
échantillon natif persisté et à son reçu GNS. Une simple déclaration de pression
dans la télémétrie ne suffit pas. L'acteur ne reçoit aucun pouvoir supplémentaire.

Le seul handler installé est `INHIBIT_DISPATCH`. Il ajoute une limite temporaire
dans la base source, liée à l'effet, au scope et à la version de politique.
Le point normal de réservation la contrôle transactionnellement. Il permet de
remplir à nouveau les places libérées en dessous de cette limite ; il ne gèle pas
toute admission jusqu'à la fin du délai. Le plafond Garage existant reste requis.
La limite expire au plus tard après 15 secondes et ne survit pas à sa politique.
Les requêtes différées restent en file plutôt que de devenir des échecs terminaux.

## Preuve et reprise

Le journal relie échantillon initial, effet, politique, refus d'admission et
échantillons suivants. Une installation terminée reste `EXECUTED_UNVERIFIED`.
Trois nouvelles mesures fraîches de pression basse, sans aggravation du nombre
de demandes en attente et sans changement de capacité, permettent seulement
`RECOVERY_OBSERVED`. La causalité reste `NOT_ESTABLISHED` et le succès métier
`NOT_EVALUATED`. Les plafonds ne sont pas ajustés automatiquement sur ce verdict.

Une attente dépassant le budget et s'aggravant conduit à `REGRESSED`. Seule la
limite de cet effet est relâchée ; cette version de politique ne commande plus
de nouvelle intervention. Une modification requiert un nouvel enrôlement signé.
Une calibration peut proposer un seuil différent, borné à [0,7 ; 0,95] avec un
pas maximal de 0,02, après au moins dix épisodes terminés de la même version. Elle ne signe ni
n'applique sa propre proposition.

Les bases source et sidecar ne partagent pas une transaction distribuée. Après
crash, un effet `CLAIMED` ou `UNCERTAIN` est rapproché de sa limite source
persistée, sans réexécuter le handler. Sans preuve de l'effet, l'incertitude est
conservée puis le suivi devient inconclusif. Une panne de lecture n'est pas
assimilée à une révocation explicite. Les limites déjà installées restent bornées
dans le temps et les contrôles d'admission existants demeurent en vigueur.

## Qualification

Les tests utilisent SQLite et le driver de production, le vrai chemin de
réservation et les contrôles d'autorité. Ils couvrent signatures, scopes,
révocation, pression non attestée, prévision, reprise sur fichier, retour de
capacité, régression de file et absence de revendication de réparation métier.

Le banc `benchmarks/gns-regulation` compare GNS inactif et actif avec les mêmes
charges et budgets configurés. Son environnement est un modèle synthétique
annoncé ; les résultats, y compris défavorables, ne démontrent pas un gain en
production. Le premier passage a révélé une prévision trop interventionniste
et une inhibition totale après récupération ; les choix consultatifs par défaut
et la limite permettant de remplir les places libérées en découlent.
