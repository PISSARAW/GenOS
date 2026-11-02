# ADR — Protocole ALLOSTASIE v1

- **Statut** : Accepté pour le profil expérimental local
- **Date** : 2026-11-02
- **Domaine** : Mesures allostatiques, prévisions, quotas et consommation
- **Références** : [Contrat](../03-reference/protocole-allostasie.md),
  [Qualification](../03-reference/allostasie-qualification.md),
  [Allostasie multiniveau AGOW](0748-agow-viabilite-collective-multiniveau.md)

## Contexte

AGOW possède des états allostatiques séparés par niveau et un évaluateur de
prévisions de viabilité. Le dépôt possède aussi des réservations SQLite de
budget modèle et un ledger de consommation métabolique. Ces composants ne
définissent pas une conversation portable entre demandeurs et régulateur.

Un besoin déclaré ou une pression ne constitue pas une autorité d'allocation.
Une annulation ne peut pas recréditer une opération déjà consommée, et une
issue inconnue exige de conserver sa couverture jusqu'à réconciliation.

## Décision

Introduire `genos.allostasis/v1`, avec les messages `REPORT_STATE`,
`FORECAST_NEED`, `REQUEST_BUDGET`, `GRANT`, `REPORT_USAGE`, `RELEASE`,
`PRESSURE`, `PREEMPT` et `REJECT`. Séparer observation, demande, allocation
autorisée et constat de consommation.

Les quantités de ressources sont des entiers non négatifs bornés dans une
unité exacte : tokens, octets, millisecondes, appels modèle ou micro-unités
monétaires explicitement identifiées. Aucune conversion de monnaie ou de
dimension n'est implicite. Les ratios allostatiques peuvent être représentés
en millionièmes, avec valeur native et quantification conservées ; ils ne
deviennent pas des ressources allouables.

Qualifier les rapports depuis les vrais états AGOW persistés, avec source,
scope et sujets fixés localement. Conserver les quatre niveaux sans les
fondre dans une moyenne. Un timestamp ou une valeur manquante reste
indisponible, avec `null`, et non une mesure inventée à zéro.

Les prévisions utilisent le vrai validateur de candidats et l'évaluateur
allostatique natifs. La quantité demandée demeure une déclaration distincte
de cette prédiction de viabilité ; aucune utility n'est convertie en coût.

Le registre d'observations journalise le rapport, la prévision et la pression
avec autorisation, causalité et provenance. Sa lecture courante requalifie
la source ; elle n'accorde aucune ressource. L'algorithme d'allocation et son
évaluation restent séparés du contrat de communication.

## Conséquences

- Le scope logique et le namespace source ne sont pas choisis à partir du
  message distant.
- Une confiance prédictive ou un état `measured` natif ne constitue pas une
  preuve de calibration ou une autorisation de dépenser.
- Le registre d'observations ne modifie aucun pool et ne déclenche aucune
  transition morphogénétique.
- Le bridge natif de réservations modèle concerne tokens et USD ; les autres
  quotas nécessitent un adaptateur propre et ne prétendent pas imposer une
  limite de mémoire ou de CPU au système d'exploitation.
- Les réserves de terminaison et de récupération ne sont pas créées ou
  libérées implicitement par un signal de pression.
- Les contrôles locaux ne constituent pas un protocole de transaction
  distribuée entre deux fournisseurs de données arbitraires.

## Alternatives

- Transporter des euros ou coûts de quotas comme flottants sans unité : rejeté.
- Assimiler une valeur absente à zéro ou un timestamp absent à maintenant : rejeté.
- Convertir le regret AGOW en montant budgétaire observé : rejeté.
- Accepter une prévision ou une pression comme un grant : rejeté.
- Recréditer une opération payée lors d'une annulation : rejeté ; la consommation
  observée demeure comptabilisée.
