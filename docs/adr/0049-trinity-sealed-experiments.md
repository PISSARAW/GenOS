# ADR 0049 — Expériences Trinity scellées

- **Statut** : accepté
- **Date** : 2026-09-24

## Contexte

Le lancement Trinity utilisait trois workers, mais ne persistait ni leur identité de chambre ni un lien vérifiable entre leurs snapshots. La comparaison pouvait aussi signaler une fusion alors qu'aucun artefact n'avait passé de vérification d'intégration.

## Décision

Chaque expérience reçoit un identifiant durable, une empreinte SHA-256 du snapshot commun, une conception et des politiques d'isolation et de budget. Les trois workspaces d'écriture sont distincts et leur empreinte est comparée avant lancement. Les transitions d'état sont contrôlées par une machine à états persistée.

La comparaison prépare un artefact isolé. Tant que les vérifications d'intégration et l'enregistrement AgentGit ne sont pas effectués, cet artefact reste un candidat, l'expérience passe à `promotion_failed` avec le motif et la référence du candidat, et aucune réponse ne déclare `promoted`.

## Conséquences

- Une incohérence de snapshot ou un budget insuffisant bloque le lancement.
- Le cycle de vie et la provenance des chambres sont consultables en base.
- La promotion finale reste indisponible tant que la chaîne de vérification et AgentGit n'est pas raccordée ; le système échoue fermé au lieu de simuler sa réussite.

## Portée

Les variantes Trinity de recherche et l'agrégation Pareto de l'Evidence Vector ne sont pas couvertes par cette décision. Le contrat fonctionnel de référence reste [`trinity.md`](../02-orchestration/topologies/trinity.md).
