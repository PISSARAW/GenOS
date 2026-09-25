# Environnement hôte et homéostasie

GenOS observe les processeurs disponibles, la mémoire, le disque des données et les
autres volumes locaux. Sous Linux, il lit aussi les signaux PSI et la limite mémoire
cgroup v2 quand ils sont disponibles. La commande suivante montre les mesures, les
raisons de la décision et le volume conseillé :

```bash
node backend/bin/genos-environment.cjs
```

Le nombre de processus backend est choisi au démarrage, avec un plafond de quatre.
La sélection des modèles locaux relit l'état de la machine au moment de router une
tâche. Une pression forte ou un volume de données presque plein désactive ce routage.
Un autre volume libre est signalé avant la décision, mais la présence de ce volume
ne rend pas immédiatement le stockage actuel capable de recevoir des écritures.

Sur une installation neuve, GenOS examine les volumes locaux et choisit celui qui
a le meilleur ratio d'espace libre, sous réserve d'au moins 1 Gio libre. On peut
limiter les choix avec `GENOS_STORAGE_CANDIDATES` (séparateur `;` sous Windows,
`:` sous Linux), imposer `GENOS_DATA_ROOT` ou augmenter le seuil avec
`GENOS_STORAGE_MIN_FREE_BYTES`. Le chemin choisi est fixé dans
`.genos/storage-location.json` et partagé par les magasins du noyau de stockage.

À chaque création d'une capsule d'orchestrateur ou de worker, GenOS rafraîchit la
liste des volumes et place la capsule sur celui qui a le plus d'octets disponibles,
si l'espace estimé plus la marge de sécurité tient. Le chemin suit la forme
`<volume>\GenOS\.genos-agent-worlds\<projet>\<agent>`. Les tâches suivantes
refont le choix selon l'espace libre du moment. `GENOS_CAPSULE_ROOT` reste disponible
pour imposer un emplacement fixe.

Une installation existante conserve sa base SQLite historique et ses données. Pour
les déplacer, il faut arrêter les processus, préserver ensemble la base et ses
fichiers `-wal` et `-shm`, puis vérifier la copie avant de changer la configuration.
Changer seulement `GENOS_DATA_ROOT` ne migre pas la base historique. Une base SQLite
en mode WAL ne doit pas être placée sur un disque réseau partagé.

Voir [ADR 0065](../adr/0065-homeostasie-environnement-hote.md) pour les décisions et
leurs sources.
