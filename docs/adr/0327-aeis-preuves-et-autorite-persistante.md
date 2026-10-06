# ADR 0327 — AEIS : preuves exécutables et autorité persistante

- Date : 2026-10-06
- Statut : Accepté
- Périmètre : contrôle épistémique, promotion, mémoire et autorité runtime

## Contexte

Plusieurs chemins AEIS ne garantissaient pas la propriété annoncée : une
affinité nulle masquait une contre-preuve mémorisée, la ré-arbitration pouvait
perdre les identités exécutées, et la révocation utilisait une colonne
inexistante sans vérifier l'effet de sa mise à jour. Le runner omettait des
tests de persistance et l'accord provider avec de vrais processus.

## Décision

1. Rappeler les échecs confirmés avec une force distincte de l'affinité de
   succès. Conserver la nouvelle exposition à capacité pleine.
2. Conserver les descripteurs d'indépendance des lots précédents. Le feedback
   utilise des exécutions munies de reçus signés valides. Le quorum obligatoire
   reste opposable au Host et au régulateur.
3. Valider l'identité de chaque réponse provider et exiger l'accord explicite
   de tous les providers distincts retenus. Borner entrées, processus, temps,
   heap Node et sorties ; transmettre les clés du provider concerné. Chaque
   worker utilise une base SQLite éphémère et ferme son processus après avoir
   vidé sa réponse JSON. Le heap limité ne constitue pas une limite RSS.
4. Conserver l'assemblée signée des refus pour résoudre les contre-preuves.
   Un timeout est inconclusif et ne produit pas une réfutation confirmée.
5. Persister la dissonance et les événements dans deux tables AEIS. Une preuve
   négative compte une fois par run et prédicat canonique. Les seuils
   5/15/30/50 déclenchent avertissement, réduction d'autorité, quarantaine et
   apoptose. Mise à jour et déduplication sont transactionnelles. La révocation
   s'applique aux descendants ; l'autopsie survit au redémarrage.
6. Qualifier les chemins acceptés et refusés de `approveRun()` sur SQLite,
   avec des commandes réelles et deux processus provider locaux contrôlés.

## Alternatives rejetées

- Compter un statut déclaratif ou un transport réussi comme preuve.
- Déduire une contre-preuve d'un timeout, d'un avis provider ou d'une répétition.
- Utiliser une révocation en mémoire ou un update non confirmé.
- Modifier la signature d'un reçu après ré-arbitration.
- Présenter les fixtures locales comme une mesure de modèles externes ou
  du corpus LoCoMo complet.

## Conséquences

La migration 114 ajoute les tables sans attribuer une dissonance historique
par supposition. La révocation intervient dans les contrôles d'autorisation ;
elle ne constitue pas une terminaison forcée d'un processus externe.

La mémoire reste bornée à 1 000 entrées par portée. La rétention favorise
les observations récentes pour permettre leur résolution. Les événements
signés restent auditables selon la rétention des assemblées. Une nouvelle
exécution signée constitue une nouvelle observation de mémoire ; le rejeu
du même identifiant de preuve est dédupliqué. La pénalité d’autorité reste
unique par run et prédicat. Les rapports sont limités à 32 claims traitées
séquentiellement, avec un budget de 2 à 8 vérificateurs par claim.

Le contrat exécuté reste une proposition exacte de commande. La calibration
de modèles externes et le score LoCoMo demandent les accès, le corpus et les
prédictions correspondants.

## Vérification

`npm --prefix backend run test:aeis` couvre la persistance de mémoire et
d'autorité, les timeouts, le lignage, les niches, les processus provider et
les approvals acceptés/refusés. La matrice figure dans
`docs/01-concepts/adaptive-epistemic-immune-system.md`.

Décision persistée dans GenOS :
`decision-5419781a-5164-4053-9120-fbd41b51b7d7`.
