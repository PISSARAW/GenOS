# ADR 0345 — GenOS Capability Inheritance (GCI)

- **Statut :** Accepté pour les lots Linked et Embedded/Managed initiaux
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

Le lot Embedded distribue l'artefact avec le descripteur dans un paquet à signature Ed25519. Le consommateur épingle une clé publique de confiance, vérifie la signature et le digest, puis remet les octets à un runtime sandbox fourni par son intégrateur. GCI ne charge pas de module arbitraire et ne prétend pas imposer la sandbox du fournisseur. Hors ligne, le consommateur consulte son état local de révocation : une révocation centrale ne peut pas arrêter une installation déconnectée.

Le mode Managed ne lance pas directement la capacité. Il vérifie l'installation, les révocations et l'autorité, puis délègue une mission idempotente au service de délégation Ontogenesis existant. La responsabilité SHÉV doit être active et au stade délégué; l'exécution isolée, les checkpoints et la vérification restent gouvernés par Ontogenesis.

Les plans d'évolution sont des propositions déterministes sans effet sur l'installation. Ils conservent les versions incompatibles ou non autorisées comme refus et exigent une adoption explicite après vérification indépendante. Aucune fusion automatique n'est permise.

## Conséquences

### Positives

- Les capacités existantes peuvent être projetées sans changer leur modèle interne.
- L'export, l'adoption et l'autorité demeurent des décisions distinctes.
- Les manifestes et lockfiles peuvent être vérifiés et versionnés indépendamment.
- Les paquets Embedded peuvent être vérifiés puis exécutés hors ligne par un runtime local contrôlé par le consommateur.
- Le mode Managed réutilise les responsabilités, baux, capsules et preuves d'Ontogenesis.

### Négatives

- Les fournisseurs doivent déclarer explicitement les interfaces et empreintes d'artefact.
- La première version n'offre ni distribution Embedded ni gestion autonome.
- La fraîcheur des révocations Embedded dépend du dernier instant où le consommateur a pu synchroniser son état local.
- Le gestionnaire de clés Embedded appartient à l'intégrateur; GCI ne fournit ni rotation de clés ni registre public de confiance dans ce lot.
- Un candidat d'évolution doit rester une proposition tant qu'un nouvel opérateur n'a pas produit ses preuves indépendantes.

## Alternatives

- Exposer automatiquement tous les concepts du Capability Graph : rejeté car le graphe inclut des éléments internes, partiels ou conceptuels.
- Réutiliser le manifeste des capacités d'agent comme contrat projet : rejeté car il décrit l'expression d'un agent, pas une dépendance interprojet.
