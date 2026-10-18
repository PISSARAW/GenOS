# ADR 0629 — Backend reflink natif GQWF

- **Statut** : Accepté, activation explicite ou politique auto
- **Date** : 2026-10-18
- **Domaine** : GQWF, workspaces, reflink, Copy-on-Write
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0369, ADR 0616, ADR 0618, ADR 0628

## Contexte

Le SPI de matérialisation sépare l'autorité sémantique GQWF du mécanisme qui
projette physiquement une racine. Son seul backend de production effectue une
copie complète et portable. Pour réduire les octets écrits sans introduire un
montage privilégié, certains systèmes de fichiers offrent un clone de fichier
Copy-on-Write, communément appelé reflink.

La présence d'une constante ou d'un système d'exploitation compatible ne prouve
pas que le volume du workspace accepte les reflinks. Une copie qui retombe
silencieusement sur une copie complète produirait la bonne racine mais une
preuve de capacité fausse.

## Décision

GenOS ajoute le backend `native-reflink-v1`. Il utilise exclusivement
`COPYFILE_FICLONE_FORCE` avec `COPYFILE_EXCL`. La variante non stricte
`COPYFILE_FICLONE` est interdite, car elle peut autoriser un fallback interne
non observable.

Avant sa sélection, le backend exécute un clone court dans le filesystem du
workspace, sous `.genos/gqwf/capability-probes`, vérifie les octets puis supprime
le dossier temporaire. Une erreur devient une capacité indisponible stable. La
sélection explicite de `native-reflink-v1` échoue alors avant la création d'un
bail et ne lance pas de copie portable.

La politique explicite `materializerId: auto` préfère le reflink vérifié puis
choisit `portable-copy-v1` si la sonde l'interdit. Ce fallback fait partie du
contrat demandé : son reçu porte `auto_portable_fallback:<cause>`. Le backend
par défaut reste `portable-copy-v1` afin de ne pas modifier silencieusement les
déploiements existants.

Avant chaque clone, le blob source est relu et son hash est vérifié. Après le
clone, la cible doit être un fichier régulier privé avec un seul lien physique ;
sa taille et son hash sont revérifiés. La capture, la libération et la reprise
réutilisent ensuite les invariants du SPI. Le backend ne peut ni publier une
tête, ni affaiblir une gate de preuve.

## Conséquences

### Positives

- Un filesystem compatible évite la copie initiale des blocs de chaque fichier.
- La capacité est vérifiée sur le volume cible, pas déduite de la plateforme.
- L'indisponibilité explicite échoue sans fallback silencieux.
- La politique auto reste portable et laisse une cause durable.
- Les racines candidates restent identiques à celles du backend portable.

### Négatives

- La sonde écrit puis supprime deux petits fichiers internes.
- La vérification d'intégrité relit les octets source et cible ; elle évite les
  écritures complètes mais pas le coût de lecture.
- Le reflink travaille au fichier : il ne fournit ni overlay de répertoires, ni
  déduplication globale, ni snapshots de filesystem.
- Windows retourne actuellement `ENOSYS` sur le volume de qualification local ;
  le backend y reste indisponible et la politique auto utilise la copie portable.

## Alternatives

- Utiliser `COPYFILE_FICLONE` : rejeté, car un fallback complet peut être pris
  pour un clone réussi.
- Déduire la capacité de `process.platform` : rejeté, car elle dépend du volume.
- Créer des hardlinks vers les blobs : rejeté, car une écriture du worker
  modifierait l'objet immuable partagé.
- Activer le reflink par défaut : reporté jusqu'à une qualification canari sur
  des filesystems représentatifs.
- Ajouter un module natif propre à chaque plateforme : reporté ; l'API Node
  stricte suffit pour qualifier le premier backend réel.
