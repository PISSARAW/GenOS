# ADR 0263 — Nursery expérimentale GVX et vérificateurs de confiance

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, expériences, isolation, preuve indépendante
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0249, ADR 0256, ADR 0262

## Contexte

Les protocoles GVX décrivaient des bras et exigences, mais l'exécution isolée, la lecture
des artefacts et l'identité des vérificateurs dépendaient encore de l'appelant. Un candidat
ne doit pas pouvoir légitimer sa propre preuve en fournissant uniquement un hash ou un nom
de vérificateur.

## Décision

La nursery GVX reçoit un registre de vérificateurs de confiance du control plane, un
lecteur d'artefacts, un adaptateur de création de monde isolé et un exécuteur de bras. Le
service lit lui-même les octets et calcule leur SHA-256; le vérificateur enregistré examine
ces octets et le requirement, et seul son reçu vérifié entre dans l'outcome. Chaque monde
doit respecter l'identifiant d'isolation du bras. Les outcomes suivent ensuite le protocole
GVX standard et ne permettent pas la promotion.

## Conséquences

- Les hashes candidats ne suffisent plus comme preuve dans le chemin de la nursery.
- Les capacités d'isolation et la source du registre restent des responsabilités de
  l'intégrateur control plane, validées structurellement mais non attestées par ce module.
- Le service ne fournit pas encore un adaptateur AgentGit/VFS particulier; il exige le
  callback d'isolation du runtime hôte.

## Alternatives

- Accepter `artifactHash` et `verifierId` de l'outcome brut : rejeté, car ils ne prouvent
  ni l'identité du contenu lu ni l'exécution du vérificateur.
- Utiliser un registre contrôlé par le candidat : rejeté, car l'évalué choisirait sa
  propre autorité de preuve.
