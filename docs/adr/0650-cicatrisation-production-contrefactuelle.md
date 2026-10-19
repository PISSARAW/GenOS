# ADR 0650 — Cicatrisation de production contrefactuelle et vérifiée

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : SHEV, production, contrefactuel, preuve, rollout, mémoire
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0145, ADR 0283, ADR 0483, ADR 0613

## Contexte

SHEV sait observer un projet, ouvrir une initiative, mesurer un effet et suivre une
régression. Le moteur de releases sait conduire un canari ou un test A/B. Ces deux
boucles ne liaient toutefois pas une anomalie de production à plusieurs réponses
contrefactuelles, à leurs mesures indépendamment vérifiées puis au rollout exact de
la réponse retenue.

Une intégration qui considérerait la disparition d'une alerte comme une preuve
causale violerait la règle centrale de GenOS : un transport ou une exécution réussie
ne prouve pas la validité d'une décision.

## Décision

### Nociception

Le capteur SHEV `production-telemetry` agrège uniquement des événements
`PRODUCTION_REQUEST_SUMMARY` du projet et de la fenêtre déléguée. Il compare le
taux d'erreur et la latence moyenne aux seuils SLO enregistrés. Une fenêtre trop
petite devient `blind_spot/unknown`, jamais `state`.

Chaque fenêtre agrégée est immuable et liée à l'observation SHEV par un digest de
son contenu, de sa politique et de ses références de télémétrie.

### Inflammation et coagulation

Une observation `degradation/observed` ouvre au plus une campagne par tenant et
observation. La pression SLO détermine une sévérité et un nombre borné
d'investigateurs. Le plan inscrit quatre candidats :

1. `no_change`, contrôle sans intervention ;
2. `rollback`, coagulation rapide et réversible ;
3. `minimal_fix`, cicatrisation locale ;
4. `structural_fix`, correction large et non supposée réversible.

Chaque candidat possède une hypothèse, une prédiction, une condition de
falsification, un blast radius et les preuves exigées. Le plan n'autorise aucune
exécution de production.

### Vérification indépendante

Les résultats d'exécution sont append-only et liés au hash du plan. Deux reçus
épistémiques signés et provenant d'acteurs distincts sont nécessaires. Un acteur ne
peut être ni le producteur de la campagne ni l'exécuteur du candidat. Un reçu
réfuté, altéré ou non lié au résultat exclut le candidat.

Une intervention doit respecter le SLO et améliorer le contrôle vérifié. La sortie
`ready_for_canary` reste `promotionEligible: false` et
`authorizesPromotion: false`.

### Cicatrisation et cicatrice

Le rollout existant doit porter un `candidateRef` égal au candidat sélectionné et
rester dans le même tenant. Seul un canari terminal peut fermer la campagne :

- `promoted` crée une cicatrice **provisoire** ;
- `rolled_back` crée une mémoire négative.

La cicatrice conserve les hashes du résultat et des vérifications. Même après une
promotion, elle déclare `causalClaim: false` et
`longitudinalMonitoringRequired: true`.

## Invariants

- L'absence de télémétrie augmente l'incertitude ; elle ne prouve jamais la santé.
- Les observations, résultats, vérifications et cicatrices restent tenant-scopés.
- Aucun candidat ne se vérifie lui-même.
- Le rollback planifié n'est pas un adaptateur de déploiement.
- La campagne ne contourne ni le gate de rollout ni l'autorité de promotion.
- Une cicatrice provisoire ne peut pas être présentée comme apprentissage causal.

## Conséquences

### Positives

- La chaîne télémétrie → anomalie → alternatives → quorum → canari est testable.
- Le contrôle `no_change` empêche de confondre amélioration spontanée et effet du
  candidat.
- Le rollout est lié à l'identité de la correction évaluée.
- Les échecs produisent une mémoire négative durable.

### Négatives

- Les exécutions isolées des candidats restent fournies par un runtime externe à
  cette tranche.
- Aucun connecteur Vercel, Sentry ou Datadog n'est fourni.
- Le suivi longitudinal est exigé par le reçu mais n'est pas encore le gate qui
  transforme la cicatrice provisoire en mémoire causale consolidée.
- Le capteur attend des résumés de requêtes déjà produits ; il ne collecte pas les
  requêtes brutes.

## Alternatives écartées

### Déclencher un rollback dès le franchissement d'un seuil

Écarté : un seuil isolé ne prouve ni la cause ni l'efficacité du rollback et ne
porte pas l'autorité nécessaire à une mutation de production.

### Choisir le correctif avec la meilleure mesure auto-déclarée

Écarté : cela autoriserait l'exécuteur à fabriquer son propre oracle.

### Construire un second moteur de rollout

Écarté : les releases GenOS possèdent déjà les métriques, décisions et transitions
terminales nécessaires. La campagne ajoute une liaison de preuve, pas un transport
concurrent.
