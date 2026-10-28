# ADR 0750 — Isoler le runner d’évaluation GVX dans Docker

- **Statut** : Proposé pour implémentation et revue de sûreté
- **Date** : 2026-10-28
- **Domaine** : GVX, évaluation externe, isolation et provenance
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0749](0749-liaison-runtime-immutable-des-bras-gvx.md)

## Contexte

L’admission GVX reste fermée tant qu’un évaluateur externe ne peut pas être
exécuté hors de l’espace apprenant et ne produire qu’un résultat agrégé. La
présence de Docker CLI ne prouve pas que le daemon fonctionne, que l’image est
immuable, ni que les restrictions demandées sont appliquées.

## Décision proposée

Ajouter un runner Docker dédié qui n’accepte qu’une image épinglée par digest
SHA-256 et un tableau d’arguments sans shell. Il utilise `--pull=never`, un
réseau désactivé, un système de fichiers racine en lecture seule, toutes les
capacités Linux supprimées, `no-new-privileges`, un utilisateur non-root, une
limite de PID, de mémoire, de CPU et de durée. Seuls le dépôt candidat monté en
lecture seule et un répertoire de sortie neuf sont accessibles comme bind mount;
un `/tmp` borné est créé dans le conteneur. Aucun secret ni environnement
d’authentification Docker de l’utilisateur n’est transmis au processus.

Le runner calcule l’empreinte du candidat avant et après l’exécution. Il accepte
un unique `aggregate.json` conforme au schéma strict : empreinte de suite et
comptes total, succès, échecs et erreurs. Les champs supplémentaires, les
sorties par cas, les fichiers additionnels et les agrégats incohérents font
échouer l’exécution. Le runner remplace alors le fichier temporaire par un reçu
contenant uniquement l’empreinte du candidat, le digest de l’image, l’empreinte
de suite, les comptes agrégés, le taux calculé et le hash du reçu. La sortie
stdout/stderr du conteneur est bornée puis abandonnée.

Cette primitive ne rend pas l’admission exécutable. Le `GvxTrialExecutionAdapter`
reste fail-closed jusqu’à ce qu’une autorité indépendante fournisse et audite le
digest d’image, le contrat de commande et de sortie, l’indépendance de
l’évaluateur et une attestation vérifiable de l’environnement Docker réel.
L’image et le contrat doivent ensuite être liés au profil de campagne scellé.

Le daemon Docker Desktop de l’environnement D était arrêté et n’a pas pu être
démarré sans privilèges. Par conséquent, l’installation du CLI et les tests au
moyen d’un faux CLI ne démontrent pas que Docker Desktop applique ces
restrictions sur cet hôte. Aucune exécution de campagne n’est autorisée sur
cette seule base.

## Conséquences

### Positives

- Le candidat ne peut pas être modifié par le conteneur d’évaluation.
- La configuration d’exécution n’accorde ni réseau, ni capacités, ni secrets au
  conteneur; les ressources sont bornées.
- Le stockage normalisé ne conserve que les agrégats explicitement autorisés.
- Le test du runner n’a pas besoin d’ouvrir un évaluateur réel ni de lancer un
  trial.

### Négatives et limites

- Le daemon Docker reste une autorité privilégiée et les conteneurs Linux
  partagent le noyau de l’hôte; l’image, le daemon et les options effectives
  exigent une revue indépendante.
- Le digest d’image, le contrat d’évaluation, l’attestation runtime et les
  audits ne sont pas fournis par cette primitive.
- Aucun profil GVX A–G ne peut être admis avec ce seul code.

## Vérification

Les tests emploient un faux CLI Docker et des agrégats synthétiques. Ils vérifient
les options obligatoires, le digest, l’absence de variables secrètes, le refus
des champs non agrégés et le timeout. Ils ne comptent aucun trial et ne valident
pas la configuration d’un daemon Docker réel.
