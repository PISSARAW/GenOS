# ADR 0633 — Collecter les caches lower OverlayFS GQWF

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : GQWF, OverlayFS, garbage collection, reprise, preuves
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0614, ADR 0628, ADR 0631, ADR 0632

## Contexte

Le backend OverlayFS partage une copie lower par hash de racine. Ce cache est
reconstructible depuis le manifeste et les blobs, mais la tranche 12 le
conservait indéfiniment. Le supprimer à la libération d'un bail annulerait le
partage entre baux successifs. Le supprimer selon la seule joignabilité de la
racine le conserverait inutilement, car une racine encore publiée n'a pas
besoin d'un lower permanent.

Le statut SQLite seul est également insuffisant. Un montage survivant ou un
décalage de reprise peut encore référencer le lower. Supprimer récursivement ce
dossier produirait un comportement noyau indéfini et contredirait la reprise
fail-closed.

## Décision

Le garbage collector GQWF inventorie les dossiers
`.genos/gqwf/overlay-lower/<root-hash>`. Un cache valide possède un nom SHA-256,
un dossier et une racine non symboliques, une preuve `.ready` privée égale au
hash, et uniquement des fichiers privés ou dossiers ordinaires. Toute anomalie
est rapportée et bloque la collecte.

Un cache reste protégé si un reçu `linux-overlayfs-v1` le lie à un bail dont le
statut diffère de `released`. Il reste aussi protégé si le mountinfo du processus
indique que sa racine sert de `lowerdir`. Les deux états, ainsi que la taille du
cache, entrent dans le hash d'inventaire version 2.

`collectGarbage` conserve le protocole preview puis application de l'ADR 0614.
Sa transaction `BEGIN IMMEDIATE` sérialise les créations de baux sur la même
base. Après recalcul exact de l'inventaire, chaque cache récupérable est relu ;
sa taille et son absence de montage sont revérifiées avant suppression. Une
course, une mutation ou un montage tardif interrompt la collecte.

Le reçu `gqwf_gc_runs` ajoute `overlay_cache_count`. La migration est additive
avec une valeur par défaut nulle. `reclaimed_bytes` additionne désormais les
blobs orphelins et les fichiers des caches lower supprimés.

## Conséquences

### Positives

- Les caches inactifs ne croissent plus sans borne.
- Une racine publiée peut perdre son cache sans perdre ses données durables.
- Les baux actifs et les montages observés sont deux protections indépendantes.
- Une course entre preview et application invalide l'inventaire.
- Les reçus distinguent racines, blobs et caches lower collectés.

### Négatives

- Chaque preview lit le mountinfo et parcourt les caches lower.
- La taille récupérable mesure les fichiers, pas les blocs physiques partagés.
- Un cache anormal bloque aussi la collecte des autres objets du workspace.
- Un montage créé hors de GenOS après la dernière vérification reste une course
  externe que le runtime ne peut pas sérialiser par SQLite.

## Alternatives

- Supprimer à chaque `releaseLease` : rejeté, car les baux suivants perdraient
  le partage et reconstruiraient immédiatement le lower.
- Utiliser la joignabilité des racines : rejeté, car un cache est reconstructible
  et n'est pas une autorité durable.
- Se fier uniquement aux statuts des baux : rejeté, car le noyau peut encore
  porter un montage.
- Démonter automatiquement depuis le GC : rejeté, car le collecteur ne possède
  pas l'autorité du bail et pourrait interrompre un runtime.
