# ADR 0542 — Attester le contrôle du runtime local

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : runtime local, orchestration, IPC, reprise
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0539 — Exposer le contrôle coopératif des cellules

## Contexte

L'ADR 0539 a défini le contrat de contrôle coopératif, mais aucun runtime enfant
ne l'exécutait. Le parent pouvait construire une requête exacte sans savoir si
le processus savait réellement atteindre un point sûr. Un envoi IPC réussi ne
devait donc toujours pas être interprété comme une pause, une annulation ou une
reprise appliquée.

Le runtime local dispose déjà de points d'arrêt coopératifs utilisés pour les
captures. Il peut les réutiliser à condition de distinguer l'annonce de sa
capacité, la réception d'une commande et la preuve de son application.

## Décision

Le runtime local annonce une seule capacité `genos-runtime-control-ready`,
après avoir reçu une mission dont les six identifiants de lignée sont complets.
L'annonce fixe la version 1 et les actions `pause`, `resume`, `cancel` et
`resume_checkpoint`. Le parent attache son observateur avant d'envoyer la
mission. Il n'émet aucune commande tant que l'annonce exacte n'a pas été
attestée. Une annonce invalide, incomplète, divergente ou dupliquée empoisonne
la capacité du processus. Une fermeture ou une déconnexion la révoque.

La mission protobuf transporte désormais la mission, l'épisode, le thread,
l'organisation et le projet jusqu'au processus enfant. Le worker vient de
l'identité déjà attribuée au processus. Le parent et l'enfant comparent les six
valeurs sans substitution lors du contrôle.

Le handler enfant mémorise les identifiants de requête dans une fenêtre FIFO
bornée à 1 024 éléments. Une pause ou une annulation reçue entre deux points
sûrs reste en attente et ne produit aucun accusé positif. Au prochain point
sûr, la pause accuse puis bloque le travail jusqu'à une reprise exacte.
L'annulation accuse au point sûr puis reste quiescente jusqu'à ce que le parent
observe et provoque la fin du processus. Une reprise n'est acceptée que pendant
une pause effective.

La restauration prise en charge par cette version est volontairement minimale.
Le contexte doit contenir exactement le schéma local version 1, la phase
`prepared` et l'empreinte du prompt cadré. L'enfant recalcule l'empreinte et la
taille du contexte canonique, valide le format de l'empreinte du checkpoint et
les références de preuve, puis applique le marqueur de reprise avant l'accusé.
Un checkpoint `prepared`
présenté à un point `generated` ou `evaluated` n'est pas promu en succès.

La barrière locale compose le point sûr de capture existant et le contrôle
coopératif. Le processus conserve ainsi un seul endroit où le travail peut être
immobilisé entre deux phases observables.

## Conséquences

### Positives

- Le parent connaît les actions réellement annoncées par le processus exact.
- Aucun accusé de pause ou d'annulation ne précède le point sûr correspondant.
- Une réponse obsolète ou issue d'une autre lignée ne peut pas prouver l'action.
- La mémoire de déduplication reste bornée pendant la vie du processus.
- Les messages IPC étrangers restent compatibles avec les autres listeners du
  runtime.

### Limites

- Cette capacité existe seulement pour le runtime local livré avec GenOS. Un
  runtime externe ou distant doit annoncer et prouver le même contrat.
- La restauration ne reconstitue pas encore les phases `generated` ou
  `evaluated`, ni un état arbitraire du modèle ou des outils.
- L'attestation est liée à la vie du processus et n'est pas réhydratée après un
  redémarrage du backend.
- La capture et le contrôle partagent une barrière séquentielle ; une capture
  déjà suspendue doit être libérée avant le traitement du contrôle suivant.

## Preuve d'intégration

Les tests parent couvrent l'absence de capacité, les annonces invalides,
cross tenant, incomplètes ou dupliquées, la révocation, les ACK synchrones et
les messages IPC étrangers. Un test de bout en bout lance un vrai processus
Node qui charge le handler de production. Il vérifie l'annonce exacte,
l'attente du point sûr, le blocage et la reprise, les identifiants obsolètes, la
restauration canonique, le refus de phase, l'annulation et le nettoyage des
listeners.

## Alternatives

- Déduire la capacité du chemin de l'exécutable : écarté, car le binaire lancé
  peut être obsolète ou remplacé.
- Accuser dès la réception IPC : écarté, car la réception ne prouve pas que le
  travail a atteint un état quiescent.
- Restaurer un contexte libre fourni par le parent : écarté, car le runtime ne
  saurait pas en vérifier la sémantique ni l'appliquer honnêtement.
