# Banc local GQWF : vues et matérialisation

Ce banc mesure le noyau GQWF sans agent ni runtime. Chaque commande démarre un
nouveau processus, crée un workspace et une base SQLite jetables dans le
répertoire temporaire du système, puis les supprime après le résultat JSON.
Il n'utilise ni backend HTTP, ni modèle, ni orchestrateur. Les assertions
arrêtent le run si le nombre de vues, la lecture de l'overlay ou la
non-duplication des blobs échoue.

## Exécution

Depuis la racine du dépôt, après `npm ci --prefix backend` :

```bash
node benchmarks/gqwf-overlays/run.cjs --views=10
node benchmarks/gqwf-overlays/run.cjs --views=100
node benchmarks/gqwf-overlays/run.cjs --views=1000
node benchmarks/gqwf-overlays/profile.cjs 100
```

Options : `--files=8`, `--bytes=1024` et `--materializations=3` par défaut.
Les bornes sont respectivement 256 fichiers, 1 MiB par fichier, 1 000 vues et
10 matérialisations. Conserver le JSON complet, la révision, l'état du checkout,
la charge de la machine et plusieurs répétitions pour une comparaison.

## Charge contrôlée et métriques

Le banc écrit huit fichiers déterministes de 1 024 octets dans un workspace
isolé et appelle `importBase`. Il crée ensuite N vues sur la même racine, sans
les sceller ni leur créer de dossier physique. Il vérifie qu'aucun blob n'est
ajouté. Dans chaque vue, il écrit le même `shared.txt` de 23 octets, contrôle
la lecture de la première et de la dernière vue et exige un seul nouveau blob.
Une vue est scellée, puis sa racine est matérialisée et libérée trois fois.

Les durées de création des vues, d'écriture des overlays, de scellement, de
matérialisation et de libération sont séparées. p50 et p95 utilisent le rang
supérieur des durées triées. `blobBytes` additionne la taille logique des
fichiers du magasin ; `sqlitePhysicalBytes` additionne le fichier SQLite,
`-wal` et `-shm` à l'instant mesuré, sans checkpoint forcé. Les valeurs RSS et
heap sont des échantillons en fin de phase, **pas des pics**. La taille d'un
bail matérialisé inclut son marqueur de propriété GQWF. Les temps de
préparation du fixture et de suppression finale du répertoire ne sont pas
chronométrés.

## Première observation exploratoire

Le 10 octobre 2026, trois processus successifs sur Windows x64, Node 24.18.0,
AMD EPYC 7543P (8 CPU logiques visibles), 30 Go de mémoire, révision
`58ac9caddf6613a481a75473a451aa9c808c38c6` avec checkout partagé
modifié :

| Vues | Création totale | Overlay total | Matérialisation p50 (3) | SQLite après vues | SQLite après overlays | Blobs après overlays |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 | 120,7 ms | 299,6 ms | 63,9 ms | 312 936 o | 436 536 o | 9 / 8 215 o |
| 100 | 178,2 ms | 1 879,4 ms | 53,9 ms | 1 466 536 o | 2 743 736 o | 9 / 8 215 o |
| 1 000 | 941,1 ms | 40 857,9 ms | 59,0 ms | 4 435 472 o | 4 628 032 o | 9 / 8 215 o |

Les 8 blobs de base totalisent 8 192 octets à chaque taille. Le neuvième
contient les 23 octets partagés par les N overlays. La taille SQLite n'est pas
une courbe de croissance fiable à partir de ces trois runs : le WAL peut être
checkpointé à des moments différents. Les écarts de latence reflètent aussi
le cache, le disque et la charge concurrente du checkout partagé. Répéter les
runs dans un ordre alterné avant toute comparaison de performance.

Ces 1 000 vues sont des enregistrements logiques et des écritures de fichiers
partagés. Le banc ne lance pas 1 000 workers, ne teste ni contention entre
processus, ni Git, ni dépendances, ni modèle, ni promotion avec preuve, ni
reprise après panne. Il ne qualifie donc pas la capacité à 10 000 agents.

## Profil et essai de déduplication à l'écriture

`profile.cjs` enveloppe temporairement les appels SQLite, les opérations de
fichiers et les mises à jour/finalisations SHA-256 pendant les écritures
d'overlay. L'instrumentation ajoute du coût et laisse une part non attribuée
(parcours JavaScript, attente et overhead des wrappers) ; ses durées ne doivent
pas être additionnées aux runs non instrumentés. Sur 100 overlays avant
optimisation, elle a compté 100 créations de fichier temporaire, 100 `sync`,
100 tentatives de renommage, 100 copies de secours Windows et 100 suppressions.
À 1 000, les mêmes appels ont été comptés 1 000 fois. Le hachage représentait
environ 5 ms sur le profil de 100 et 43 ms sur celui de 1 000 ; le coût était
surtout dans les fichiers et SQLite.

`putBlob` relit maintenant un blob existant et vérifie son SHA-256 ainsi que
ses octets avant de réutiliser son hash. Il refuse un lien ou un fichier non
privé avant cette lecture. Le chemin absent conserve la création
atomique par fichier temporaire et la synchronisation existantes. Une lecture
corrompue échoue sans réécriture silencieuse. Le test GQWF couvre ce chemin,
la course de deux créations et le refus d'un blob corrompu. Sur 100 overlays
après changement, le profil compte une seule création/synchronisation/copie/
suppression de fichier temporaire, 100 `lstat`, 102 lectures de fichier et
environ 3 ms de
hachage. Les appels SQL restent à 406 `get`, 102 `all`, 200 `exec` et 200 `run`.

Comparaison exploratoire de processus frais, même protocole et mêmes options
par taille, révision `488aaefb11f73e3c7f30f1259dd2f4634eb54e65`, checkout
partagé modifié ; les runs « avant » précèdent le changement local de
`putBlob`, les runs « après » le suivent :

| Vues | Overlay avant | Overlay après | Création vues avant → après | Matérialisation p50 avant → après |
| ---: | ---: | ---: | ---: | ---: |
| 10 | 147,2 ms | 349,6 ms | 6,5 → 76,6 ms | 43,8 → 59,8 ms |
| 100 | 1 651,9 ms | 1 171,4 ms | 129,8 → 124,4 ms | 41,7 → 50,6 ms |
| 1 000 | 16 992,0 ms | 7 236,2 ms | 638,2 → 835,0 ms | 84,2 → 43,2 ms |

L'overlay à 10 vues et la matérialisation à 10 et 100 sont plus lents dans les
runs « après ». La création des vues à 10 et 1 000 l'est aussi, alors qu'elle
n'a pas été modifiée. Ces chiffres défavorables sont conservés ; une seule
mesure par taille et trois matérialisations ne suffisent pas à attribuer une
régression ou un gain stable. Le premier run à 1 000 overlays avait pris 40,9 s
sur une autre révision ; le run « avant » de cette comparaison a pris 17,0 s.
La variabilité de machine empêche d'inférer un facteur de gain stable sans
répétitions alternées sur une machine isolée.
