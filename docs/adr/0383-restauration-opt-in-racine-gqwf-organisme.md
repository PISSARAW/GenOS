# ADR 0383 — Restaurer les fichiers d'organisme depuis une racine GQWF

- **Statut** : Accepté, activation explicite
- **Date** : 2026-10-10
- **Domaine** : Snapshots d'organisme, GQWF, restauration
- **Décideurs** : Équipe GenOS
- **Lié à** : [ADR 0367](0367-sections-durables-snapshot-organisme.md), [ADR 0378](0378-reference-gqwf-dans-snapshot-organisme.md)

## Contexte

L'ADR 0378 lie une racine GQWF au snapshot historique, mais la restauration
relit encore son payload. La racine ne servait donc pas à restaurer les fichiers
quand ce payload avait disparu. La restauration historique possède déjà un
verrou, un snapshot de sécurité, une copie vérifiée et un rollback.

## Décision

`restore` et `checkout` acceptent `gqwfV2: true` si le snapshot d'organisme
contient une racine GQWF. GenOS vérifie le lien durable, le manifeste de la
racine et l'identité chemin/hash/taille avec le manifeste historique. Il lit
chaque blob avec contrôle SHA-256, matérialise les fichiers dans un répertoire
temporaire, puis utilise le protocole de restauration existant. La réponse
indique `gqwfRootRestored: true` seulement après la copie vérifiée.

Le mode par défaut restaure toujours depuis le payload historique. Un snapshot
sans racine refuse la demande explicite. Si la préparation des fichiers échoue
avant toute mutation, le workspace reste intact. Après la première mutation,
le snapshot de sécurité sert au rollback. Les modes restent assainis et la
racine ne représente que la projection autorisée des fichiers.

## Conséquences

- Une restauration GQWF peut réussir même si les octets du payload historique
  manquent, à condition que son manifeste et les blobs GQWF restent intègres.
- Une racine ou un blob corrompu ne produit pas une restauration réussie.
- Les snapshots capturés avant cette décision gardent leur manifeste signé,
  y compris l'ancienne valeur `restorable: false` ; leur capacité actuelle
  dépend de la présence d'une racine valide et de la demande explicite.
- SQLite, le curseur Rust, la RAM, le contexte caché du fournisseur et les
  effets externes ne deviennent pas une transaction globale.

## Alternatives

- Remplacer la restauration historique par défaut : écarté pour préserver le
  contrat des captures existantes.
- Restaurer directement depuis les blobs dans le workspace : écarté pour
  conserver la préparation et le rollback du protocole de fichiers existant.

## Vérification

Le test d'intégration couvre la capture, la restauration explicite, le checkout
sans octets historiques, le refus sans racine, et la conservation du workspace
quand un payload historique ou un blob GQWF est absent ou corrompu.
