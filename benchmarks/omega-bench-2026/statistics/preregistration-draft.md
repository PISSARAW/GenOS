# Plan confirmatoire proposé — version de travail

**Statut : brouillon; aucune donnée du holdout n'a été lue pour ajuster les adaptateurs.**
Ce fichier décrit les choix à figer après achèvement des adaptateurs, de
l'instrumentation et de l'estimation de puissance. Il ne fait pas passer la
campagne à l'état préenregistré.

## Estimands et contrastes

- Unité statistique indépendante : le scénario. Les trois répétitions sont des
  mesures répétées d'un même scénario et ne comptent jamais comme trois
  observations indépendantes.
- Comparaison primaire : D contre A, pour l'unique métrique primaire indiquée
  par expérience dans `protocol.json`. E03 et E08 exigent chacune leurs deux
  critères de validité; E10 et E12 gardent les violations critiques comme
  conditions bloquantes, en plus de leur métrique principale.
- Contrastes d'attribution : B contre A, C contre B et D contre C. Les résultats
  D contre A ne suffisent pas à attribuer un gain à G-CIR Ω ou aux capacités
  intégrées à GenOS.
- Baselines externes : exécuter uniquement les expériences listées comme
  applicables dans `configs/baselines.json`. Après qualification publique,
  figer pour chaque expérience le comparateur fonctionnellement applicable le
  plus fort selon la métrique primaire; aucune sélection ne sera faite sur le
  holdout.
- Ablations : D complet contre A1–A8; A8 (mêmes capacités GenOS avec JSON typé)
  est le contraste obligatoire pour l'attribution au langage.

## Règles statistiques proposées

- Seuil bilatéral `alpha = 0,05`; intervalles de confiance à 95 %.
- Une famille Holm distincte pour les 12 contrastes D/A, une pour l'ensemble des
  contrastes externes applicables, et une pour les huit ablations. Les
  contrastes d'attribution B/A, C/B et D/C forment une quatrième famille.
- Issues binaires appariées : test exact de McNemar; résumer chaque scénario par
  « succès aux trois répétitions » pour les critères de sûreté et de conformité.
- Mesures continues : médiane des répétitions par scénario; différence appariée
  et intervalle bootstrap par scénario, avec une graine publiée avant la levée
  du holdout. Ne pas traiter les répétitions comme des cas indépendants.
- Déclarer « supérieur sur le périmètre testé » uniquement si au moins six des
  douze contrastes primaires D/A sont favorables après Holm, satisfont le seuil
  pratique préenregistré et passent tous les critères de sécurité applicables.
  Présenter séparément les comparaisons externes et les ablations; aucun gain
  moyen ne compense une violation critique.

## Frontières de mesure proposées

- Latence : mesurer en régime établi, de l'entrée JSON déjà chargée et encodée
  jusqu'à la réponse sémantique décodée. Inclure les transports locaux MCP,
  OPA et Temporal, les reprises et les erreurs; exclure démarrage du serveur,
  compilation des bundles, installation, génération et scoring des données.
- Octets : taille UTF-8 des entrées et réponses sérialisées au même point de
  frontière; distinguer charge utile logique et octets de transport lorsque le
  protocole les expose.
- Coût API : `N/A` tant qu'aucun appel externe payant n'est effectué; ne pas
  convertir une latence locale en euros.
- E11 : le coût « par euro » reste non défini tant qu'une mesure d'énergie ou de
  ressources facturables et un tarif fixe, horodaté et documenté ne sont pas
  arrêtés. Cette exigence bloque encore le préenregistrement de E11.

## Puissance et limites

`python src/power_analysis.py` calcule l'effet continu standardisé minimal pour
80 % et 90 % de puissance à la première étape conservatrice de Holm pour 12
contrastes primaires. Avec 50 scénarios E11, l'effet minimal détectable est
`d=0,524` à 80 % et `d=0,586` à 90 %. Sous l'hypothèse illustrative de 20 % de
paires discordantes, une différence binaire absolue de 10 points exige 271
scénarios à 80 % et 338 à 90 %. Ces hypothèses doivent être remplacées par les
variances et discordances mesurées sur les données publiques de développement.
Le calcul doit être étendu aux familles externes et aux ablations après gel des
adaptateurs et des contrastes applicables. Les critères zéro violation seront
accompagnés de bornes exactes; ils ne prouvent pas l'absence universelle de
défauts.

## Conditions avant gel

1. Qualifier les sept familles de baselines et les huit ablations prévues.
2. Terminer la mesure E11 en unité monétaire ou retirer explicitement cette
   conclusion de portée avant toute lecture du holdout.
3. Estimer les variances et discordances sur le jeu public, recalculer la
   puissance pour toutes les familles et augmenter les échantillons si requis.
4. Figer le matériel, les versions, le hash du corpus et ce plan dans un commit
   antérieur au scoring du holdout.
