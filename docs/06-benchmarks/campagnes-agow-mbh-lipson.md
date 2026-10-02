# Campagnes empiriques AGOW, MBH-RNN et Lipson-like

- **Dernière mise à jour** : 2026-10-02
- **Statut** : campagnes locales AGOW exécutées; pipeline Lipson-like exploratoire exécuté; entraînement et dix essais d’évaluation MBH-RNN terminés.
- **Portée** : comptes rendus locaux distincts. Ces expériences n’établissent ni comparaison directe entre elles, ni validation générale, ni résultat reproductible du papier.

## Résumé

| Campagne | Données / unités | Résultat disponible | Interprétation |
|---|---|---|---|
| AGOW ablation holdout | Jeux synthétiques locaux à graines nouvelles, 12 cas par bras | Workspace complet/ablé : 11/12 contre 11/12; 136,167 contre 621,417 jetons moyens. Diffusion complète/ablée : 11/12 contre 0/12; 136,167 contre 92,833 jetons moyens. | Résultats descriptifs locaux; les graines diffèrent du corpus du 1 octobre. |
| AGOW médiation | 12 cas par condition | Diffusion transmise/supprimée : 12/12 contre 0/12; 135,417 contre 92,917 jetons moyens. | Intervention synthétique contrôlée, sans corpus métier indépendant. |
| AGOW réplication | Trois paires de 8 cas | Succès traitement/contrôle : 8/8 contre 0/8 dans chacune; jetons moyens 137,625/93,250, 138,125/93,250 et 135,750/92,875. | Réplications locales avec graines distinctes; pas de réplication indépendante par un tiers. |
| Lipson-like | PyBullet, un terrain, une trajectoire d’évaluation | Un entraînement de 25 époques puis une trajectoire de 56 pas; récompense cumulée affichée par le code : 7,7369. | Smoke test exploratoire du pipeline, très en deçà de la campagne de l’article. |
| MBH-RNN | Une cible officielle d’entraînement et dix trajectoires simulées | Entraînement de 100 000 itérations; états intéroceptifs finaux : −0,377752, −1, −1, −0,247414, −1, −0,767027, 0,301478, 0,507814, −1 et −1. Moyenne −0,558290; écart-type population 0,549921. | Évaluation officielle terminée, mais pas un holdout : les dix essais sont simulés et partagent la même unique séquence d’apprentissage. L’état intéroceptif n’est pas une mesure autonome de précision prédictive. |

Les rapports AGOW sont des statistiques descriptives de protocoles synthétiques locaux. Aucun seuil de promotion n’est franchi et aucun résultat ne justifie une affirmation causale générale. Le run Lipson-like n’est pas une reproduction de l’article. L’évaluation MBH ne peut pas mesurer la généralisation à un holdout absent du dépôt.

## AGOW : ablation, médiation et réplication holdout

Le runner local `benchmarks/agow/run-local-campaign.cjs` a été exécuté avec `qwen2.5-coder:7b` servi par Ollama et une variante temporaire du protocole `protocol-local-2026-10.json`. Des graines neuves ont été fixées avant l’exécution : `agow-ablation-holdout-2026-10-b`, `agow-mediation-holdout-2026-10-b` et `agow-replication-holdout-2026-10-d/e/f`. Les empreintes des cinq corpus produits diffèrent de celles de la campagne du 1 octobre.

- Identifiant de campagne : `c4562463-cfe0-49a8-bf8c-dcb1b3f74f1e`.
- Révision GenOS enregistrée : `ed899d71f257d0b25c6d543b63a155e47eaac09e`.
- Cinq reçus ont été produits; le protocole marque les données comme synthétiques et locales.
- Le rapport et les résultats JSON sont `benchmarks/agow/results/campaign-2026-10-02T04-04-39-685Z.md` et `.json`; ces artefacts ignorés par Git ne sont pas inclus dans ce commit.
- SHA-256 des cinq corpus, dans l’ordre du reçu de campagne : `354c12a6cdfa2622cf5afc902198cc33814c5f64e32b953946ac3e03a1c94196`, `7625b5b5f8e95c75caa2179e83a75277e4def340fb47d4626fdab0e2cf7541c8`, `bee74edbb82c2a4ea8c8aed237a95957f9ef13f0da9bdd0a7008a1e0a91b692b`, `1ef9636211571a6136b2cab11151dc0ddb4e3cdb8ad5efecbb3ba8f82c84e7f3`, `4c20f09316d5ded29e18d747ba50a52bb1383d73db544d7f62629b1486fc5df0`.

Les différences de jetons ne sont pas un indicateur de qualité isolé. Les contrôles ablés ne reçoivent pas le même contenu de diffusion que les traitements; les taux de succès et coûts doivent donc se lire dans le cadre de ces interventions précises. Ces jeux ne sont pas des données utilisateur ou métier qualifiées.

## Lipson-like : collecte simulée, entraînement et smoke test

Le protocole a été reconstruit à partir du [code officiel Egocentric_VSM](https://github.com/H-Y-H-Y-H/Egocentric_VSM), révision `eab54b8c14f426f07b7f43e7efae3cc32ae0f6fe`, et de l’[article publié](https://www.nature.com/articles/s44182-025-00031-6). Le dépôt ne fournit ni le jeu de données brut de l’article ni ses poids préentraînés. Une collecte PyBullet réduite a donc été réalisée localement : cinq épisodes simulés de 1 000 pas, quatre utilisés pour l’entraînement et un pour la validation (30 000 images au total).

L’environnement temporaire utilise CPython 3.11.16, PyTorch 2.1.0+cu121 et une NVIDIA RTX A4500. Un modèle a été entraîné de zéro pendant 25 époques. Les pertes finales consignées sont 0,03698 en entraînement et 0,03975 en validation. Le test sans interface graphique a exécuté une seule trajectoire de 56 pas sur le terrain `rug`; le code officiel a affiché une récompense cumulée de 7,7369. Une trajectoire unique ne permet pas d’estimer la variance ni la performance moyenne.

Pour rendre la chaîne exécutable dans l’environnement courant, le clone temporaire du code officiel a reçu deux corrections locales non reportées au dépôt amont : chemin d’une texture redirigé vers l’actif `CADandURDF/rug.jpg`, et conversion du tampon d’image PyBullet en tableau NumPy. L’aléa Python de la collecte n’avait pas été initialisé; les graines NumPy/Torch l’étaient. La figure et les poids avaient été écrits avant que l’appel interactif à `plt.show()` ne soit interrompu en mode sans interface. Ce run est un smoke test du pipeline modifié, pas une reproduction ou une réplication de l’article.

Les scripts, poids, journaux et données sont conservés sous `C:\Users\Shadow\AppData\Local\Temp\lipson-campaign-20261002` et le clone du code sous `C:\Temp\genos-research-20261002\Egocentric_VSM`; aucun de ces artefacts générés n’est ajouté à Git.

## MBH-RNN : baseline du code officiel

Le code [MBH-RNN officiel](https://github.com/h-idei/mbhrnn), révision `1501fca90602149585e34266b81cfa9513d5108a`, a été compilé sans modification avec GCC 13.3.0 et OpenMP sous WSL Ubuntu 24.04. L’unique entrée repérée est `learning_data/target_0000000.txt`, empreinte SHA-256 `a8056621d9e2a4a0e4782a2c66dfaac8c7b09faec7f7115e4d660a73597294d7`. C’est une séquence d’apprentissage, pas un corpus holdout.

L’entraînement officiel de 100 000 itérations s’est achevé avec code de sortie 0 en 18 438,3 secondes. Les checkpoints de 10 000 à 100 000 itérations sont présents. Le binaire officiel `exe.test` a ensuite exécuté ses dix séquences simulées avec `OMP_NUM_THREADS=8`, code de sortie 0. Les paramètres sont `TEST_SEQ_NUM=10`, `TIME_LENGTH=2000`, fenêtre passée 10, fenêtre future 200, taille d’itération 200 et taux d’apprentissage 0,1.

Les dix états intéroceptifs finaux sont −0,377752; −1; −1; −0,247414; −1; −0,767027; 0,301478; 0,507814; −1; −1. Leur moyenne est −0,558290 et leur écart-type population 0,549921. Les durées correspondantes sont 922,361; 908,011; 908,134; 915,209; 916,390; 918,103; 921,789; 968,927; 917,889 et 896,029 secondes (moyenne : 919,284 s).

L’état intéroceptif est initialisé à zéro, diminue avec le mouvement, augmente lors d’une prise de nourriture et est borné à [−1, 1]. Sa valeur finale décrit l’état d’homéostasie simulé; cette sortie n’est pas en elle-même une mesure d’exactitude, de qualité prédictive ou de généralisation. Les dix essais partagent le même réseau appris et la même cible disponible; ils ne constituent ni dix jeux indépendants, ni un holdout.

L’environnement est WSL Ubuntu 24.04, GCC 13.3.0, huit threads OpenMP, sans GPU. Le code officiel est à la révision `1501fca90602149585e34266b81cfa9513d5108a`; l’entrée `target_0000000.txt` a pour SHA-256 `a8056621d9e2a4a0e4782a2c66dfaac8c7b09faec7f7115e4d660a73597294d7`. Le journal d’évaluation a pour SHA-256 `c20d60686a6f250e823fc467c0929da6506a64a9c46c6a9bd94370399a5079e7`.

Le modèle, les checkpoints, les séquences générées, le journal, les sources et binaires sont conservés hors dépôt sous `C:\Temp\genos-research-20261002\mbhrnn-run-20261002-4`. Le manifeste de protocole/environnement `environment.json` a pour SHA-256 `dab6bcfdf83c935dca87b6fcb601b8b8d3a95214300bf583228c0870b9828c3b`; l’inventaire des empreintes des fichiers `manifest.sha256` a pour SHA-256 `c7ae4ba1e8403b05eb25d9020a03fe1c728384cfb90a816786168cb3e3228806`. Les données et sorties ne sont pas committées.

## Réserve d’orchestration GenOS

La mission de recherche lancée via l’orchestrateur GenOS n’a pas démarré : elle échoue dans `backend/src/services/agentAutonomyPlanService.js` avec `ReferenceError: affordableWorkerCount is not defined` (ligne 117 au moment de l’exécution). Les campagnes AGOW ont donc été lancées directement par leur runner. Cette erreur d’orchestration est une limitation distincte des résultats d’expérience et doit être corrigée avant d’utiliser ce chemin pour automatiser de futures campagnes.

## Répétabilité et portée

- Les trois campagnes utilisent des environnements, corpus et mesures différents; aucune comparaison numérique inter-campagne n’est valide.
- AGOW : résultats locaux descriptifs, petits effectifs synthétiques, aucune indépendance externe.
- Lipson-like : faible nombre d’épisodes et une seule trajectoire de test; actifs de l’article et poids d’origine absents; adaptations locales et collecte non totalement reproductible.
- MBH-RNN : une seule séquence d’entraînement disponible; les dix essais sont simulés et corrélés par leur source et leur modèle. Cette évaluation n’est pas une baseline holdout indépendante.
- Les protocoles et données temporaires ne sont pas archivés par le dépôt. Pour une publication ou une promotion, archiver les versions exactes, les manifestes complets, les corpus, les sorties brutes, les graines, les révisions, les empreintes et les évaluations indépendantes.
- Les rapports ne revendiquent ni réplication des articles sources, ni validation métier, ni preuve de généralisation.
