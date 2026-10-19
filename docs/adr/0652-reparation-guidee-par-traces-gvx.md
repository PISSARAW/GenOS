# ADR 0652 — Réparation GVX guidée par traces et maturation d’affinité

- Statut : Accepté
- Date : 2026-10-19

## Contexte

GVX savait comparer un parent et un candidat dans des mondes isolés, tandis qu’AEIS
savait faire mûrir une stratégie de vérification après confrontation à un oracle. Il
manquait un contrat reliant une trace d’échec à une cause falsifiable, un locus
réellement modifiable puis une mutation bornée. Sans ce raccord, « apprendre d’une
trace » pouvait désigner une optimisation décorative sans causalité ni limite de
mutation.

## Décision

Introduire un chemin explicite en trois contrats :

1. Une hypothèse cite des événements fautifs existants et un locus catalogué. Un
   vérificateur du control plane atteste séparément la liaison
   `traceId/hypothesisId/locusId`; son acteur et son workspace diffèrent de ceux du
   producteur de la trace.
2. Le diagnostic choisit une mutation AEIS, mais seules les recettes du locus sont
   applicables. Chaque candidat modifie un champ unique, avec valeur allowlistée,
   taille bornée et nombre de candidats plafonné.
3. Chaque candidat passe dans la nursery GVX en bras `baseline/candidate`, sur deux
   branches non productives distinctes. Le holdout est disjoint de l’entraînement,
   scellé par hash et transmis seulement à l’évaluateur. Les métriques sont relues
   par le registre de vérificateurs et liées à l’attestation d’isolation. Une garde
   déterministe vérifie l’objectif et les régressions.

Les attributions rejetées, plans, échecs d’évaluation et décisions sont inscrits
dans le ledger GVX. Un résultat favorable reste
`candidate_eligible_for_external_review`; il ne promeut et n’applique rien.

## Conséquences

Le système peut désormais produire une expérience réfutable à partir d’une trace
sans autoriser un agent à éditer un composant arbitraire. L’hôte reste responsable
de l’isolation effective des branches et de la qualification des vérificateurs.
Une identité distincte ne prouve pas une indépendance épistémique réelle; la preuve
reste limitée à la procédure, aux artefacts et aux mesures observées.

Le protocole ne recherche pas automatiquement toutes les causes possibles. Les
hypothèses et loci doivent être fournis et versionnés par l’hôte. Les résultats
synthétiques ne démontrent pas une amélioration sur des agents ou modèles réels.

## Alternatives écartées

- Muter directement un prompt ou un routeur depuis une trace : causalité supposée,
  blast radius non borné et rollback ambigu.
- Réutiliser le holdout pour choisir la mutation : fuite de données et sélection
  optimiste.
- Considérer le meilleur score comme une promotion : confusion entre mesure locale,
  décision de déploiement et apprentissage germinal.

## Preuves exécutables

- `node backend/tests/test_gvx_trace_locus_attribution.js`
- `node backend/tests/test_gvx_affinity_mutation_planner.js`
- `node backend/tests/test_gvx_trace_guided_repair.js`
