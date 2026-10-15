# ADR 0511 — Rejouer un crossover sans avancer le tick

- **Statut** : Accepté et implémenté pour les commandes CLI crossover isolées.
- **Date** : 2026-10-15
- **Domaine** : Idempotence des opérations biologiques persistées.
- **Décideurs** : Mainteneur GenOS.
- **Lié à** : ADR 0507, phases de rejeu applicables; ADR 0510, budgets fail-closed.

## Contexte

Chaque appel `biological --tick` restaurait le checkpoint puis exécutait un
nouveau tick avant de rechercher le reçu de crossover idempotent. Une reprise
après un résultat déjà persisté pouvait ainsi modifier l'état génétique avant
de restaurer le reçu déterministe. Le CLI refusait alors le crossover enfant
comme conflit, et une clé de replay absente pouvait quand même produire un tick.

## Décision

Une commande ne contenant qu'un crossover (création ou replay) recherche son
reçu avant d'avancer le tick. Si le reçu existe, le runtime le valide et le
réinstalle depuis le checkpoint, persiste le checkpoint et retourne le tick
courant. Une clé de replay inconnue est refusée avant tout tick ou reçu. Une
première demande de crossover continue d'exécuter un tick avant de produire le
reçu; les commandes combinant le crossover à d'autres mutations gardent leur
ordre tick puis opérations.

## Conséquences

### Positives

- Une répétition idempotente ne rejoue pas les mutations biologiques antérieures.
- Un replay inconnu n'a pas d'effet de bord sur la mission.
- Les commandes combinées conservent leur séquence d'exécution existante.
- `biological_crossover` vérifie l'identité du reçu et l'absence d'avancement du
  tick sur retry et replay interprocessus.

### Négatives

- La détection préalable ne s'applique qu'aux commandes crossover isolées; une
  commande combinée doit être conçue avec son propre identifiant idempotent si
  elle doit être reprise comme une transaction entière.

## Alternatives

- Laisser chaque retry exécuter un tick et tolérer les conflits d'enfant : rejeté,
  car l'identité de l'opération ne protège pas les mutations précédant le reçu.
- Réinstaller sans contrôle le contenu du reçu sur l'état courant : rejeté, car
  cela pourrait écraser une divergence réelle du génome déjà restauré.
