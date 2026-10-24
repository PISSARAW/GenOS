# ADR 0738 — Boucle de développement social intégrée à l’Ontogenèse

- **Statut :** Accepté
- **Date :** 2026-10-24
- **Domaine :** Runtime, AGOW, Ontogenèse, RPE, mémoire autobiographique, morphogenèse
- **Décideurs :** GenOS maintainers
- **Lié à :** protocole SocialWorld V2; ADR 0735 — classement du routage par confiance sociale vérifiée

## Contexte

GenOS possède déjà des mécanismes de perception, d’attention, d’arbitrage de mission,
de communication relationnelle, de morphogenèse et de mémoire autobiographique. Leur
présence séparée ne prouve pas qu’une observation sociale modifie une interaction future.
Une seconde Ontogenèse dédiée à la vie sociale créerait des contrôleurs concurrents pour
les priorités, budgets, autorisations et continuité.

## Décision

Ajouter un raccord social opt-in dans le cycle d’événements déjà utilisé par le runtime :

1. Une observation sociale explicitement scopée est admise comme candidat d’attention AGOW.
2. L’arbitrage d’Ontogenèse et le plan de mission existants doivent autoriser l’action.
3. Le modèle configuré propose une action structurée et limitée à « contacter » ou « silence ».
   Il choisit seulement parmi les relations du même tenant et projet; sa réponse n’est pas une
   preuve de permission, de livraison ou de résultat.
4. Le checkpoint de communication existant applique RPE, audience, politique de canal,
   autorisations, budget et reçus. L’audience demandée par le modèle est un filtre additionnel,
   jamais une autorisation.
5. La mémoire autobiographique distingue explicitement une livraison d’un succès vérifié.
   L’apprentissage de confiance exige un résultat d’évaluation vérifié indépendant.
6. Une clé idempotente persistée et une lease empêchent deux workers de traiter simultanément
   la même observation. Les propositions, réponses de modèle et chaînes de pensée ne sont pas
   persistées.

La morphogenèse fournit le contexte de topologie au checkpoint existant; cette boucle ne
crée pas un contrôleur de topologie autonome. Les décisions restent bloquées si AGOW est
désactivé, si le cadre AGOW n’a pas retenu le candidat ou si le mode n’est pas `bounded`.

## Conséquences

### Positives

- La perception, l’arbitrage, le routage, la mémoire et l’apprentissage passent par les
  services GenOS déjà responsables de ces fonctions.
- Le choix du LLM est reproductible par graine, ses propositions sont vérifiées contre les
  relations persistées, et les reçus déterminent si la communication a été livrée.
- Les observations sont traitées au plus une fois après complétion; une lease expirée permet
  la reprise d’un traitement interrompu.

### Négatives

- La boucle n’agit que sur les observations sociales explicitement fournies par le runtime;
  elle ne garantit pas encore une vie sociale spontanée en l’absence de ces observations.
- Une livraison attestée n’établit pas que l’aide a été utile. Cette conclusion exige un
  résultat de tâche vérifié et un run d’évaluation référencé.
- Le protocole causal multi-graines et son pilote Qwen doivent être exécutés séparément avant
  toute conclusion comparative.

## Alternatives

- **Créer une Ontogenèse sociale séparée :** rejeté, car cela dupliquerait arbitrage,
  permissions, budgets et continuité.
- **Laisser le LLM décider seul du contact :** rejeté, car une réponse textuelle ne prouve ni
  compétence, ni relation, ni autorisation, ni livraison.
- **Mettre à jour la confiance après un simple accusé de réception :** rejeté; l’accusé
  établit la livraison, pas l’utilité de la collaboration.
