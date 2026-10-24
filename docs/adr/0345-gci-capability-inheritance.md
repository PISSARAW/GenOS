# ADR 0345 — GenOS Capability Inheritance (GCI)

- **Statut :** Proposé
- **Date :** 2026-10-24
- **Domaine :** Capacités, autorité et intégration interprojets
- **Décideurs :** Équipe GenOS
- **Lié à :** Capability Graph, Capability Resolver, Capability Access Matrix, Tool Lease Policy

## Contexte

GenOS décrit déjà ses concepts, ses outils et leurs accès, mais ces données ne constituent pas un contrat d'export entre projets. Une découverte du graphe ne doit ni rendre une capacité exportable ni accorder son exécution. Le système doit permettre à un projet consommateur de sélectionner explicitement une capacité versionnée tout en bornant son autorité aux droits du projet.

## Décision

Introduire le contrat distinct `genos.gci.capability/v1` et un registre d'exports explicite. Le registre ne publie que les descripteurs configurés et reconnus dans le Capability Graph. Le manifeste projet et le lockfile ont des schémas versionnés distincts.

Les autorisations effectives sont l'intersection exacte entre les permissions requises par la capacité (y compris ses dépendances) et celles détenues par le projet. Les wildcards et élévations implicites sont refusés. Une capacité découverte ou déclarée n'est pas automatiquement exécutable.

Le MVP commence en mode Linked, sans boucle de mise à jour automatique. Les appels passent par un adaptateur qui revalide l'état de révocation et l'autorité à chaque effet sensible. Ontogenesis reste facultatif pour les projets Linked et sera sollicité par le futur mode Managed.

## Conséquences

### Positives

- Les capacités existantes peuvent être projetées sans changer leur modèle interne.
- L'export, l'adoption et l'autorité demeurent des décisions distinctes.
- Les manifestes et lockfiles peuvent être vérifiés et versionnés indépendamment.

### Négatives

- Les fournisseurs doivent déclarer explicitement les interfaces et empreintes d'artefact.
- La première version n'offre ni distribution Embedded ni gestion autonome.

## Alternatives

- Exposer automatiquement tous les concepts du Capability Graph : rejeté car le graphe inclut des éléments internes, partiels ou conceptuels.
- Réutiliser le manifeste des capacités d'agent comme contrat projet : rejeté car il décrit l'expression d'un agent, pas une dépendance interprojet.
