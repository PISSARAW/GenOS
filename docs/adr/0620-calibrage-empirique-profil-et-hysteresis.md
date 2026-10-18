# ADR 0620 — Calibrer le profil morphologique et l'hystérésis sur des preuves vérifiées

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : morphogenèse, apprentissage causal, calibration, hystérésis
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0573, ADR 0610, ADR 0616

## Contexte

Le profileur produit dix-neuf dimensions, mais l'apprentissage historique ne
consommait que cinq champs plats. Le champ textuel `domain` était même converti
en nombre, donc généralement réduit à zéro. Un résultat vérifié pouvait modifier
le prior de topologie sans prouver que le profil utilisé par le proposant était
celui observé par le vérificateur.

La boucle causale persistante transportait déjà `learningContext` dans le reçu
signé, mais ne réinjectait pas son profil et sa morphologie initiale lorsque le
contexte d'expression était absent. Enfin, le budget d'hystérésis était durable,
alors que le seuil de gain et le cooldown restaient constants.

## Décision

1. Un profil empirique éligible contient les dix-neuf valeurs bornées, une
   confiance positive et au moins une référence de preuve par dimension.
2. Son empreinte canonique est incluse dans `learningContext`. Le reçu indépendant
   couvre déjà ce contexte ; l'apprentissage recalcule l'empreinte du profil et
   refuse toute divergence, absence de reçu ou auto-attestation.
3. Les observations 19D sont comparées par distance moyenne normalisée. Elles
   sont séparées des anciens contextes plats et n'influencent le classement
   qu'après dix observations vérifiées comparables. Le résultat expose son type
   de preuve et son état `warming_up`, `calibrated` ou `unavailable`.
4. La boucle causale réutilise le profil et la morphologie initiale du reçu signé
   lorsque le contexte d'expression n'en apporte pas. Le journal durable peut
   ainsi alimenter le proposant sans nouvelle voie non vérifiée.
5. Le corpus apparié existant reste la source de calibration des interventions.
   Ses coûts de validation et incertitudes déterminent un seuil de gain, un
   cooldown et un plafond de budget. Sans candidat calibré, aucune politique
   empirique n'est émise et Rust conserve ses défauts conservateurs.
6. Rust valide cette politique, borne le budget restant par son plafond et
   applique ses paramètres avant l'adjudication. La politique accompagne l'état
   transactionnel ; elle n'accorde aucune autorité de commit supplémentaire.

## Conséquences

### Positives

- les dix-neuf dimensions deviennent des variables effectives du proposant ;
- un profil altéré après vérification ne peut pas contaminer les priors ;
- une poignée d'observations ne modifie pas prématurément le classement ;
- les résultats vérifiés du journal causal reviennent dans la proposition ;
- l'hystérésis varie avec des coûts appariés mesurés plutôt qu'avec une constante.

### Négatives

- un profil incomplet ou sans référence de preuve est inutilisable pour la
  calibration, même s'il reste exploitable par les heuristiques documentaires ;
- les observations historiques à cinq champs ne qualifient pas le profil 19D ;
- le seuil de dix observations est une garde minimale, pas une preuve de
  généralisation ;
- la politique dépend de la disponibilité d'un corpus apparié et d'un holdout
  indépendants.

## Alternatives rejetées

- **Convertir silencieusement les profils partiels** : cela donnerait un sens
  empirique à des zéros imputés sans preuve.
- **Faire confiance à l'empreinte déclarée** : elle doit être recalculée sur le
  profil exact et couverte par le reçu indépendant.
- **Mélanger observations plates et 19D** : leurs espaces de caractéristiques
  n'ont pas la même sémantique.
- **Appliquer la calibration dès le premier résultat** : ce serait trop sensible
  au bruit et aux expériences isolées.
- **Supprimer les défauts Rust** : l'absence de preuve doit conserver une option
  sûre et déterministe.

## Vérifications associées

- `node backend/tests/test_morphogenesis_profile_calibration.js` ;
- `node backend/tests/test_morphogenesis_hysteresis_calibration.js` ;
- `node backend/tests/test_topology_empirical_learning.js` ;
- `node backend/tests/test_morphogenesis_causal_learning_outbox.js` ;
- `cargo test -p genos-cli morphogenesis_hysteresis`.
