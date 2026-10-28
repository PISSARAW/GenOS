# Résultats

Les résultats publics ont été relancés sur le corpus v0.7.0 et son manifeste
`830dd926a8bb4ecf6749f62bd26165a6efacd263004d95df8499b563bbad4134`.
A–D totalisent 40 800 exécutions avec concordance complète aux oracles. Les
sept familles de baseline et les ablations A1–A8 ont aussi été exécutées et
évaluées sur leurs périmètres déclarés. Le soak E09 étendu a couvert 100 cycles
de 10 000 invocations (1 000 000 au total), avec 100 % de réponses exactes et
aucun signal de croissance selon la règle descriptive préétablie. Le delta RSS
entre fenêtres est de +1 957 888 octets et le delta heap de −15 561 816 octets.
C'est une observation d'un seul processus, pas une preuve de borne mémoire
générale.

Les JSONL, évaluations, manifestes et journaux restent générés sous ce dossier
ignoré par Git. L'analyse appariée de 74 contrastes est post hoc, publique et
non confirmatoire. Le holdout local de 680 cas a été régénéré et vérifié hors
dépôt; il n'a pas été lu ni scoré. Le préflight reste à 26/28. Six points
doivent être résolus avant approbation : E11 énergie/tarif (ou amendement),
plan d'inférence, preuve E09 ou revendication mémoire réduite, frontières
d'instrumentation, gel des adaptateurs/configurations/dépendances/commandes,
et publication des traces et résultats auditables. Aucun résultat €/mission,
gain de 15 % ou résultat confirmatoire n'est revendiqué.
