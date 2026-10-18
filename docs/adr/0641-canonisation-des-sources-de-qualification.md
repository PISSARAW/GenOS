# ADR 0641 — Canonisation des sources de qualification

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : preuve, reproductibilité, qualification fondatrice
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0624, ADR 0625, plan de maturité vers 95/100

## Contexte

Le reçu de qualification fondatrice lie les preuves exécutables à un digest des
sources référencées. Ce digest utilisait jusqu'ici les octets du checkout. Sous
Windows, une même révision Git pouvait donc produire des digests différents selon
la matérialisation `CRLF` ou `LF`. Un reçu valide dans un checkout devenait
obsolète dans un worktree propre sans changement sémantique des sources.

## Décision

Avant de calculer le digest SHA-256 de chaque source textuelle du manifeste, le
runtime décode son contenu en UTF-8 et canonise toutes les fins de ligne en `LF`.
Le chemin relatif et le digest canonique restent ensuite inclus dans le digest
global ordonné des sources.

La génération d'un reçu devient une commande explicite qui exécute la suite de
preuves déclarée, exige que les révisions du manifeste soient des ancêtres de
`HEAD`, puis émet uniquement le reçu JSON. Les reçus historiques sont conservés ;
une nouvelle phase produit un nouveau fichier au lieu de réécrire l'ancien.

## Conséquences

### Positives

- deux checkouts de la même révision obtiennent le même digest de sources ;
- une modification de contenu reste détectée après canonisation ;
- le renouvellement du reçu est reproductible et observable ;
- les reçus antérieurs restent consultables comme preuves historiques.

### Limites

- le protocole suppose que les références du manifeste sont des fichiers UTF-8 ;
- la canonisation porte seulement sur les fins de ligne, pas sur Unicode ou les
  espaces ;
- le reçu borne la suite déclarée et ne constitue ni une preuve universelle ni
  une autorisation de promotion.

## Alternatives

Forcer globalement `core.autocrlf` est rejeté : la validité d'une preuve ne doit
pas dépendre de la configuration Git locale. Conserver les octets bruts est
rejeté car deux matérialisations équivalentes resteraient incompatibles. Réécrire
le reçu de phase 9 est rejeté car cela effacerait son identité historique.
