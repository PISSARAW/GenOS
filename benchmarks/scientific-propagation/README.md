# Banc de propagation scientifique ciblée

Ce banc mesure le plan de transport scientifique sans modèle ni preuve
mathématique. Les références et reçus de rétractation sont synthétiques. Il
appelle les services réels `scientificPropagation`, `scientificReferences`
pour l'identité de référence et le transport ciblé natif. Il ne crée pas de
référence `verified` et n'appelle pas `scientificWorkflow.publishVerified` :
ce chemin exige un reçu Lean authentifié. Une livraison réussie ne démontre
aucune vérité scientifique.

## Exécution

Depuis la racine, après `npm ci --prefix backend` :

```powershell
node benchmarks/scientific-propagation/run.cjs --recipients=10 --batch=100
node benchmarks/scientific-propagation/run.cjs --recipients=100 --batch=100
node benchmarks/scientific-propagation/run.cjs --recipients=1000 --batch=100
```

Le résultat JSON est envoyé sur la sortie standard. Chaque commande crée une
base SQLite en mémoire et un processus neuf ; aucun fichier de résultat n'est
écrit. Les paramètres acceptent de 1 à 1 000 destinataires et une taille de
lot de 1 à 1 000, plafonnée à 100 par le service de claim.

## Protocole et métriques

Le banc crée un auteur et N destinataires logiques du même espace. Chaque
destinataire porte une obligation sur une référence source synthétique. Il
mesure ensuite :

1. l'enregistrement des dépendances et la découverte des destinataires par
   `consumersFor` ;
2. la mise en outbox d'une annonce `publish` ciblée, puis la même opération
   répétée pour vérifier l'idempotence. Une tentative de dispatch doit échouer
   car la référence n'a pas de publication vérifiée ; aucun signal n'est
   persisté. Les annonces sans preuve sont alors supprimées de la base jetable
   pour isoler la phase de transport suivante ;
3. la cascade `invalidateDependents` avec un identifiant de rétractation
   synthétique, puis une annonce `retract` ciblée et son doublon ;
4. le dispatch natif et l'acquittement des N invalidations et N annonces de
   retrait.

Les comptes sont vérifiés : N annonces de publication refusées au dispatch,
N invalidations et N retraits, soit 2N signaux durables et 2N lignes de
livraison au statut `pending`. L'outbox des retraits et invalidations doit
être `acked`. Un acquittement d'outbox signifie que le signal
ciblé a été persisté et reconnu par le dispatcher ; il **ne signifie pas** que
le destinataire l'a lu ou acquitté lui-même. Les doublons doivent renvoyer
les mêmes identifiants sans créer de nouveaux événements.

`enqueueMs`, `duplicateMs`, `cascadeMs` et `announcementMs` sont des durées
d'opération. `eventsPerSecond` concerne les retraits et invalidations ; il
inclut claim, transport, contrôle de livraison
et acquittement d'outbox. Les latences p50/p95/p99 sont les temps depuis le
début du dispatch de la phase jusqu'à la persistance de chaque signal ciblé.
Elles incluent l'attente en file sous traitement séquentiel et ne sont donc
pas des latences de service indépendantes. Le protocole n'inclut ni réseau,
ni consommateurs distants, ni temps de modèle, ni oracle scientifique, ni
reprise après panne. La base en mémoire ne représente pas la durabilité d'un
disque ou d'un cluster.

## Première mesure locale

Le 10 octobre 2026, Windows x64, Node 24.18.0, AMD EPYC 7543P avec 8 CPU
logiques visibles, révision `488aaefb11f73e3c7f30f1259dd2f4634eb54e65`
dans un checkout partagé modifié, un passage par taille après introduction
du contrôle de publication vérifiée :

| Destinataires | Annonce publish | Publication livrée | Cascade retrait | Livraison retrait + invalidation | p95 livraison |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 5 ms | 0 | 29 ms | 161 événements/s | 120 ms |
| 100 | 30 ms | 0 | 127 ms | 205 événements/s | 853 ms |
| 1 000 | 989 ms | 0 | 1 912 ms | 119 événements/s | 16 247 ms |

La charge de la machine partagée variait pendant ces essais, et les débits
ne forment pas une courbe de capacité régulière. Ces
nombres vérifient que le harness traverse les trois tailles et ses invariants,
pas un plafond de capacité. Les retraits synthétiques ne constituent pas des
rétractations scientifiques validées et le banc ne prouve pas un flux complet
de publication vérifiée. Pour comparer des versions, répéter chaque taille
sur une machine isolée avec ordre alterné, charges et versions identiques,
et conserver tous les JSON bruts. Aucune preuve de 10 000 destinataires ou de
10 000 agents actifs n'en découle.
