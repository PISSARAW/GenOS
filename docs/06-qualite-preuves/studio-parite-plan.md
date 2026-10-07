# Studio — programme de parité et différenciation

- **Statut** : Programme validé, exécution incrémentale ; parité non démontrée.
- **Dernière revue** : 2026-10-07.
- **Base** : `codex/studio-completion`, huit lots initiaux à `6a3c7b6f`.

## Contrat de livraison

Un lot se décompose en points atomiques numérotés : un commit par point.
Une API présente n'est pas un parcours Studio qualifié. Les observations
statiques ci-dessous ne constituent pas une certification des services.
Chaque point doit fournir : scénario utilisateur, refus, effet vérifié,
tests exécutés, portée plateforme et limites. Les fixtures et captures
restent ignorées par Git ; aucun secret n'entre dans le registre.

Les statuts sont : **planifié**, **backend à qualifier**, **partiel**,
**qualifié sur une portée explicite**. Une fonction expérimentale ne devient
pas achevée parce qu'un écran ou un reçu de transport existe.

## Références et comparaison

La matrice traduit les domaines communs de la cartographie concurrentielle,
pas une égalité mesurée avec tous les produits. Les sources sont consultées
le 2026-10-07 ; versions, disponibilité et conditions doivent être gelées
avant une campagne comparative. Les offres arrêtées ne sont pas des cibles.

- [LangSmith Studio](https://docs.langchain.com/langsmith/studio) et
  [Deployment](https://www.langchain.com/langsmith/deployment) : inspection,
  registry, exécution durable, approvals et exploitation.
- [Agno Control Plane](https://www.agno.com/products/control-plane),
  [CrewAI AMP](https://docs-platform.crewai.com/platform/en/introduction),
  [Mastra](https://mastra.ai/) : consoles et construction d'agents.
- [Flowise](https://flowiseai.com/), [Dify](https://dify.ai/),
  [Langflow](https://www.langflow.org/) : construction visuelle.
- [Braintrust](https://www.braintrust.dev/),
  [Langfuse](https://langfuse.com/), [Phoenix](https://arize.com/phoenix/) :
  traces, datasets, évaluations et comparaisons.
- [Temporal](https://temporal.io/), [Kestra](https://kestra.io/) :
  reprise et supervision de workflows.
- [n8n](https://n8n.io/), [Workato](https://www.workato.com/agentstudio) :
  automatisation, intégrations et déclencheurs.
- [OpenHands](https://www.openhands.dev/) : missions de développement.
- [Datadog](https://www.datadoghq.com/products/ai/agent-observability/) :
  observabilité opérationnelle.

Un benchmark futur couvre un scénario identique, les mêmes entrées et outils,
les ressources, permissions, versions et erreurs ; il publie résultats par cas,
variabilité, coûts observés et inconnus. Les pages commerciales ne prouvent
ni une performance ni une supériorité de GenOS. Les autres rivaux de la
cartographie doivent être rattachés aux capacités avant une parité exhaustive.

## Fondations

| ID | Livrable | Acceptation |
| --- | --- | --- |
| F01 | Matrice et registre | Tous les lots validés sont identifiés, sans faux statut terminé |
| F02 | Base Git et risques d'intégration | Checkout opérateur intact ; divergences explicites |
| F03 | Frontières et contrats | ADR, droits serveur, API et migration conservés |
| F04 | Harnais de qualification | Ports isolés, erreurs navigateur, captures et probes de refus |

## Domaines communs

| ID | Capacité / références | État observé à la base | Critère de sortie |
| --- | --- | --- | --- |
| C01 | Navigation / studios | Partiel : cinq vues sans liens profonds | Connexion séparée, contexte compact, historique et routes sûres |
| C02 | Composants métier / studios | Partiel : JSON principalement brut | Tables, fiches, badges et détails ; JSON secondaire |
| C03 | Accessibilité / consoles | Partiel : mobile testé sur une seule vue | Clavier, focus, largeur, états ; audit sur toutes les vues |
| C04 | Onboarding / studios | Partiel : configuration manuelle et diagnostics | Première lecture vérifiée guidée, refus et états vides utiles |
| C05 | Catalogue / Agno, CrewAI | Backend à qualifier : deploy, dossiers | Versions immuables et configuration référencée par run |
| C06 | Workflows / Flowise, Dify | Backend à qualifier : workflowRoutes | Édition visuelle/texte sans perte, validation, exécution réelle |
| C07 | Playground / Mastra | Planifié côté Studio | Tests, streaming, inspection ; simulation distincte |
| C08 | Prompts / Braintrust | Planifié côté Studio | Variables typées, versions, diffs, configuration par sortie |
| C09 | Modèles / plateformes | Backend à qualifier : modelProvider, routing | Capacités, routage/fallback visible, quotas et coûts honnêtes |
| C10 | Outils / studios | Backend à qualifier : MCP et leases | Catalogue, schémas, tests et secrets protégés |
| C11 | Déclencheurs / n8n, Workato | Backend à qualifier : webhooks | Connecteurs listés, doublons, signatures, révocation |
| C12 | RAG / deepset, Dify | Backend à qualifier : knowledge, graphRag | Ingestion/version/ACL/citations/suppression évaluées |
| C13 | Traces / Langfuse, Phoenix | Partiel : étapes, SSE, provenance | Arbre, chronologie, corrélation et données masquées |
| C14 | Dashboards / Datadog | Partiel : trois compteurs et événements | Mesures, fraîcheur, alertes et trous de couverture |
| C15 | Datasets / Braintrust | Partiel : cas et jobs capturés | Versions, splits, annotation et désaccords |
| C16 | Évaluations / Braintrust | Partiel : jobs/comparaison/rejeu | Cas, juges identifiés, répétitions et régressions CI |
| C17 | Sécurité / Promptfoo, Giskard | Backend à qualifier : suites de sécurité | Scénarios adverses isolés et probes reproductibles |
| C18 | Durabilité / Temporal | Partiel : arrêt/restart et reprise runtime | Crash/reprise, retries sûrs, réconciliation des effets incertains |
| C19 | Ressources / runtimes | Backend à qualifier : garage/budgets | Réservations et plafonds imposés sous concurrence |
| C20 | Humain / LangSmith | Partiel : approbation signée JSON | Inbox/contextes/rejet/expiration/droits vérifiés |
| C21 | Workspace / OpenHands | Partiel : UTF-8/CAS/snapshots | Git/worktrees, artefacts et revue avec confinement |
| C22 | Collaboration / Dust | Planifié côté Studio | Commentaires, assignations, partage révocable et historique |
| C23 | Canaux et médias / Voiceflow | Backend à qualifier : outils multimodaux | Chat et adaptateurs déclarés, droits et rétention médias |
| C24 | Gouvernance / suites entreprise | Partiel : tenant/rôles/clé en mémoire | SSO, services, audit, suppression, rotation qualifiés |
| C25 | Publication / LangSmith | Backend à qualifier : deploy/workflows | Environnements, versions observées, canary/rollback testés |
| C26 | Exploitation / plateformes | Partiel : Windows natif | Linux/Docker, sauvegarde, charge, workers et HA mesurés |

## Positionnement propre à Studio

Ces axes ne constituent pas une revendication d'exclusivité mondiale.

| ID | Capacité | État à la base | Critère de sortie |
| --- | --- | --- | --- |
| S01 | Mondes/lignées/diffs | Partiel : graphe borné | Liens de provenance réels et couverture explicite |
| S02 | Contre-factuels | Backend à qualifier | Fork isolé, facteurs identifiés, comparaison contrôlée |
| S03 | Rejeu gradué | Partiel : entrées capturées | Historique, capture et nouvelle exécution distingués |
| S04 | Dossier de preuve | Partiel : ledger/provenance | Liens navigables, contradictions et manques visibles |
| S05 | Promotion/invalidation | Partiel : gate signé | Revue, refus et impacts d'invalidation sans bypass |
| S06 | Mémoire de branches | Backend à qualifier | Recherche/transfert tracés, portée et origine conservées |
| S07 | Trials scientifiques | Partiel : protocole déclaré | Exécuteur réel, contrôles, répétitions et environnement figé |
| S08 | Budgets inter-branches | Backend à qualifier | Réservations/allocation cohérentes ; budgets de trials imposés |
| S09 | Topologies/morphogenèse | Backend à qualifier | Contrats, transformation et effet mesuré ; maturité visible |
| S10 | Arène durable | Partiel : cache numérique | Traces persistées, contrôles, Pareto et réplications |

## Jalons et dépendances

1. J0 : F01–F04 ; base et preuves.
2. J1 : C01–C04 ; UI lisible, premières vues C13/S01.
3. J2 : C05–C12 ; construction et tests.
4. J3 : C18–C20 et socle C24 ; contrôle réel d'exécution.
5. J4 : C13–C17/S04 ; évaluation et preuves.
6. J5 : S02–S10 ; expérience GenOS complète.
7. J6 : C21–C23/C25 ; collaboration, canaux et publication.
8. J7 : C26 et durcissement global ; production mesurée.

Tenant, confinement, secrets et autorisation serveur sont transversaux dès J0.
L'UI ne signe pas à la place de l'opérateur et n'élargit pas ses pouvoirs.

## Suivi

Voir [la qualification initiale](studio-qualification.md), puis
[le suivi du programme](studio-parite-suivi.md). Aucun lot de la matrice
ne peut être déclaré entièrement terminé par un sous-point isolé.
