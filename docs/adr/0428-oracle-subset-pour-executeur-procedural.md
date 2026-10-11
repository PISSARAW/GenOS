# ADR 0428 — Oracle subset_sum pour l'exécuteur procédural

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : workers, preuve indépendante, promotion native
- **Décideurs** : équipe GenOS
- **Lié à** : [qualification des workers](../06-qualite-preuves/qualification-workers.md)

## Contexte

L'oracle natif `subset_sum` acceptait le contrat enveloppé
`bounded_worker → scoped_procedure`, mais refusait le contrat direct
`procedural_executor → subset_sum` avec `ORACLE_DOMAIN_UNAVAILABLE`.
Le worker procédural produisait pourtant une observation liée au run et un
reçu contenant le résultat. La campagne comparative contrôlait `subset_sum`
et LPT en relançant le module de l'exécuteur, ce qui ne donnait pas une
vérification logicielle distincte.

## Décision

Le sujet de l'oracle accepte exactement deux formes de contrat version 1 :
`scoped_procedure` contenant `subset_sum`, ou `subset_sum` direct. Pour la
forme directe, il lit le résultat du reçu observé ; lorsque le contenu porte
aussi un résultat, les deux copies doivent être identiques. Le reçu doit
déclarer la bonne méthode et posséder des identifiants SHA-256 correctement
formés. L'observation, le contrat, le run et l'agent restent liés par le
journal biologique et par la réservation de l'oracle.

Le résultat est recalculé dans deux processus natifs distincts, par bitset
et énumération bornée, avant toute promotion. Le benchmark utilise un module
d'oracle séparé pour `subset_sum` et LPT ; il vérifie aussi les reçus de
l'adaptateur. Les méthodes hors de ces domaines restent refusées.

Le journal biologique canonise les objets JSON. Le reçu du solveur est haché
avant cette canonisation ; son identifiant ne peut donc pas être recalculé à
partir du seul objet relu. L'oracle n'infère aucune justesse de cet identifiant :
sa décision repose sur le résultat recalculé depuis le contrat persistant.

## Conséquences

- **Positive** : une mission procédurale `subset_sum` peut être terminée avec
  un artefact courant et deux reçus de vérification indépendants.
- **Positive** : les cas comparatifs LPT et `subset_sum` ne relancent plus le
  module GenOS comme pseudo-oracle.
- **Limite** : l'intégrité interne du hachage du reçu du solveur ne peut pas
  être prouvée après canonisation à partir du seul journal biologique.
- **Limite** : `formal_worker` reste bloqué par `ORACLE_DOMAIN_UNAVAILABLE` ;
  un résultat `check_arithmetic` ne devient pas une preuve Lean par analogie.

## Alternatives

- Ignorer l'oracle pour terminer la mission : rejeté, car cela confondrait
  l'exécution du transport et la validité de la décision.
- Accepter le reçu du solveur comme oracle : rejeté, car producteur et
  vérificateur seraient la même autorité.
- Étendre immédiatement à tous les types de workers : rejeté sans contrats
  de résultat et vérificateurs indépendants propres à chaque domaine.
