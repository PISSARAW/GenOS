# ADR 0691 — Registre vérifiable du modèle monde

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : prédiction, mémoire, provenance, trajectoires, autorité
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0019, ADR 0021b, ADR 0031, ADR 0645

## Contexte

Un modèle monde adaptatif peut produire des scénarios utiles sans démontrer que ses
prévisions étaient antérieures à l'action, ni que le retour reçu provenait du monde
réel. Une simulation qui se valide elle-même transforme alors une anticipation en
fausse preuve. Une confiance unique masque aussi les écarts propres au modèle, au
contexte et à la métrique. Enfin, une erreur de prédiction perd sa valeur causale si
elle n'est pas reliée au projet, à la trajectoire, à l'action, au responsable et aux
hypothèses qui l'ont produite.

## Décision

GenOS introduit un registre persistant `world_model_ledger_v1` fondé sur quatre
frontières explicites.

1. Une prédiction est préenregistrée lorsque l'action est encore `PLANNED`. Elle
   reçoit un identifiant, une version monotone par clé logique et un engagement
   SHA-256 couvrant la distribution, le seuil de falsification, les hypothèses et
   les liens de responsabilité. Une version ultérieure n'écrase jamais l'ancienne.
2. Une observation ne ferme la prédiction que si une enveloppe Ed25519 valide lie
   l'identité du capteur au contenu exact. Le contrat exige
   `sourceKind = real_environment` et `synthetic = false`. Une simulation, même
   signée, reste refusée comme effet réel.
3. Le résidu alimente une mémoire épisodique de provenance et une mémoire sémantique
   calibrée par triplet modèle, contexte et métrique. Une hypothèse dépassant son
   seuil préenregistré est `CHALLENGED`; elle ne devient `INVALIDATED` qu'avec au
   moins deux références indépendantes déclarées dans l'observation signée.
4. Le foresight est sélectif. La permission `world-model:foresight`, un budget
   suffisant, une confiance calibrée, un gain d'information et un impact de décision
   minimal sont obligatoires. Sinon la décision canonique est `NO_CHANGE`. Même
   exécuté, un foresight porte `evidenceClass = counterfactual` et
   `mayCountAsRealEffect = false`.

Les services sont placés sous `backend/src/services/predictiveTimescale/`. Cette
tranche fournit le registre et les politiques; elle ne crée pas encore de route HTTP
ou MCP publique.

## Conséquences

### Positives

- la prévision est distinguée d'une explication reconstruite après coup;
- une observation synthétique ne peut pas contaminer la preuve d'effet réel;
- la calibration et les révisions d'hypothèses conservent leur provenance;
- les coûts de raisonnement prospectif sont bornés et l'abstention est explicite;
- chaque épisode reste attribuable à une trajectoire et à un responsable.

### Négatives

- les capteurs réels doivent gérer une clé Ed25519 et conserver leur identité;
- le stockage adaptatif grossit avec les versions et les épisodes;
- deux références indépendantes sont un seuil opérationnel, pas une démonstration
  universelle de causalité;
- la politique ne remplace ni la promotion épistémique ni l'autorisation d'exécuter
  l'action envisagée.

## Alternatives

- **Réécrire la prédiction courante** : rejeté, car l'antériorité devient invérifiable.
- **Accepter un booléen `verified` du client** : rejeté, car ce drapeau est
  auto-déclaré et ne protège pas l'intégrité du contenu.
- **Apprendre de simulations comme d'observations réelles** : rejeté; elles restent
  utiles comme contrefactuels, sans effet mesuré.
- **Exécuter tous les foresights disponibles** : rejeté pour coût non borné et risque
  de précision artificielle.

## Vérification

- `node backend/tests/test_world_model_ledger.js`
- `node backend/tests/test_world_model_learning.js`
- `node backend/tests/test_selective_foresight_policy.js`
- `python scripts/ci/check_code_quality.py`

Ces tests vérifient les contrats locaux. Ils ne constituent ni un benchmark de
généralisation du modèle monde ni une preuve d'effet projet en production.
