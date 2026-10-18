# ADR 0638 — Paquets signés du registre de confiance

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : confiance, révocation, déploiement, récupération
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0560, ADR 0625, plan de maturité vers 95/100

## Contexte

Le registre de révocation fondateur accepte des clés publiques actives, mais sa
configuration n'était ni signée, ni versionnée, ni récupérable. Le faisceau de
confiance fossile sait effectuer une rotation locale atomique, mais son ADR 0560
borne explicitement la garantie à un fichier non signé et sans anti-rollback.

## Décision

Introduire un paquet de confiance fondateur signé par une racine Ed25519 fournie
par l'hôte. La racine de paquet est distincte des clés de signature des autorités
de révocation. Le paquet contient :

- une génération strictement croissante ;
- le hash du paquet précédent, ou `null` uniquement au bootstrap ;
- une fenêtre de validité ;
- les clés publiques d'autorité avec statut `active` ou `revoked` ;
- la signature de racine et le hash canonique du paquet.

L'activateur vérifie le paquet candidat et sa lignée avant toute écriture. Il
installe atomiquement l'état actif et un miroir de récupération de même génération.
Le loader restaure l'actif depuis ce miroir uniquement si la signature, la
fraîcheur et le hash restent valides. La projection runtime exclut les autorités
révoquées et conserve le schéma consommé par le registre de révocation existant.

## Conséquences

### Positives

- un bootstrap vide, périmé ou non signé échoue fermé ;
- une rotation A/B permet le chevauchement avant retrait de A ;
- une corruption de l'actif est récupérable sans revenir à une génération
  antérieure ;
- aucun secret privé n'entre dans le paquet installé ou dans le dépôt ;
- le test raccorde la projection du paquet au vérificateur de révocation réel.

### Limites

- la racine publique reste une configuration de l'hôte ;
- aucune garde matérielle de la clé privée de racine n'est fournie ;
- l'activation locale n'est pas une distribution ou un consensus multi-hôte ;
- la tête de lignée n'est pas encore ancrée dans un stockage durable anti-rollback.

## Alternatives

Signer les révocations sans signer leur registre est rejeté : une substitution de
clés resterait possible. Réutiliser une clé d'autorité comme racine est rejeté :
la séparation des pouvoirs disparaîtrait. Restaurer un ancien paquet valide est
rejeté : la récupération doit conserver la même génération. L'ancrage durable de
la tête est reporté explicitement à la phase 14.
