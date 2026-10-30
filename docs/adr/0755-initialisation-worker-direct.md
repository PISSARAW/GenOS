# ADR 0755 — Initialisation du worker direct

## Contexte

Sur une base fraîche, le dispatch direct rattachait l'orchestrateur à la mission avant de créer l'agent. La clé étrangère de `mission_agents` refusait alors le lancement.

## Décision

Initialiser l'orchestrateur avant de créer et rattacher la mission directe. Si la requête ne précise pas de workspace, utiliser `GENOS_WORKSPACE_ROOT` pour lier le parent au workspace configuré. Les autres actions conservent leur ordre d'initialisation.

## Conséquences

Une erreur de workspace empêche la création de la mission. L'initialisation ultérieure du parent reste idempotente.
