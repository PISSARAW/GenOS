# ADR 0378 — Référencer une racine GQWF dans un snapshot d'organisme

- **Statut** : Accepté, activation explicite
- **Date** : 2026-10-10
- **Domaine** : Snapshots d'organisme, fichiers, GQWF
- **Décideurs** : Équipe GenOS
- **Lié à** : [ADR 0367](0367-sections-durables-snapshot-organisme.md), [ADR 0369](0369-racines-gqwf-et-vues-durables.md)

La restauration explicite depuis cette racine est ajoutée par l'[ADR 0383](0383-restauration-opt-in-racine-gqwf-organisme.md).

## Contexte

Un snapshot d'organisme référence déjà un snapshot de workspace et des sections
durables. GQWF peut importer le payload vérifié de ce snapshot historique, mais
la capture d'organisme ne conservait pas la racine produite. Une racine GQWF ne
représente ni la RAM, ni l'environnement d'exécution, ni une transaction globale.

## Décision

La requête de capture ou de commit peut spécifier `gqwfV2: true`. GenOS capture
d'abord le snapshot de workspace existant, importe son payload vérifié dans
GQWF, puis inscrit `gqwfRootHash` dans la référence de workspace du manifeste
d'organisme. Le composant `gqwfFileRoot` porte le statut `captured-reference` et
`restorable: false`. Son identité est couverte par le hash du manifeste.

Avant une restauration, GenOS vérifie que le lien durable associe toujours
le même workspace, snapshot historique, hash historique et root GQWF. Il
vérifie aussi l'intégrité du manifeste GQWF. La restauration utilise toujours
le payload historique. Une référence GQWF manquante ou incohérente refuse la
restauration de ce snapshot opt-in avec un conflit explicite.

## Conséquences

Le mode par défaut reste inchangé. Une capture opt-in coûte un import de fichiers
supplémentaire ; son échec ne fabrique pas un snapshot d'organisme réussi. Le
snapshot historique peut rester enregistré si l'import ou la capture des autres
sections échoue, car ces opérations n'ont pas de transaction commune.

La référence prépare une migration contrôlée des fichiers, sans annoncer une
restauration GQWF ni une promotion automatique. Les missions Rust, le contexte
caché du fournisseur et les effets externes gardent leurs frontières actuelles.

## Alternatives

- Remplacer immédiatement le payload historique : écarté faute de protocole de
  restauration GQWF et de rollback atomique avec les autres sections.
- Ajouter une racine sans vérifier son lien au snapshot historique : écarté car
  le manifeste pourrait désigner une projection différente des fichiers capturés.
