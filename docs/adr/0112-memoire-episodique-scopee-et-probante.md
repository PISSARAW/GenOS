# ADR 0112 — Mémoire épisodique cloisonnée et traçable

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Mémoire, GraphRAG, persistance, confidentialité, preuve
- **Décideurs** : GenOS

## Contexte

Les épisodes, les leçons autobiographiques et les nœuds GraphRAG étaient lus ou
consolidés sans périmètre cohérent. Le cycle de consolidation regroupait aussi
des épisodes par session seule, puis marquait comme traitées des lignes qui
n'avaient pas participé à un chemin. Enfin, certaines archives étaient
incomplètes ou ignorées avant suppression.

## Décision

- Chaque épisode et chaque leçon porte son organisation et son projet. Une
  lecture sans périmètre ne voit que la mémoire globale, et une lecture scoped
  reste dans son tenant.
- GraphRAG exige un périmètre explicite. Les appels globaux sont réservés aux
  usages internes qui le demandent explicitement. Les chemins gRPC transmettent
  le périmètre et appliquent les filtres aux nœuds et aux synapses.
- Une trajectoire est isolée par organisation, projet, agent, session et tâche.
  Seuls ses épisodes sources sont marqués consolidés. Leur identifiant reste
  présent dans la provenance du chemin produit.
- La consolidation de récompense ignore les épisodes purgés et applique ses
  changements dans une transaction.
- Une décision ne peut être supprimée qu'après l'archivage de son contenu
  complet. Un échec d'archive annule la transaction.
- Les tampons mémoire Rust ont des limites explicites de taille et de capacité;
  les parcours Neo4j sont bornés.
- Les souvenirs injectés dans un prompt restent des données non fiables, encadrées
  et signalées comme telles.

## Conséquences

### Positives

- Les souvenirs et les consolidations ne traversent plus les périmètres par
  défaut.
- Chaque chemin consolidé peut être ramené à ses épisodes sources.
- Une panne d'archivage ne transforme plus une suppression en perte silencieuse.
- Les entrées mémoire ne peuvent plus agrandir sans borne les tampons Rust.

### Négatives

- Les clients gRPC GraphRAG doivent transmettre un couple organisation/projet.
- Les anciennes lignes sans scope restent globales; elles ne sont pas
  automatiquement attribuées à un tenant.
- Le regroupement par tâche et agent peut retarder la consolidation quand les
  sessions sont courtes ou incomplètes.

## Alternatives

- Conserver un magasin épisodique partagé et filtrer seulement au rappel : rejeté,
  car les consolidations et les chemins produiraient déjà des mélanges avant le
  rappel.
- Supprimer les décisions même si la fossilisation échoue : rejeté, car le
  registre ne permettrait pas de récupérer la connaissance perdue.
- Utiliser la taille de récompense seule comme preuve d'un chemin : rejeté, car
  elle ne permet pas de retrouver les épisodes qui l'ont justifié.
