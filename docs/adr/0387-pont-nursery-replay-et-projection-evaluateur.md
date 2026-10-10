# ADR 0387 — Pont nursery/replay et projection de l’évaluateur

- Date : 2026-10-10
- Statut : accepté pour l’intégration bornée décrite ci-dessous
- Complète : ADR 0376, 0377, 0381 et 0382
- Domaine : expériences GVX, replay, provenance et évaluation
- Décideurs : équipe GenOS, dans le périmètre P1 autorisé

## Contexte

Le replay apparié possède des forks exécutables et des observations d’aléas,
mais la nursery GVX pouvait utiliser des adaptateurs sans ce lien concret.
Une reprise retournait aussi une ancienne issue sans revérifier ses preuves.
Le runner de benchmark recevait les octets complets du dataset ; une séparation
déclarée entre entraînement et réserve ne séparait pas les réponses évaluateur
des entrées candidat.

Les références scientifiques récentes disposent d’une autorité durable qui
recompile une source Lean. Cette capacité doit être confrontée à un exécutable
réel et à un reçu mensonger, au-delà des simulations de tests unitaires.

## Décision

`gvxPairedReplayBridge.run` relie une expérience `paired-replay/v2` à deux bras
de nursery. Le scope, le snapshot, la seed déclarée, la source du runner et
l’environnement doivent correspondre. Les forks procéduraux existants sont
réutilisés ; un résultat achevé et ses observations actuelles constituent
l’artefact du bras. Une reprise relit les octets et le journal du fork.

La nursery revalide également les preuves de ses issues en cache. Une nouvelle
preuve recevable avec un autre hash ne remplace pas la preuve historique.
La décision métier, le vérificateur, sa version et l’identité de l’artefact
restent liés ; la reprise conserve l’issue historique au lieu de lui attribuer
un nouvel instant de vérification.

Les manifestes GVX peuvent déclarer une politique de dataset
`genos.gvx.split-dataset/v1` pour les deux splits. Le runner vérifie le hash du
dataset complet, puis transmet une projection canonique limitée aux identités
et entrées des tâches. Le reçu de métrique doit aussi lier le hash de cette
projection. Une signature correcte sans ce lien est refusée. L’enveloppe
évaluateur demeure disponible au contrôle d’évaluation, hors argument du runner.
Les anciens datasets restent compatibles avec l’état `legacy_unattested`.

La commande `npm run qualify:p1-lean` exige un exécutable Lean explicite. Elle
compile une proposition vraie, publie une référence aux abonnés concernés,
refuse un reçu mensonger pour une proposition fausse et relit la référence
dans un processus frais avant de tester une corruption durable.
Elle initialise aussi la factory mathématique V3 et exécute son producteur
avec Lean réel : les preuves directes générées par `simp` peuvent être publiées,
une proposition fausse compilée ne peut pas l’être. Cela qualifie un parcours
borné du producteur, pas une nouvelle stratégie autonome de recherche.

L’inventaire des capsules inclut désormais `spec/`, après un échec de
reproduction indépendant dû au schéma GVX absent. Une capsule déjà figée
reste inchangée ; le complément éventuel est séparé et hashé.

## Limites et alternatives

Le pont expose une isolation logique, un oracle sémantique non évalué et
`causalGuarantee`, `runtimeAuthority`, `promotionAllowed` à `false`. L’intégrité
d’un artefact ne valide pas l’effet causal du résultat. Les coûts inconnus
restent `null`. Le pont ne contrôle ni la RAM d’un processus, ni le contexte
caché d’un fournisseur, ni les effets externes irréversibles.

La projection du dataset ne confine pas le processus candidat : elle empêche
la transmission directe des réponses dans cet argument, mais ne démontre
pas l’inaccessibilité de tout fichier évaluateur sur l’hôte. Une campagne
représentative et son calcul de puissance restent nécessaires.

La qualification Lean lie ici l’exécutable ; elle ne constitue pas un audit
transitif des imports ou axiomes ni une validation d’une traduction naturelle.
Le bootstrap d’un organisme mathématique autonome n’est pas ajouté au serveur.

Déclarer ces adaptateurs causalement autoritaires, rendre la politique
optionnelle obligatoire pour les manifestes historiques ou assimiler une
signature à un oracle scientifique aurait dépassé les preuves disponibles.

## Validation

`npm run test:p1-v3` couvre les forks réels, la reprise, les scopes et contrôles,
les artefacts altérés, les observations forgées, la projection évaluateur et
le lien de dataset dans un reçu signé de fixture. Ce dernier teste le contrat
de transport et de décision ; il ne mesure pas un gain IA.

La qualification indépendante exécute les sources de capsule dans un sidecar,
conserve l’échec d’emballage initial et ajoute des sondes adverses distinctes.
Les journaux, tentatives échouées, hashes et résultats de campagne restent hors
Git. Le bilan daté P1 détaille les passages réels et les obligations ouvertes.
