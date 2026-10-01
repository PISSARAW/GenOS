# ADR 0241 — Simulation contrefactuelle AGOW en espace isolé

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, expérimentation, isolation des effets
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0006, ADR 0007, ADR 0239, ADR 0240

## Contexte

La provenance contrefactuelle empêchait déjà les récepteurs AGOW d'écrire leurs
résultats dans les modèles canoniques. Elle ne fournissait pas de cycle cognitif
simulé, de namespace d'agent distinct, de budget d'exécution ni de reçu de branche.
Le planner historique sait créer un snapshot, mais ne restitue pas seul l'état cognitif
complet ni un environnement de mission isolé.

## Décision

Le backend ajoute un runner contrefactuel shadow autour du cycle AGOW existant. Chaque
branche reçoit un identifiant de simulation, un agent namespacé `cf:<simulation>:<agent>`
et le frame réel parent. Les candidats conservent leur origine de contenu tandis que
leur réalité devient contrefactuelle. Les cycles simulés utilisent les receivers locaux,
désactivent le transport et limitent les requêtes. Une garde n'autorise les écritures
des receivers que dans ce namespace enregistré.

Les simulations ont des limites dures de trois frames, trois requêtes, deux workers et
un coût maximal de 1. L'exécuteur de l'environnement est un callback explicitement
enregistré par l'hôte; le callback ne reçoit pas l'objet DB. Aucun résultat n'est
fabriqué si l'exécuteur manque. Les reçus sont persistés sur l'agent réel. Les modes
`shadow` calculent sans réinjecter de résultat; `advisory`, `bounded` et `live` peuvent
admettre les outcomes contrefactuels comme candidats marqués. `live` reste soumis aux
gates et ne promeut aucun résultat.

## Conséquences

### Positives

- Chaque branche a une identité, un parent, un hash de snapshot, des limites et un reçu.
- Les mutations des receivers du cycle shadow sont confinées à un agent simulé temporaire.
- Le transport externe et la récursion shadow sont désactivés dans les cycles simulés.
- Les politiques de regret et de réinjection ont des modes persistés par agent.

### Négatives

- Le registre des exécuteurs est en mémoire de processus et doit être réinstallé au boot.
- L'hôte doit fournir un adaptateur qui clone réellement les outils, modèles et état de
  mission; le snapshot AGOW seul n'est pas une restauration d'environnement.
- Les namespaces temporaires partagent la base backend; les receivers doivent toujours
  respecter la clé `agentId`.
- Les seuils et résultats calculés ne sont pas validés scientifiquement.

## Alternatives

- Réutiliser uniquement le planner historique : rejeté, car il ne simule pas le cycle
  AGOW ni ses receivers.
- Autoriser des candidats contrefactuels à écrire dans les stores réels : rejeté, car
  cela mélange les mondes et rend les reçus non interprétables.
- Activer un exécuteur synthétique par défaut : rejeté, car il simulerait une preuve
  sans exécuter l'environnement métier.
