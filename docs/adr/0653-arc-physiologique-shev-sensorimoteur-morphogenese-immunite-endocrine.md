# ADR 0653 — Arc physiologique unifié sous gouvernance épistémique

- Statut : Accepté
- Date : 2026-10-19

## Contexte

Les organes Self-Twin, AGOW, SHEV, nosologie/morphogenèse, campagnes immunitaires,
GVX et endocrinologie existaient sans boucle opérationnelle complète entre eux.
Une douleur de projet (dégradation, lésion, erreur de prédiction ou lacune de
capacité) pouvait donc être observée sans produire une adaptation traçable de
l'organisation ni un signal de développement longitudinal.

## Décision

Fermer l'arc par quatre ponts étroits, en réutilisant les contrats des organes :

1. **Action/perception ↔ Self-Twin.** Une interaction sensorimotrice n'est exécutée
   que par un adaptateur borné après vérification de l'autorisation par l'autorité
   hôte; un booléen fourni par l'appelant ne constitue pas une preuve. La prédiction et
   l'observation sont liées dans le ledger Self-Twin; une divergence mesurée peut
   soumettre un candidat AGOW non actionnable et notifier SHEV. L'adaptateur de
   capture mesure les métriques d'écran enregistrées; il ne prétend pas faire
   d'OCR ou d'interprétation sémantique.
2. **SHEV ↔ nosologie ↔ morphogenèse.** Les preuves d'un épisode SHEV sont compilées
   par `morphogenesisNosologyBridge`. La famille nosologique détermine contrôles,
   échelle, candidats contrefactuels et obligations post-transition. La résolution
   terminale peut mettre à jour le profil par un adaptateur fourni et prouvé.
3. **Immunité ↔ nursery.** Les candidats du plan de remédiation ne sont appliqués
   que dans une capsule Copy-on-Write attestée, réseau désactivé. Des oracles locaux
   et un quorum de vérificateurs distincts produisent les reçus canoniques. Seule
   une recommandation qualifiée peut être présentée au gate canari existant.
4. **Stewardship ↔ endocrinologie développementale.** Les observations longitudinales
   et récidives déterminent une pression allostatique bornée, qui pondère les jobs
   par dimension souffrante via un adaptateur endocrinien explicite. Une clairance
   n'est déclenchée qu'après confirmation de progrès sur fenêtres held-out
   indépendamment vérifiées par `recordAgentProgress`.

Les adaptateurs d'exécution, d'observation, de vérification et d'endocrinologie
restent des dépendances explicites. En leur absence, les ponts échouent fermés ou
retournent un état différé; ils ne simulent pas une preuve.

## Invariants et conséquences

- Toute exécution exige `requiresExplicitAuthorization: true` et une attestation
  d'autorisation retournée par un adaptateur d'autorité hôte; le pont n'accorde
  jamais lui-même cette autorisation.
- Les candidats, reçus, plans et recommandations conservent
  `promotionEligible: false`. Le quorum n'est pas un verdict de promotion : seuls
  les oracles et le gate de promotion déjà en place peuvent faire évoluer ce statut.
- Aucun payload d'exploit réel n'est exécuté; seuls des fixtures de reproduction
  sûrs et les opérations allowlistées du planner sont admis.
- La pression endocrine et les priorités de curriculum sont bornées et traçables;
  elles n'écrivent pas directement dans le génome ou les autorisations de l'agent.
- Les captures visuelles restent des mesures techniques (dimensions et taille
  encodée) jusqu'à l'intégration d'un oracle perceptif qualifié.

## Alternatives écartées

- Lancer les actions ou correctifs depuis la douleur sans autorisation : confond
  signal sensoriel, diagnostic et pouvoir d'agir.
- Remplacer la nosologie par un mapping statique : ne permet pas d'ajuster les
  obligations ni les candidats au profil clinique observé.
- Considérer le meilleur résultat de nursery comme une promotion : ignore la
  séparation entre exécution isolée, vérification indépendante et déploiement.
- Décroître la pression sur une réussite locale : confond transfert expérimental
  et progrès longitudinal tenu sur holdout.

## Preuves exécutables

- `cargo test -p genos-sensorimotor`
- `cargo test -p genos-orchestrator`
- `node backend/tests/test_sensorimotor_self_twin_bridge.js`
- `node backend/tests/test_shev_morphogenesis_healing.js`
- `node backend/tests/test_immune_effector.js`
- `node backend/tests/test_developmental_endocrine_bridge.js`
- `node backend/tests/test_production_healing_campaign.js`
- `python scripts/ci/check_code_quality.py`
