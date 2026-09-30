# ADR 0184 — Persistance du moteur de créativité

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Créativité, runtime Rust, persistance
- **Décideurs** : GenOS
- **Lié à** : [ADR 0175](0175-checkpoints-interprocessus-persistes.md)

## Contexte

`genos-creativity` contient le moteur visé par la fiche imagination, mais il
n'est pas membre du workspace Cargo. `genos-orchestrator` contient également un
moteur historique distinct, sans construction ni appel observé dans le dépôt.
La mémoire exportable de `genos-creativity` ne comprend actuellement que les
hypothèses et son compteur de tick.

## Décision

Activer `genos-creativity` comme membre du workspace. Persister son état via un
contrat versionné générique dans `genos-store`; ne pas faire dépendre le stockage
des types du moteur. Le moteur offrira une API explicite de sauvegarde et de
restauration de sa mémoire et de ses métriques. La sélection du chemin runtime
et l'appel de cette API restent explicites : aucun branchement automatique à
l'orchestrateur historique ne sera affirmé.

## Conséquences

### Positives

- Le crate réellement décrit par la fiche devient compilable et intégrable par
  le workspace.
- Le checkpoint peut évoluer sans couplage entre stockage et moteur.
- Les métriques nécessaires à la continuité sont incluses dans l'état durable.

### Négatives

- Un hôte doit appeler l'API de checkpoint à ses frontières de cycle.
- Le générateur aléatoire n'est pas restauré; après reprise, les résultats
  restent bornés mais ne sont pas reproductibles à l'identique.

## Alternatives

- Persister uniquement le moteur historique de `genos-orchestrator` : rejeté,
  car il n'est pas appelé dans le runtime observé et ne correspond pas au crate
  nommé par la fiche.
- Lier directement `genos-store` aux types de `genos-creativity` : rejeté pour
  éviter le couplage des couches.
