# ADR 0203 — Parcours CLI `init`, `doctor`, `run`

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : CLI, expérience opérateur, orchestration
- **Décideurs** : GenOS maintainers
- **Lié à** : ADR 0034, ADR 0180, ADR 0202

## Contexte

Le CLI expose de nombreuses opérations, mais le chemin de première utilisation
ne permettait pas d'initialiser un workspace, d'inspecter les dépendances et de
lancer une mission avec des commandes faciles à découvrir. Il faut garder les
capacités disponibles explicites : une sonde absente ou non accessible ne doit
pas apparaître comme disponible.

## Décision

- `genos init` crée les répertoires de base sans écraser de configuration.
- `genos doctor` affiche un statut par dépendance : disponible, dégradé,
  indisponible ou inconnu. Les sondes absentes (MCP, sandbox, index) restent
  inconnues ; le backend est disponible uniquement si `/readyz` réussit.
- `genos run "mission"` transmet le texte au backend orchestrateur existant depuis
  un checkout GenOS. Les options historiques `run --mode trinity` restent prises
  en charge. La commande ne prétend pas exécuter une mission sans Node ou backend.

## Conséquences

### Positives

- Le parcours initial tient en trois commandes et indique les prérequis manquants.
- L'exécution passe par le chemin d'orchestration existant.
- Les capacités non sondées ne reçoivent pas de faux statut vert.

### Négatives

- `genos run "mission"` exige un checkout GenOS et une installation backend
  fonctionnelle ; cette tranche ne fournit pas un binaire autonome.
- Certaines capacités demeurent `? unknown` jusqu'à la disponibilité d'une sonde
  de host ou de daemon.

## Alternatives

- Ajouter un deuxième orchestrateur directement au CLI : rejeté, cela dupliquerait
  les politiques backend.
- Afficher disponibles les composants dont seule la configuration est détectée :
  rejeté, cela surestimerait leur autorité.
