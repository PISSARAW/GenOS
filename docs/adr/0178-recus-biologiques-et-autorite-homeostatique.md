# ADR 0178 — Reçus biologiques versionnés et autorité homéostatique

- **Statut** : Proposé
- **Date** : 2026-09-30
- **Domaine** : Exécution biologique, homéostasie, preuves, persistance
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0176, ADR 0177

## Contexte

Les primitives cellulaires, génomiques et métaboliques sont exécutées dans le
runtime Rust. Le backend évalue aussi des contrats d'homéostasie de mission et
conserve des états d'évaluation. Ces voies n'émettent pas encore un reçu
versionné commun reliant une mission à une cellule, un génome, une dépense
métabolique et un résultat. Le contrat et ses seuils ne sont pas conservés
comme une autorité durable et versionnée ; une transition ne possède pas de
reçu autonome reliant sa décision aux preuves évaluées.

Les budgets du backend, les coûts du runtime et l'ATP de l'orchestrateur Rust
sont des unités et registres différents. Les additionner ou les convertir sans
adaptateur explicite produirait une preuve trompeuse.

## Décision

1. Définir un reçu biologique versionné et append-only. Il porte les
   identifiants de mission, cellule et génome lorsqu'ils sont disponibles,
   l'empreinte du génome, le registre et l'unité du coût, le résultat,
   l'horodatage et les références de preuves. Une donnée absente reste
   explicitement absente ; aucun identifiant ou débit ne sera inventé.
2. Persister les contrats homéostatiques par révision immuable et empreinte.
   Une modification déclarée produit une nouvelle révision. L'évaluation
   charge la révision autoritaire et utilise une politique de seuils
   centralisée, bornée et versionnée.
3. Persister un reçu pour chaque décision de transition, autorisée ou refusée,
   contenant la mission, la révision du contrat et des seuils, l'état,
   l'issue et les références aux preuves évaluées.
4. Émettre les reçus aux points où les faits sont observés : débit/application
   du tick Rust et évaluation/décision homéostatique backend. Relier ces voies
   par un identifiant de corrélation, sans fusionner leurs registres de coût.
5. Traiter les contrats historiques sans version par une migration de
   compatibilité explicite. Les contrats non sérialisables ou les seuils
   invalides échouent de façon fermée.

## Conséquences

### Positives

- Les décisions et dépenses observées sont auditables et rejouables à partir
  d'une version de schéma, d'un contrat et d'une politique connus.
- Une transition refusée est aussi traçable qu'une transition autorisée.
- Les données manquantes et les limites entre registres restent visibles.

### Négatives

- La persistance append-only augmente le volume de données et requiert une
  politique de rétention ultérieure.
- Le pont Rust/backend ne peut fournir une corrélation que lorsque l'appelant
  fournit une identité de mission stable ; le reçu local Rust reste utile sans
  cette corrélation.
- Les reçus attestent ce que les composants ont observé, pas la vérité d'un
  résultat au-delà des preuves référencées.

## Alternatives

- **Réutiliser seulement `homeostasis_states`** : rejeté, car cette table
  conserve des évaluations sans rendre le contrat versionné autoritaire et
  sans distinguer un reçu de transition.
- **Agréger tous les coûts en une valeur unique** : rejeté, car les unités et
  registres backend et Rust n'ont pas de conversion contractuelle commune.
- **Construire les reçus uniquement dans le backend** : rejeté, car le backend
  ne voit pas nécessairement l'identité cellule/génome ni le débit ATP réel
  observé dans le tick Rust.
