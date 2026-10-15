# ADR 0547 — Reprendre une génération sous bail de contrôle

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : runtime local, checkpoints, contrôle IPC, continuité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0535, ADR 0539 et ADR 0542

## Contexte

Le runtime local savait reprendre au démarrage des checkpoints durables aux
phases `prepared`, `generated` et `evaluated`. Le contrôle coopératif ajouté par
l'ADR 0542 n'appliquait cependant qu'un contexte minimal `prepared`. Une
génération déjà calculée pouvait donc être perdue lors d'une reprise en direct,
alors que sa réponse persistée était encore sûre avant les artefacts et le post
pipeline.

L'attestation de capacité du processus restait aussi valide tant que son canal
IPC semblait connecté. Une connexion ouverte ne prouve pas que la boucle
événementielle du processus répond encore récemment.

## Décision

### Reprise de la phase `generated`

Le contrôle accepte le checkpoint natif exact `genos-local-runtime` version 1
à la phase `generated`. Il contient uniquement `kind`, `version`, `phase`,
`promptHash` et `reply`. L'enfant vérifie la forme exacte, l'empreinte du prompt
cadré, la présence de la réponse et la limite de taille. Le contexte CellThread
reste lié par son empreinte canonique, sa taille, l'empreinte du checkpoint et
ses références de preuve.

Une réponse reprise est limitée par le plafond total de contexte CellThread de
256 Kio, même si le stockage interne des checkpoints locaux accepte une réponse
plus grande. Elle peut être appliquée au point sûr `prepared`, pour éviter une
nouvelle génération, ou au point sûr `generated`, pour remplacer la génération
avant tout artefact et post pipeline. Après le point sûr, le runtime relit la
réponse appliquée puis poursuit l'évaluation normale.

La reprise coopérative `evaluated` est refusée. À ce point d'un processus déjà
vivant, des écritures d'artefacts ou des effets du post pipeline peuvent avoir
été exécutés pour une autre réponse. Modifier seulement la valeur en mémoire
produirait un état incohérent. La reprise `evaluated` au démarrage garde son
contrat distinct, car le runtime reconstruit alors son flux depuis l'entrée.

Le contexte historique `genos-local-runtime-control` version 1 à la phase
`prepared` reste accepté pour compatibilité.

### Bail de capacité

L'annonce `ready` ouvre un bail parent de 30 secondes mesuré avec une horloge
monotone. Après la remise réussie de cette annonce, l'enfant émet une pulsation
toutes les 10 secondes. Chaque message contient exactement le type, la version,
une séquence et les six champs de lignée déjà attestés.

Le parent accepte seulement la séquence précédente plus un, avant expiration,
avec la version et la lignée exactes. Une pulsation prématurée, tardive,
dupliquée, enrichie ou cross tenant empoisonne la capacité du processus. Une
capacité expirée ne peut pas être ressuscitée. La déconnexion arrête le timer et
révoque l'attestation.

Un nouveau processus backend possède une mémoire de capacités vide. Il refuse
donc les anciennes attestations ; aucune reconnexion IPC n'est inventée.

## Conséquences

### Positives

- Une réponse déjà générée peut éviter un nouvel appel modèle.
- L'évaluation et les effets suivants restent exécutés dans l'ordre normal.
- Le checkpoint natif constitue l'unique schéma de réponse générée.
- Une capacité de contrôle ne survit plus indéfiniment à une boucle
  événementielle silencieuse.
- Les changements d'horloge murale n'allongent pas le bail.

### Limites

- La pulsation prouve seulement une activité récente du canal IPC et de la
  boucle événementielle. Elle ne prouve ni point sûr, ni progrès, ni santé
  cognitive.
- La réponse restaurée demeure une sortie de modèle non vérifiée ; les gates
  d'évidence suivants restent obligatoires.
- La reprise coopérative `evaluated` reste refusée sur un processus vivant.
- Un redémarrage du backend exige toujours une réconciliation ou un nouveau
  transport reconnectable pour reprendre le contrôle d'un ancien processus.
- Le scellement automatique du checkpoint natif comme checkpoint CellThread
  reste un incrément séparé ; l'appelant doit encore fournir le contexte exact.

## Preuve d'intégration

Les tests lancent de vrais processus enfants. Ils démontrent qu'une réponse
`generated` restaurée est celle consommée, qu'aucune nouvelle génération n'est
appelée et que l'évaluation s'exécute une fois. Ils refusent `evaluated`, les
empreintes divergentes et les réponses surdimensionnées sans mutation d'état.

Les tests du bail couvrent l'expiration fermée, les séquences rejouées ou
manquantes, la lignée cross tenant, les champs supplémentaires, le redémarrage
du module parent, la déconnexion, l'erreur d'envoi et le nettoyage des timers et
listeners.

## Alternatives

- Restaurer `evaluated` en modifiant seulement la réponse : écarté, car les
  effets externes pourraient déjà correspondre à une autre valeur.
- Garder l'attestation jusqu'à `disconnect` : écarté, car un processus bloqué
  peut conserver un canal ouvert.
- Persister l'attestation pour la réutiliser après redémarrage : écarté, car la
  persistance ne recrée ni l'objet processus ni son canal IPC.
