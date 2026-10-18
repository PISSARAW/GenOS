# ADR 0639 — Réparer GQWF depuis une réplique authentifiée

- **Statut** : Accepté, réparation locale bornée aux blobs
- **Date** : 2026-10-18
- **Domaine** : GQWF, CAS, réparation, quarantaine, tenants, preuves
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0635, ADR 0636

## Contexte

Le scrub GQWF détecte les objets manquants ou corrompus et la réplication CAS
crée une copie vérifiée, mais aucune opération n'est autorisée à remplacer un
objet divergent. Réutiliser directement une copie disponible confondrait
proximité technique et autorité de récupération. Une source doit être liée à
la cible et à la racine par une preuve antérieure, puis revérifiée avant toute
écriture.

Une réparation doit aussi préserver les octets divergents pour diagnostic,
résister à une interruption et distinguer un rejeu d'un nouvel incident.

## Décision

Introduire `gqwf-cas-repair-v1` avec deux opérations :

1. `inspectRepair` vérifie le reçu de réplication, la source et les deux
   manifestes, classe les blobs cibles et produit un plan déterministe ;
2. `repairRoot` exige ce `planHash`, une autorisation liée, restaure les objets
   depuis la source puis vérifie de nouveau toute la racine.

La source et la cible restent deux workspaces distincts du même tenant et du
même projet. Le reçu `gqwf-cas-replication-v1` doit être canonique, intact et
porter exactement la source, la cible et la racine demandées. Chaque blob
source doit être un fichier régulier privé dont le SHA-256 et la taille
correspondent au manifeste.

Un blob cible absent est recréé par l'écriture CAS existante. Un blob corrompu
mais régulier et privé est déplacé sous `.genos/gqwf/quarantine/` avant la
copie. Les symlinks, hardlinks et fichiers spéciaux échouent fermés. Une
interruption après la quarantaine laisse donc soit un objet CAS valide, soit
un objet absent que le prochain plan peut restaurer.

Le reçu `gqwf_repair_receipts` contient l'identité de l'opération, le reçu de
réplication, les empreintes avant/après, le nombre de blobs restaurés et le
nombre de quarantaines. Plusieurs incidents identiques peuvent produire des
reçus distincts ; un rejeu séquentiel sur une cible saine retourne le dernier
reçu compatible.

## Conséquences

### Positives

- La réparation n'accorde aucune autorité implicite à une copie voisine.
- Les octets corrompus restent disponibles pour analyse.
- Le plan périmé, le changement de scope et la preuve falsifiée sont refusés.
- Une seconde corruption de la même racine est un nouvel incident traçable.

### Négatives

- Les manifestes et métadonnées SQLite ne sont pas reconstruits.
- La source et la cible doivent être accessibles au même backend.
- La relecture complète de la racine augmente le coût de récupération.
- La quarantaine doit être gérée par une politique de rétention ultérieure.

## Alternatives

### Écraser tout blob divergent pendant la réplication

Rejeté : la réplication et la réparation ont des autorités et des risques
différents ; les confondre rendrait un incident destructif silencieux.

### Restaurer depuis n'importe quel workspace possédant le même hash

Rejeté : l'identité de contenu n'établit ni le tenant, ni la provenance, ni
l'autorisation d'écrire dans la cible.

### Supprimer immédiatement les octets corrompus

Rejeté : leur conservation bornée aide l'analyse et évite de présenter un
écrasement destructif comme une réparation neutre.

## Validation

`node backend/tests/test_gqwf_repair.js` couvre les blobs manquants et
corrompus, la quarantaine, le plan périmé, le rejeu, une seconde corruption,
le scope tenant, l'absence de provenance, l'authorizer absent ou non lié, un
objet cible non régulier et la falsification du reçu de réparation.
