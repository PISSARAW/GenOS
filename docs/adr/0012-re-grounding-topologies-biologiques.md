# ADR 0012b — Re-grounding durable des workers biologiques

## Statut

Acceptée

## Contexte

Les workers biologiques sont lancés comme processus indépendants. Une notification en mémoire peut être perdue et ne permet pas de prouver qu'un worker a intégré une révision Syncytium.

## Décision

Le journal durable `topology_session_events` est la source de vérité. Le worker lit les événements après sa dernière révision connue avec l'opération en lecture seule `events` de `genos_topology_session`. Son prompt lui impose des points de re-grounding avant ses décisions majeures et ses écritures partagées. La lecture reste bornée par `after_revision` et peut être reprise après redémarrage.

## Conséquences

Chaque résultat doit indiquer la révision prise en compte pour rendre le re-grounding auditable. L'opération ne garantit pas qu'un modèle respecte le prompt; l'acceptation d'une session devra donc contrôler les preuves de révision avant de revendiquer une convergence re-groundée.
