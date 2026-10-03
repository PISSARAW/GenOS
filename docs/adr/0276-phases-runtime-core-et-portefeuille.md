# ADR 0276 — Séparer les phases du runtime core du portefeuille de stratégies

- **Statut** : Accepté
- **Date** : 2026-10-03
- **Domaine** : Orchestration, stratégie, leases, benchmarks
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0113, ADR 0163, ADR 0275

## Contexte

Le plan d’autonomie déduisait la réalisabilité des phases en vérifiant que chaque
outil requis apparaissait dans les primitives du portefeuille de stratégies choisi.
Cette règle bloquait des missions lorsque les outils de base (diagnostic, snapshot,
évidence, évaluation et replay) étaient pourtant déjà accordés par le bail central
de l’orchestrateur. Elle confondait les capacités du runtime avec la méthode métier
sélectionnée.

## Décision

Les phases s’appuient sur les outils du runtime core lorsqu’ils sont couverts par le
bail central de l’orchestrateur. Les phases propres à une stratégie continuent
d’exiger les primitives correspondantes dans le portefeuille. Les outils requis
restent inscrits au plan et filtrés par la politique de lease; les phases optionnelles
non couvertes restent omises ou bloquantes selon leur contrat. Un portefeuille vide
reste bloqué.

## Conséquences

### Positives

- Un choix de stratégie métier ne masque plus les outils généraux que le runtime a
  déjà autorisés.
- Le bail fail-closed reste l’autorité pour le dispatch effectif des outils.
- Les capacités spécialisées continuent d’être validées contre le portefeuille.

### Limites

- La présence d’une phase dans le plan n’atteste pas qu’elle a été exécutée; le run
  doit conserver les appels et reçus d’outils pour établir cette preuve.
- Cette correction ne rend pas une campagne appariée éligible sans runner, reçus et
  vérificateur propres à la suite.

## Alternatives

- Ajouter artificiellement des stratégies de diagnostic et d’évaluation à chaque
  portefeuille : rejeté, car cela change le choix métier au lieu de séparer les
  contrats du runtime et de la stratégie.
- Retirer les phases bloquantes manquantes : rejeté, car cela masquerait les capacités
  requises et affaiblirait la porte d’exécution.
