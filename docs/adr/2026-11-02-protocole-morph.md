# ADR — Protocole MORPH v1 et conservation des engagements

- **Statut** : Accepté pour le profil expérimental local
- **Date** : 2026-11-02
- **Domaine** : Morphogenèse, engagements, autorité et reprise
- **Références** : [Contrat MORPH](../03-reference/protocole-morph.md),
  [Conservation](../03-reference/morph-conservation.md),
  [P0 existant](0610-protocole-p0-commit-morphogenetique.md)

## Contexte

Le protocole P0 existant journalise la préparation et les effets des transitions
morphogénétiques. Le bundle de transfert existant porte des artefacts, preuves,
affirmations et incertitudes. Ces mécanismes locaux ne suffisent pas à définir
un contrat portable entre des nœuds avec des bases et des magasins indépendants.

Une transition ne peut ni faire disparaître une obligation, ni accorder des
droits par changement de rôle, ni transformer des contextes historiquement
partagés en confirmations indépendantes.

## Décision

Introduire `genos.morph/v1`, avec une enveloppe commune, un plan complet et deux
snapshots explicites. Séparer la validation de forme du contrôle sémantique des
invariants. Réutiliser la canonicalisation EVIDENCE, sans transformer une
empreinte en authentification ou en autorisation.

Le premier profil conserve exactement tâches ouvertes, obligations et exigences,
budgets, affirmations, preuves, provenance, dépendances, audiences publiées,
questions, incertitudes et effets inconnus. Un propriétaire ne change que par
transfert explicite. Les permissions peuvent être réduites ou supprimées, mais
pas élargies ; leurs conditions demeurent immuables.

Les participants sont les nœuds d'exécution qui doivent acquitter la transition.
Ils sont distincts des membres logiques de l'organisation. Le registre et les
callbacks de confiance doivent établir leur couverture réelle ; le contenu
d'un plan ne suffit pas à le prouver.

Le changement de version est borné à `sourceVersion + 1`. Une application
distribuée doit distinguer décision durable, application locale et finalisation,
et conserver une issue explicite de récupération lorsque des effets sont
incertains.

## Conséquences

- La transformation transporte ses engagements et conditions de validité.
- L'audience d'un message ancien n'est pas recalculée sur le nouveau roster.
- Le passage Syncytium vers Trinity conserve l'histoire des contextes partagés.
- Une nouvelle preuve, une annulation d'obligation ou une augmentation de budget
  demande une opération distincte avec sa propre autorité.
- Le profil expérimental n'active pas les mutations P0 de production et ne
  remplace pas les canaris, autorités ou gates existants.
- Une implémentation réseau indépendante doit encore établir authentification,
  registre des nœuds, transports et distribution des politiques.

## Alternatives

- Comparer seulement les effectifs et les topologies : rejeté, car les engagements
  et leur qualification pourraient disparaître.
- Transférer uniquement des empreintes : rejeté, car un récepteur doit inspecter
  les snapshots complets et les confronter à son état autoritatif.
- Déduire l'indépendance du nouveau rôle Trinity : rejeté, car l'histoire des
  contributions ne change pas avec leur organisation.
- Confondre participants d'exécution et membres logiques : rejeté, car un nœud
  peut héberger plusieurs membres et une organisation peut changer d'effectif.
