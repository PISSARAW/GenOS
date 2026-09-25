# ADR 0108 : Branchement fail-closed des topologies

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Orchestration, morphogenèse, transitions, preuves
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0045, ADR 0076, ADR 0094, ADR 0101

## Contexte

Le registre morphogénétique, le résolveur et le contrat de capacités
connaissent huit topologies canoniques. Le point de composition commun
dispatchait six d'entre elles et échouait pour Trinity et A-Team. Plusieurs
facteurs négatifs du classement représentaient pourtant des bénéfices, ce
qui inversait leur effet sur le score. Enfin, le registre d'adaptateurs
existait sans être consulté par le service de transition.

## Décision

Le dispatch commun adresse explicitement les huit composeurs canoniques.
Le classement utilise les coûts normalisés comme pénalités directes; une
meilleure préservation d'état réduit la perte de préservation. Les valeurs
numériques présentes, y compris zéro, restent distinctes des valeurs absentes.

Toute transition entre deux topologies passe par le registre des adaptateurs.
L'adaptateur connu Trinity vers A-Team ne transfère que les affirmations
vérifiées dans ses lots de travail. Il porte un reçu d'adaptateur. Une
transition sans adaptateur enregistré est refusée avant le snapshot et
l'application du patch. Une composition initiale et une transition qui
conserve la même topologie n'exigent pas de conversion.

La présence d'un plan ou d'un composeur ne prouve pas que son runtime a été
exécuté. Les contrats, gates de promotion, reçus et preuves de chaque runtime
restent requis.

## Conséquences

### Positives

- Les huit identifiants ont un dispatch commun et un test d'inventaire.
- Le classement récompense correctement les coûts faibles et les états
  préservés.
- Les changements morphologiques ne traversent plus silencieusement une
  frontière de topologie sans conversion vérifiée.
- Les tests distinguent planification, composition et migration.

### Négatives

- Trinity vers A-Team est la seule conversion inter-topologies actuellement
  enregistrée; les autres migrations restent bloquées jusqu'à l'ajout et la
  vérification de leurs adaptateurs.
- Biocénose, Syncytium, Métapopulation et certains autres composeurs
  nécessitent leurs dépendances d'exécution, notamment une base de données.
- Les scores demeurent des estimations heuristiques; les tests de monotonie
  ne constituent pas une preuve de sélection optimale.

## Alternatives

- **Laisser les composeurs séparés** : écarté, car le point d'entrée commun
  ne pourrait pas composer uniformément les huit topologies.
- **Autoriser les transitions sans conversion** : écarté, car les contrats
  d'état et de preuve peuvent différer entre les topologies.
- **Déclarer toutes les conversions compatibles** : écarté faute d'adaptateurs
  exécutables et de preuves de fidélité correspondantes.
