# Évaluer la mission après les preuves de code natives

- Statut : accepté.
- Date : 2026-11-05.

## Contexte

Le worker local de code construit son rapport à partir des fichiers effectivement
changés et des tests exécutés. En mission A-Team, le schéma exige aussi les
évaluations des critères et des handoffs. Le rapport natif ne les produisait pas,
et ses références hôte étaient confrontées à une énumération ne contenant que
les références du prompt. Le contrôle positif Bug Vicieux échouait donc après
les tests, sans pouvoir qualifier la mission.

## Décision

Les références admises sont dérivées de la proposition exécutée, jamais de la
forme lexicale des références déclarées dans le rapport. La validation du schéma
et celle de l'artefact reçoivent la même provenance hôte. Un préfixe ressemblant
à une preuve native ne suffit pas à rendre une référence admissible.

Quand un contrat exige des évaluations, un appel supplémentaire du même worker
évalue les critères et handoffs après les tests. Il reçoit les fichiers courants,
leurs empreintes vérifiées, les résultats hôte et les identités exactes des
handoffs. Sa réponse ne peut remplacer ni les fichiers, ni les claims, ni les
reçus. Ses tokens sont débités du budget restant et conservés dans le registre
de routage. Le code est revérifié avant d'admettre les évaluations. Le handoff
transporte les contenus ainsi vérifiés avec leur empreinte, et pas seulement
une référence opaque : le consommateur peut examiner le code réellement testé.
L'identité de l'artefact comporte le producteur et le run ; l'empreinte du contenu
reste une référence de preuve distincte. Deux capsules produisant les mêmes
octets ne deviennent pas deux propriétaires du même objet d'exécution.
Le consommateur recalcule l'empreinte des octets reçus, vérifie l'identité du
producteur et compare ces octets aux fichiers testés. Ce témoin d'intégrité est
conservé séparément de l'acceptation sémantique ; un contenu ou producteur altéré
est refusé avant l'appel d'évaluation.

Le lanceur conserve séparément `missionObjective`, l'objectif canonique reçu du
parent. L'évaluation utilise cet objectif avec les critères et handoffs complets,
au lieu de recopier les consignes de format et rappels ajoutés au prompt du worker.
Le prompt enrichi, l'autorité et le contrat de mission restent inchangés.

Lorsqu'un champ `scope` contient plus de 512 caractères, `scopeRef` contient
l'empreinte canonique du texte scellé sous `genos://code-scope/`. Le contrat
conserve le texte complet. Cela évite de recopier le prompt entier comme
identifiant dans chaque handoff ; les références de portée courtes sont préservées.

Un test visible passant ne certifie pas automatiquement le critère de mission.
Le modèle doit conserver `passed: null` pour un critère non établi et refuser un
handoff non vérifié. Les gates collectives existantes continuent à contrôler
les résultats, leurs références et les identités de handoff. La revue qualité
native, lorsqu'elle est requise, conserve l'autorité sur ses propres critères.

## Conséquences

Le worker paie un appel supplémentaire lorsqu'un contrat le demande. L'évaluation
sémantique du modèle reste limitée ; elle ne remplace pas un oracle indépendant.
Le benchmark caché mesure précisément la suffisance de ces preuves. Les contrôles
doivent conserver le refus des références inventées, des champs absents, des
sources modifiées et des critères non démontrés.
