# ADR 0636 — Répliquer les racines GQWF par contenu

- **Statut** : Accepté, réplication locale inter-workspaces
- **Date** : 2026-10-18
- **Domaine** : GQWF, CAS, réplication, tenants, reprise, preuves
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0614, ADR 0635

## Contexte

Le scrub `gqwf-scrub-v1` détecte une corruption mais ne peut pas la réparer :
GQWF ne dispose encore d'aucune autre copie authentifiée. Avant d'introduire
une restauration, il faut savoir transporter une racine et ses blobs vers un
autre store sans remplacer silencieusement un contenu divergent, traverser un
tenant ou confondre une réponse de transport avec une réplication valide.

Les blobs étant adressés par SHA-256, une interruption peut laisser des objets
déjà copiés sans rendre le store incohérent. La reprise doit les vérifier et
les réutiliser plutôt que recommencer une copie complète.

## Décision

Introduire le protocole `gqwf-cas-replication-v1` avec deux opérations :

1. `inspectReplication` calcule un plan déterministe et son `planHash`, puis
   annonce les blobs déjà vérifiés, ceux à transférer et les octets attendus ;
2. `replicateRoot` exige exactement ce `planHash`, transfère seulement les
   blobs absents, publie le manifeste dans le store cible et persiste un reçu
   après relecture complète de la destination.

La source et la cible doivent être deux workspaces distincts du même
`organization_id` et du même `project_id`. Un authorizer injecté doit produire
une preuve liée à l'opération, au protocole, aux deux workspaces, au scope, à
la racine et au `planHash`. Une décision générique `allowed` est insuffisante.

Un blob cible n'est réutilisé que s'il est un fichier régulier privé, sans
symlink ni hardlink, avec le hash et la taille attendus. Un blob cible présent
mais divergent bloque l'opération : la réplication ne constitue pas encore une
autorité de réparation.

Le reçu est sérialisé en JSON canonique, hashé et conservé dans
`gqwf_replication_receipts`. L'unicité
`source + cible + racine + plan` rend le rejeu idempotent. Une interruption
avant le reçu peut laisser des blobs CAS valides ; le prochain passage les
revérifie et reprend sur les objets restants.

## Conséquences

### Positives

- Les racines peuvent être dupliquées sans recopier les blobs déjà présents.
- La reprise après interruption est naturelle et ne demande pas de journal de
  progression mutable.
- Le passage inter-tenant et l'autorisation non liée échouent fermés.
- Le reçu de destination prouve le plan, le scope et les octets observés.

### Négatives

- Cette tranche transporte entre workspaces accessibles au même backend ; elle
  n'implémente pas encore un protocole réseau inter-hôtes.
- L'authorizer est une dépendance obligatoire du runtime appelant.
- Une cible corrompue doit être mise en quarantaine ou réparée par une future
  opération distincte.
- La copie lit chaque blob intégralement afin de conserver la vérification de
  contenu.

## Alternatives

### Copier directement le dossier `.genos/gqwf`

Rejeté : aucune isolation de tenant, aucun contrôle par blob et aucun reçu de
destination ne seraient garantis.

### Écraser un blob cible divergent

Rejeté : la présence du hash dans le chemin ne prouve pas que la source est
autorisée à réparer la cible.

### Utiliser uniquement un flux ZFS/Btrfs

Rejeté comme contrat universel : ces flux restent des accélérateurs possibles,
mais GQWF doit vérifier ses identités logiques sur les backends portables.

## Validation

`node backend/tests/test_gqwf_replication.js` couvre la déduplication, la reprise
idempotente, la parité de racine, le plan périmé, le scope tenant, l'authorizer
absent ou non lié et le refus d'une cible corrompue.
