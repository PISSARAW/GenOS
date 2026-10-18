# ADR 0632 — Backend OverlayFS Linux GQWF

- **Statut** : Accepté, activation explicite ou politique auto
- **Date** : 2026-10-18
- **Domaine** : GQWF, workspaces, OverlayFS, Copy-on-Write, reprise
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0628, ADR 0629, ADR 0630, ADR 0631

## Contexte

Le backend reflink évite une copie physique complète lorsqu'un volume accepte
les clones de fichiers, mais il crée encore une arborescence privée à chaque
bail. OverlayFS peut partager une arborescence inférieure et ne copier un
fichier dans une couche supérieure privée qu'à sa première modification.

La simple présence de Linux ou du module OverlayFS ne prouve toutefois ni le
droit de monter, ni les capacités du filesystem supérieur. Un montage masque
aussi son point de montage : la preuve de possession du bail doit donc rester
dans le conteneur séparé introduit par l'ADR 0631.

## Décision

GenOS ajoute le backend `linux-overlayfs-v1`. Sa sonde crée un lower, un upper,
un workdir et une racine fusionnée dans le volume du workspace. Elle réalise un
vrai montage, vérifie lecture et copy-up, contrôle que le lower est inchangé,
puis exige un démontage observé. Une erreur devient une capacité indisponible ;
elle ne vaut jamais preuve de Copy-on-Write.

Le backend construit une fois par hash de racine un cache lower partagé. Sa
preuve `.ready`, la nature privée de chaque fichier, sa taille et son hash sont
vérifiés avant réutilisation et avant capture. Une publication concurrente
passe par un répertoire de staging et un renommage. Un cache existant invalide
est refusé, jamais réparé implicitement pendant un bail.

Chaque bail reçoit des répertoires `upper/` et `work/` distincts sous son
conteneur ; ils résident donc sur le même filesystem. `root/` est le point de
montage transmis au runtime. La libération et la reprise vérifient le montage,
le démontent, vérifient sa disparition puis suppriment le conteneur. Un échec de
démontage conserve le statut `releasing` et le conteneur pour une reprise.

La politique `auto` essaie OverlayFS, puis le reflink, puis la copie portable.
Le reçu conserve les causes de chaque backend traversé. Sans politique, le
défaut reste `portable-copy-v1` ; il n'existe donc aucune activation silencieuse
d'un montage privilégié.

## Conséquences

### Positives

- Plusieurs baux d'une même racine partagent leur arborescence inférieure.
- Les écritures de chaque bail restent dans un upper privé.
- La capacité est prouvée sur le volume et dans le contexte de permission cible.
- Un démontage incomplet ne déclenche jamais une suppression récursive.
- Les candidates capturées restent des racines GQWF ordinaires et vérifiées.

### Négatives

- Le premier bail d'une racine construit encore un lower complet depuis les
  blobs ; le gain porte sur les baux suivants et les écritures différées.
- Les vérifications relisent le lower et ont un coût proportionnel à sa taille.
- La collecte du cache lower exige les protections SQL et noyau définies par
  l'[ADR 0633](0633-collecte-caches-lower-overlayfs-gqwf.md).
- Le montage peut exiger une configuration ou des privilèges absents du runtime.
- Windows et macOS déclarent ce backend indisponible.

## Alternatives

- Déduire la capacité de `process.platform` : rejeté, car le montage peut être
  interdit ou le filesystem supérieur incompatible.
- Partager aussi `upper/` ou `work/` : rejeté, car OverlayFS interdit leur
  réutilisation concurrente et l'isolation des baux serait perdue.
- Copier un lower dans chaque bail : rejeté, car cela annule le principal gain
  de fork et reproduit le backend portable.
- Activer OverlayFS par défaut : rejeté ; une mission doit le demander
  explicitement, directement ou par `auto`.
- Collecter immédiatement les lowers : réalisé ensuite par l'ADR 0633, qui
  prouve l'absence de montage et de bail actif avant suppression.
