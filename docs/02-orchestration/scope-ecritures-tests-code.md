# Périmètre des écritures produites par les tests

Après exécution des commandes autorisées, le runner compare les fichiers
observables par le collecteur de snapshot avant et après la proposition. Une
création, modification, suppression ou variation de permissions hors des chemins
du patch validé produit `WORKER_TEST_SCOPE_VIOLATION`, même si le test sort avec
le code zéro. Les modifications du patch sont restaurées ; les autres mutations
restent dans la capsule isolée pour inspection. Le test n'est pas qualifié comme
une correction réussie.

Le cache de compilation Node est également désactivé dans les sous-processus
de test, pour qu'un répertoire temporaire situé dans la capsule ne pollue pas
son diff par les caches automatiques de npm et Node.

La liste de chemins candidats du contexte ne donne pas une autorisation tacite
aux tests : seuls les chemins effectivement proposés et validés sont permis.
Cette comparaison suit les exclusions du collecteur de snapshot et n'est pas
une nouvelle barrière de confinement du processus. Elle ne prétend pas observer
les écritures externes ou les répertoires exclus du snapshot.
