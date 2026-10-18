# ADR 0631 — Séparer conteneur de bail et racine d'exécution GQWF

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : GQWF, workspaces, OverlayFS, snapshots, reprise
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0378, ADR 0608, ADR 0628, ADR 0629, ADR 0630

## Contexte

Le bail GQWF utilisait un seul dossier pour la preuve de possession, les
fichiers remis au runtime et les opérations du backend. Cette disposition
convient à une copie ou à un reflink, mais pas à un overlay monté : monter la
racine au même endroit masquerait le marqueur de propriété et rendrait la
libération ou la reprise après crash ambiguë.

Placer le marqueur dans la racine visible l'exposerait au processus et à la
capture de candidate. Déduire le point de montage uniquement depuis le backend
serait insuffisant pour une reprise durable après redémarrage.

## Décision

`gqwf_leases.path` devient le conteneur possédé par GQWF. Le nouveau champ
`execution_path` enregistre la racine remise au runtime. Un nouveau bail utilise
exclusivement l'enfant direct `root/` du conteneur ; toute autre valeur est
refusée avant lecture ou suppression.

Le marqueur `.genos-gqwf-lease` reste dans le conteneur. Le backend reçoit
`containerPath` et `destination` pendant la matérialisation, capture seulement
`sourcePath`, puis reçoit `path` et `executionPath` pour libérer ou reprendre.
La valeur retournée par `materialize` doit correspondre exactement à la racine
attendue. Le runtime et les bindings workers continuent à recevoir uniquement
la racine d'exécution.

La migration ajoute le champ sans réécrire les fichiers. Les baux historiques
sont rétroremplis avec `execution_path = path`. Un enregistrement ancien encore
créé sans ce champ garde le même fallback explicite. Le reçu de matérialisation
reste l'autorité sur le backend employé.

## Conséquences

### Positives

- Un montage futur peut couvrir `root/` sans masquer la preuve de possession.
- Les métadonnées du backend ne peuvent pas entrer dans une candidate.
- La reprise connaît durablement le conteneur et la racine à démonter.
- Les APIs mission et worker conservent leur chemin de workspace existant.
- Les baux historiques restent libérables sans migration de fichiers.

### Négatives

- Chaque nouveau bail ajoute un niveau de répertoire.
- Les contrôles d'autorité doivent comparer le runtime à `execution_path` et le
  marqueur à `path`.
- Cette tranche prépare les backends montés mais n'en active aucun.

## Alternatives

- Monter directement sur le dossier du bail : rejeté, car le marqueur serait
  masqué et la reprise ne pourrait plus prouver la possession.
- Placer le marqueur dans la racine d'exécution : rejeté, car le runtime pourrait
  le modifier et la capture devrait dépendre d'une exclusion implicite.
- Ne pas persister le point d'exécution : rejeté, car une reprise après crash ne
  peut pas se fier à un calcul propre à une version de backend.
