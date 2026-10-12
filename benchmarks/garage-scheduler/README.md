# Mesure locale du scheduler Garage

Ce microbenchmark appelle les services Garage réels avec une base SQLite temporaire.
Il mesure séparément `enqueuePersistent`, `claimNextPersistent` et le début de
`drainOne`. Il ne lance aucun agent ni runtime. Un job signifie ici une requête
persistée associée à une identité de worker inactive, pas un processus actif.

## Exécution

Depuis la racine du dépôt, après `npm ci --prefix backend` :

```powershell
node benchmarks/garage-scheduler/run.cjs --size=10 --samples=30 --warmup=5
node benchmarks/garage-scheduler/run.cjs --size=100 --samples=30 --warmup=5
node benchmarks/garage-scheduler/run.cjs --size=1000 --samples=30 --warmup=5
```

Chaque commande émet un objet JSON sur la sortie standard. Rediriger cette
sortie vers un dossier de résultats non suivi si l'on souhaite conserver les
observations brutes. Les tailles acceptées vont de 1 à 1 000 jobs. Les
échantillons de claim et le préchauffage sont configurables par `--samples` et
`--warmup` ; la valeur par défaut est 12 et 3. Pour interpréter un p99,
utiliser au moins 100 échantillons et répéter toute la campagne plusieurs fois.

## Protocole

Pour chaque taille, un processus neuf crée une base SQLite dans le répertoire
temporaire système, applique les migrations Garage, active WAL et
`synchronous=NORMAL`, puis insère un orchestrateur et autant de workers
inactifs que de jobs. Le benchmark insère les requêtes par l'API de production
et vérifie leur état `queued`.

- **Enqueue** : temps de chaque insertion, de la première à la dernière.
  La taille de la file croît pendant cette série ; les percentiles portent
  sur cette croissance, pas sur une file de taille fixe.
- **Claim** : après préchauffage, le service choisit une requête dans une
  file de taille fixe. Le temps inclut la requête de candidats, la lecture de
  l'historique, le tri, l'éligibilité et la transaction de claim. Le harness
  remet ensuite cette revendication à l'état `queued` dans sa base jetable.
  Ce nettoyage est hors chronométrage : les jobs restent donc dans la file
  pour la mesure suivante. Aucun état `completed` n'est fabriqué.
- **Drain** : un seul appel à `drainOne`, avec autorisation, réservation et
  lancement du runtime remplacés par des fonctions locales. La sélection,
  les transactions et la transition persistée restent réelles. Le circuit
  breaker de production bloque les appels identiques répétés ; il reste actif.
  La latence unique est indicative ; débit et p50/p95/p99 sont `null`.

Le débit `opsPerSecond` est le nombre d'opérations chronométrées divisé par la
somme de leurs durées. Il ne représente pas le débit de bout en bout et ne
comprend ni création de workspace, ni modèle, ni exécution, ni vérification de
preuve, ni reprise après panne. Les percentiles utilisent le rang supérieur
sur les durées triées. Le JSON inclut la révision Git, Node, le système, le
processeur et la mémoire ; conserver aussi l'état de propreté du checkout,
les limites de ressources et la charge concurrente pour une comparaison.

## Première mesure exploratoire

Le 10 octobre 2026, sur Windows x64, Node 24.18.0, AMD EPYC 7543P (8 CPU
logiques visibles, 30 Go de mémoire), révision `58ac9caddf6613a481a75473a451aa9c808c38c6`
avec checkout partagé modifié, 30 claims mesurés après 5 préchauffages :

| Jobs en file | Enqueue ops/s | Claim ops/s | Claim p50 | Claim p95 | Claim p99 | Drain unique |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 353 | 212 | 4,19 ms | 7,65 ms | 9,54 ms | 14,78 ms |
| 100 | 139 | 103 | 9,77 ms | 12,10 ms | 12,41 ms | 15,87 ms |
| 1 000 | 349 | 16 | 53,43 ms | 101,94 ms | 214,68 ms | 63,78 ms |

Ces nombres sont des observations locales, sans isolation de la machine ni
répétitions de campagne. Le p99 à 30 échantillons est essentiellement un
maximum et ne constitue pas une estimation stable. Le claim ralentit nettement
à 1 000 jobs ; `garageQueueStore.candidates` charge et trie toutes les requêtes
prêtes et relit l'historique à chaque appel. Cette lecture du code désigne une
hypothèse de goulot, pas une attribution mesurée : profiler les sous-opérations
SQL, tri et éligibilité avant de modifier le scheduler.

Ce protocole ne prouve ni capacité de 10 000 agents, ni débit de 10 000
runtimes, ni sécurité des reprises. La file est plafonnée à 1 000 pour cette
mesure et le drain ne couvre pas le cycle d'exécution complet.

## Essai de calcul unique des scores

Un changement local de `garageQueueStore.candidates` calcule désormais chaque
score une seule fois avant le tri. Il conserve la formule des douze politiques,
le contexte d'équité, le départage par `request_id` et le parcours des
candidats non éligibles. Les deux variantes ont été mesurées avec le protocole
ci-dessus, 100 claims après 10 préchauffages, sur la même machine et la même
révision de base. Le checkout était partagé et chargé ; il s'agit d'un essai
comparatif, pas d'une campagne confirmatoire.

| Jobs en file | Claim initial ops/s | Claim modifié ops/s | p50 initial | p50 modifié |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 270 | 160 | 3,52 ms | 5,32 ms |
| 100 | 124 | 129 | 7,41 ms | 7,25 ms |
| 1 000 | 14,6 | 22,1 | 55,29 ms | 41,38 ms |

Le gain observé à 1 000 jobs est d'environ 1,5 fois en débit claim. La
régression apparente à 10 jobs et les petits écarts à 100 exigent des campagnes
alternées sur une machine isolée avant toute conclusion générale. La lecture
SQL des candidats et de l'historique reste inchangée ; cette optimisation ne
supprime pas le ralentissement avec la taille de la file.
