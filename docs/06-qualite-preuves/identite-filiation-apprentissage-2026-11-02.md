# Identité, filiation et apprentissage sur 600 cycles

- **Statut** : campagne mécanique exécutée avec succès ; preuve bornée.
- **Date** : 2026-11-02, de 16:35:29 à 16:37:09, Europe/Paris.
- **Portée** : services backend réels, exécuteurs arithmétiques déterministes, aucun LLM.
- **Promotion** : aucune autorité ni demande de promotion.

## Protocole et provenance

Le [benchmark](../../benchmarks/identity-continuity/README.md) et son
[protocole](../../benchmarks/identity-continuity/protocol.json) sont reproductibles :

```powershell
node benchmarks/identity-continuity/test.cjs
node benchmarks/identity-continuity/run.cjs
```

Révision de départ : `4455188633c5138d21a2ac3a373ca37d419d6acb`.
Le checkout comportait des modifications concurrentes : le manifeste en conserve
la liste et les empreintes des sources pertinentes. Aucun fichier de production
n’a été modifié pour obtenir ces résultats. Le runner vérifie à la fin que HEAD
et les sources mesurées n’ont pas changé pendant cette campagne.

SHA-256 du protocole :
`e93f26337c8005bb5d137fd81ea672db3e388bcac55441ec9888bf17df633177`.

SHA-256 du manifeste :
`551b836cb628cff53edbb319da83822c254845578b1a39470749babb3fe1edf6`.

Les preuves locales sont sous
`benchmarks/identity-continuity/results/2026-11-02T15-35-29-092Z/` :
`manifest.json`, `summary.json`, puis requêtes, journaux, traces et base SQLite
de chaque graine. Ces artefacts générés sont ignorés par Git. La campagne finale
utilise le protocole figé après les tests du harness ; il ne s’agit pas d’un
préenregistrement indépendant. Le pilote précédent, interrompu pour rendre les
plages d’opérandes train/test disjointes, reste conservé dans le dossier
`2026-11-02T15-34-32-916Z/` avec son statut d’interruption.

## Résultats observés

Les trois graines fixes sont 17, 43 et 97. Les résultats sont descriptifs ; ces
graines ne représentent pas trois agents LLM indépendants.

| Mesure | Par graine | Total |
| --- | ---: | ---: |
| Transformations réelles du registre | 600 | 1 800 |
| Épisodes d’exécution et calibration | 600 | 1 800 |
| Reconnaissances signées et filiation contrôlée | 120 | 360 |
| Forks directs / descendants supplémentaires | 12 / 12 | 36 / 36 |
| Rejets attendus de contrôles adverses | 54 | 162 |
| Épisodes hérités sans appropriation d’expérience | 18 | 54 |
| Processus distincts pour entraînement et évaluation | 9 | 27 |
| Marqueurs de restauration d’une ancre d’identité | 6 | 18 |
| Nouveaux problèmes d’évaluation, sans apprentissage | 600 | 1 800 |
| Contrôles d’un domaine inconnu | 60 | 180 |

À chaque transformation, l’identifiant reste celui du sujet, la révision avance
d’une unité et le hash de tête change. Le récit initial de naissance reste
inchangé. À chaque fin de tranche, toutes les chaînes des 27 individus sont
vérifiées. Le sujet conserve une origine `GENESIS` et atteint une révision
vérifiée de 1 974 dans chacune des trois évaluations finales.

Les 360 rencontres comprennent 180 reconnaissances de forks directs, 168 de
descendants indirects et 12 d’un individu sans parent. Les identifiants reconnus
restent distincts du sujet malgré des attributs initiaux identiques. La chaîne
la plus longue atteint treize générations depuis le sujet. Les origines
`FORK_ORIGIN` et leurs références causales correspondent aux parents restitués
par le service d’histoire familiale. Ce contrôle vérifie l’authentification et
la restitution du graphe ; il n’évalue pas une inférence généalogique par un LLM.

Les contrôles adverses rejettent une signature modifiée, une présentation de soi
comme pair, un rejeu, une présentation périmée, une incarnation remplacée,
un changement d’identifiant, une modification du journal et les transferts
hors périmètre. Les descendants gardent zéro observation personnelle après
héritage : leurs épisodes nomment toujours le sujet comme auteur de l’expérience.

## Réutilisation mesurée

Le sujet apprend sa fiabilité sur quatre domaines arithmétiques à partir des
résultats réellement exécutés. La calibration persiste dans
`identity.decisions.selfModel`. Après redémarrage, `identity.modelBoundary`
injecte l’incertitude correspondante dans le contrôleur du benchmark. Celui-ci
choisit entre un exécuteur limité à 32 bits et un exécuteur décimal indépendant
de l’oracle `BigInt`. Le seuil de choix était fixé à 0,65.

Les trois fenêtres de 200 nouveaux problèmes de chaque graine donnent les
mêmes métriques. Aucun résultat d’évaluation n’est ajouté à la calibration ;
le nombre de décisions et le modèle personnel sont contrôlés avant et après.

| Bras, pour 200 problèmes | Réussite | Audits | Coût synthétique | Brier sur l’exécuteur rapide |
| --- | ---: | ---: | ---: | ---: |
| Calibration conservée et utilisée | 100 % | 100 | 300 | 0,00004328 |
| Mémoire désactivée | 50 % | 0 | 200 | 0,25 |
| Associations de domaines permutées | 50 % | 100 | 300 | 0,98688539 |
| Audit systématique | 100 % | 200 | 400 | 0,25 |

Le gain de réussite est de 50 points contre la mémoire désactivée et contre la
mémoire permutée. À coût d’évaluation identique, la permutation dégrade la
réussite : la bonne association domaine/expérience est nécessaire au résultat.
Le bras appris utilise 25 % d’unités de moins que l’audit systématique pendant
l’évaluation, avec la même réussite. Les 600 unités d’entraînement par graine
ne sont pas incluses dans cette comparaison ; aucun amortissement global,
gain en euros, en tokens ou en temps n’est démontré.

## Vérifications et limites

Le test du harness passe, y compris après réouverture SQLite, avec rejet d’un
score de réussite falsifié et d’un Brier dégradé. Les six fichiers source du
benchmark passent le contrôle qualité strict sans dette. `cargo test --workspace`
termine avec le code zéro.

Lors de la campagne, la validation globale du checkout restait incomplète : `npm test` a été refusé
par le verrou de suite détenu par un autre processus actif, PID 21508. Le dernier
contrôle qualité global a aussi signalé `COMPLEXITY 12>10` dans le fichier
concurrent `benchmarks/competence-100/agent.cjs`, extérieur à ce changement.
Ces résultats ne sont pas comptés comme des validations réussies. Lors de la
préparation du commit, le contrôle qualité global a été relancé avec succès :
8 182 fichiers source, zéro violation. La complexité du benchmark concurrent a
été réduite par extraction de validations dans des fonctions distinctes.
Le test du harness a également été relancé avec succès. Le processus 21508
exécute toujours une autre suite complète ; son verrou actif n’a pas été supprimé.

La conclusion établie est une continuité **causale du registre**, une
reconnaissance **authentifiée** de nouveaux individus à origine attestée et une
calibration **durable, consommée et utile** sur de nouveaux exemples des mêmes
domaines. Les transformations portent sur nom, rôle, modèle déclaré et révision
cognitive. Les marqueurs de restauration ne constituent pas une restauration
complète des fichiers, d’une mémoire d’organisme ou d’effets externes.

Le contrôleur et les tâches restent écrits dans le harness ; deux domaines sont
toujours fiables et deux toujours défaillants pour l’exécuteur rapide. La
calibration apprise est donc simple et les graines varient les opérandes sans
changer la structure de difficulté. Le domaine inconnu reste sans calibration,
ce qui borne explicitement la portée du transfert.

Cette campagne ne prouve ni stabilité psychologique d’un agent LLM, ni conscience,
ni apprentissage autonome général, ni copie complète d’organismes, ni tenue face
à des mutations arbitraires du génome, ni stabilité sur plusieurs jours. Ces
affirmations exigent une autre campagne avec workers réels, tâches diversifiées,
oracles indépendants et invariants définis avant les observations.
