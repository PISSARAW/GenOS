# ADR 0769 — Mesurer les réfutations natives sans autoriser leur promotion

- **Statut** : Accepté pour le domaine borné `subset_sum`
- **Date** : 2026-11-02
- **Domaine** : AGOW, preuves négatives, mesures et budgets
- **Lié à** : [ADR 0767](0767-mesures-agow-depuis-oracle-natif.md)

## Contexte

Le contrat natif v1 mesure les résultats acceptés et laisse les autres inconnus.
Une comparaison limitée aux succès présenterait un biais de sélection. Un run
bloqué peut cependant correspondre à une erreur technique, une preuve manquante
ou un résultat mathématiquement faux ; son statut seul ne permet pas de conclure.

## Décision

Introduire `genos.agow.native-subset-outcome/v2`, tout en conservant le lecteur
positif et la compatibilité des anciennes liaisons v1. La perte binaire vaut 0
après acceptation revalidée, et 1 uniquement après deux réfutations indépendantes
revalidées du résultat enregistré. Les autres cas restent inconnus.

Ajouter un lecteur de réfutation propre aux mesures AGOW. Il exige un run bloqué
pour `ORACLE_ASSEMBLY_NOT_ACCEPTED`, sa liaison et son reçu biologique, les
observations canoniques appliquées, une attestation scellée `accepted: false`,
aucune acceptation ni abort, l'autorité et le sujet encore valides, ainsi qu'un
budget de deux vérifications complètement mesuré. L'assemblée doit être active.

Deux reçus signés `refuted` doivent viser le même claim et sujet. Ils utilisent
les stratégies `subset_bitset` et `subset_enumeration`, avec des processus,
répertoires et identifiants d'exécution distincts. Leur temps cumulé et leurs
identités sont recoupés avec le journal scellé des exécutions. Une signature
altérée, un quorum incomplet, une expiration, un processus en échec ou un oracle
inconclusif ne produit aucune perte numérique.

Le runtime observe l'événement après l'application du gate et avant de remonter
son refus. Les modules de preuve positive et de promotion restent inchangés :
une observation négative `verified` ne peut pas devenir une acceptation native.
Aucun crédit AGOW ou changement de politique n'est ajouté.

## Conséquences

- Les pertes de succès et d'échec peuvent être décrites sous les mêmes plafonds.
- Les inconnus restent dans le dénominateur de couverture. La moyenne des seuls
  résultats mesurés doit être accompagnée de la couverture et de bornes explicites
  incluant les pertes inconnues ; ces bornes ne sont pas des intervalles statistiques.
- Le banc injecte une faute dans le résultat du worker, avant enregistrement et
  vérification ; il ne modifie jamais les réponses des oracles ou les gates.
- L'égalité des plafonds ne signifie pas égalité des temps réellement consommés.
- Les artefacts peuvent être dirigés vers un volume disposant d'espace via les
  variables de qualification, sans diminuer les réserves disque des workspaces.

## Alternatives

- Affecter 1 à tout échec : rejeté, absence de preuve sémantique.
- Accepter une attestation négative dans `nativeOracleProof.read` : rejeté,
  frontière de promotion affaiblie.
- Retirer les inconnus du rapport : rejeté, couverture et population masquées.

## Vérification

`npm --prefix backend run test:agow:refutation` exécute deux bras appariés
(résultat correct et faute contrôlée), un échec technique sans preuve et un cas
hors du domaine d'énumération. La qualification contrôle également les signatures,
doublons de vérificateurs, identités et refus par le lecteur de preuve positive.
