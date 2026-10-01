# ADR 0239 — Socle de développement évolutif vérifié (GVX)

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Décideur** : demande utilisateur « Lance le plan, un commit par point »
- **Domaine** : Ontogenèse, morphogenèse, persistance, expériences, AgentDNA, preuve

## Contexte

GenOS comprend déjà des mécanismes d’apprentissage morphologique, de sélection
de topologie, d’expériences Trinity, de versions AgentGit, de plasmides,
de fossiles et de preuves d’intégration. Leur présence ne constitue pas encore
un cycle unifié où toute transformation persistante est reliée à une hypothèse,
à des mondes d’essai comparables et à une décision indépendante.

L’inspection initiale confirme notamment :

- `ontogenesis/proofService.js` vérifie des commandes et lie les reçus au hash
  de l’arbre ; `integrationController.js` revérifie avant le commit. Ce contrat
  couvre l’intégration de code et ne suffit pas seul pour toute plasticité.
- `morphogenesis/learning/morphologyExperienceStore.js` conserve ses données
  dans des `Map` en mémoire du processus.
- `morphogenesis/plasmidGateService.js` applique cinq gates, mais son journal
  d’état est également une `Map` process-local.
- `ontogenesis/topologySelector.js` ordonne les topologies par préférences
  déterministes et filtres d’admissibilité ; il ne consulte pas directement
  `morphogenesis/learning/policyLearner.js`.
- `agentDnaInnovation.js` vérifie l’intégrité, la confiance et une supériorité
  structurelle (aucune perte des outils/compétences parentaux et présence
  d’une nouveauté). Cette condition ne mesure pas un gain expérimental
  longitudinal.
- Trinity possède un contrat opérationnel documenté et compare trois mondes
  isolés selon des preuves, avec des axes explicitement partiels ou différés.

Les composants doivent être raccordés par petits incréments. Écrire un nouveau
registre avant d’inventorier les sources de vérité créerait un doublon et des
risques de divergence.

## Décision

1. Adopter le plan `docs/06-qualite-preuves/plan-implementation-gvx.md` comme
   séquence de référence en neuf lots : inventaire, registre durable, état et
   viabilité, transformations candidates, nurserie et barrière de preuve,
   adaptation somatique, transmission, méta-développement, évaluation.
2. Construire un registre développemental append-only et versionné qui référence
   les sources de données existantes ; ne pas faire de Git l’autorité
   transactionnelle unique.
3. Distinguer proposition, exécution d’essai, preuve, décision, application
   somatique et transmission héréditaire. Une preuve valable pour du code n’est
   pas implicitement un oracle de qualité pour une stratégie ou une morphologie.
4. Garder l’autorité, les budgets durs, la sandbox, les évaluateurs cachés et la
   décision de promotion hors du périmètre modifiable par les candidats GVX.
5. Ne pas activer de sélection adaptative ou de promotion autonome avant que la
   persistance, l’isolation, le reçu et le retour arrière correspondant soient
   démontrés.
6. Traiter les valeurs inconnues comme inconnues ; absence d’oracle ou
   d’échantillon suffisant conduit à `inconclusive` ou `escalate`, jamais à une
   réussite imputée.
7. Livrer chaque lot dans un commit séparé, avec tests ciblés et preuves
   exécutées consignés. Les claims de supériorité générale attendent les
   comparaisons longitudinales et ablations.

## Alternatives considérées

- Remplacer d’emblée Ontogenèse et Morphogenèse par un runtime GVX neuf : rejeté,
  car le dépôt possède déjà les mécanismes clés et leurs invariants de sécurité.
- Autoriser un score unique à piloter les changements : rejeté, car il confond
  les objectifs et permet à une métrique d’en compenser une autre.
- Promouvoir AgentDNA dès qu’un candidat est structurellement différent : rejeté,
  car cela ne démontre ni bénéfice ni transfert inter-contextes.
- Faire de Trinity l’unique protocole de toutes les expériences : rejeté, car
  certains claims requièrent des protocoles appariés, formels, humains ou
  longitudinaux qui ne se ramènent pas à trois chambres.

## Conséquences

### Positives

- Les capacités existantes sont conservées et raccordées à des contrats communs.
- Les états process-local identifiés ne seront pas utilisés comme autorité pour
  des promotions durables.
- Les transformations, résultats négatifs, inconnues et décisions deviennent
  auditables et rejouables.
- L’amélioration reste une affirmation mesurée plutôt qu’une conséquence
  déclarée par le système évalué.

### Coûts et limites

- La durabilité ajoute des migrations, transactions, politiques de rétention et
  cas de reprise après crash.
- Les essais contrôlés coûtent du temps et des ressources et ne fournissent pas
  nécessairement un oracle exact.
- Les améliorations mesurées seront spécifiques aux tâches, profils et modèles
  effectivement évalués.
- Le workflow GenOS MCP prescrit dans `AGENTS.md` n’était pas disponible pendant
  cette session ; aucune mémoire GenOS, décision MCP ou expérience MCP n’est
  revendiquée comme exécutée.

## Validation attendue

Les sorties et critères de chaque lot sont détaillés dans le plan GVX. Au minimum,
les migrations devront être vérifiées sur base neuve et sur base existante ; les
reçus devront survivre à un redémarrage ; l’isolation, les états invalides, les
rejeux et les pannes intermédiaires devront être couverts ; les lots qui changent
du code devront passer les tests ciblés et les gates du dépôt avant livraison.

## Références

- `docs/06-qualite-preuves/plan-implementation-gvx.md`
- ADR 0040, morphogenèse versionnée et contrefactuelle
- ADR 0108, cycle de vie plasmidique
- ADR 0126, plan expérimental Trinity
- ADR 0201, outcomes de morphogenèse vérifiés
- ADR 0235, ontogenèse et persistance du contrôleur résident
- ADR 0238, exécution et intégration de l’ontogenèse
- `backend/src/services/ontogenesis/proofService.js`
- `backend/src/services/morphogenesis/learning/morphologyExperienceStore.js`
- `backend/src/services/morphogenesis/plasmidGateService.js`
- `backend/src/services/ontogenesis/topologySelector.js`
- `backend/src/services/agentDnaInnovation.js`
