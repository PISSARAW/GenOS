# Cent expériences avec Qwen réel : hypothèse non confirmée

- **Date** : 2026-11-02.
- **Statut** : campagne LLM réelle terminée et vérifiée.
- **Verdict préenregistré localement** : `not_demonstrated`.
- **Portée** : modèle figé avec mémoire GenOS et politique d'abstention sur un langage affine généré.
- **Promotion** : aucune.

## Résultat principal

Le test avec un vrai LLM a été exécuté. Après cent expériences supervisées,
l'état avec mémoire répond correctement à 13 des 120 problèmes résolubles,
contre zéro à l'état initial. Il échoue aux 60 compositions inédites et reconnaît
correctement l'information manquante dans seulement 16 des 40 questions
sous-déterminées, contre 40 avant apprentissage. Les 24 autres reçoivent une
réponse à haute confiance. La démonstration demandée n'est donc pas obtenue.

| Mesure réservée | Initial | Après 100 expériences | Mémoire réinitialisée |
| --- | ---: | ---: | ---: |
| Nouvelles entrées, réponses exactes acceptées | 0/60 | 13/60 | 0/60 |
| Compositions inédites, réponses exactes acceptées | 0/60 | 0/60 | 0/60 |
| Total résoluble, réussite | 0/120 | 13/120 (10,83 %) | 0/120 |
| Total résoluble, couverture des réponses | 0/120 | 120/120 | 0/120 |
| Ignorance correctement reconnue et nommée | 40/40 | 16/40 (40 %) | 40/40 |
| Questions sous-déterminées à confiance ≥ 0,8 | 0/40 | 24/40 (60 %) | 0/40 |
| Brier sur les 120 tâches résolubles, plus petit = meilleur | 0 | 0,891667 | 0 |
| Sorties de test valides | 160/160 | 160/160 | 160/160 |

Le Brier initial nul résulte de l'abstention totale avec confiance nulle : ce
score ne constitue pas à lui seul une compétence. Après apprentissage, l'agent
répond aux tâches résolubles avec confiance 1 et commet 107 erreurs. Le gain brut
de 13 réponses exactes ne satisfait pas les critères de transfert et d'ignorance.

## Modèle réellement exécuté et ressources

- Modèle : `qwen2.5-coder:7b`, GGUF Q4_K Medium, poids déjà installés sur `D:`.
- Poids SHA-256 : `60e05f2100071479f596b964f89f510f057ce397ea22f2833a0cfe029bfc2463`.
- Moteur : [llama.cpp b11960 officiel](https://github.com/ggml-org/llama.cpp/releases/tag/b11960), Windows Vulkan, isolé sur `D:`.
- Archive officielle SHA-256 : `bac6914b5e83523eb008c6789eaa12669f93fbc196c3b9e8237b6672323b33e9`.
- Binaire SHA-256 : `81f65c6681d66099e5d48757aa2c050ba958dc43816e584f0bb4181eb7c910d8`.
- Hôte : NVIDIA RTX A4500 ; arguments et propriétés du serveur conservés dans le manifeste.
- Température zéro, seed fixée par problème, contexte 4 096 tokens, sortie maximale 128 tokens.
- 580 appels d'étude, tous avec réponse valide : 100 entraînements et 480 évaluations.
- Durée de campagne : 746,211 secondes, soit 12 minutes 26 secondes, sous le plafond de 20 minutes.
- Tokens observés : 110 647 en entrée et 26 201 en sortie. Coût monétaire : `null`.

Les empreintes du modèle et du moteur ont été recalculées au début et à la fin.
L'adaptateur vérifie le chemin de poids effectivement chargé via `/props`.
Chaque requête utilise l'API native `/v1/chat/completions` avec cache de prompt
désactivé. Le moteur isolé a été arrêté après la campagne ; ses fichiers et logs
restent sur `D:`. Cette campagne n'a pas modifié l'installation globale Ollama.

## Protocole et critères fixés avant observation

Le [banc](../../benchmarks/competence-100/README.md) et son
[protocole](../../benchmarks/competence-100/protocol.json) sont scellés avant
la première inférence expérimentale. Le transport llama.cpp a remplacé l'Ollama
indisponible sans modifier les seuils, le prompt, le générateur ou l'oracle.

L'entraînement enseigne quatre opérateurs opaques au moyen de cent tentatives
suivies de corrections entrée/sortie. Le vrai service GenOS
`ontogenesis/memoryService` les conserve dans SQLite avec provenance. Le rappel
fournit au plus les trois premiers exemples de chaque opérateur cité.
`abstentionService` intervient dans l'acceptation des réponses. Les poids du
modèle restent fixes : la progression éventuelle passe par la mémoire externe.

Les tâches de test sont disjointes : 60 nouvelles entrées hors plage
d'entraînement, 60 compositions absentes de l'apprentissage et 40 expressions
contenant au moins un opérateur jamais enseigné. Leur famille n'est pas indiquée
au modèle. L'état initial est une copie figée sans mémoire ; chaque tâche est
présentée aux trois états dans un ordre scellé. Aucun feedback de test n'est
appris. Un nouveau processus restaure et empreinte la mémoire persistée avant
l'évaluation. La réinitialisation conserve une base vide.

| Critère prévu | Observation après apprentissage | Passage |
| --- | --- | --- |
| Intégrité, 100 expériences, affectations complètes, budgets, sources et modèle figés | Neuf contrôles vrais | Oui |
| Couverture utile ≥ 50 % | 100 % | Oui |
| Gain de chaque famille contre chaque contrôle : borne inférieure > 10 points | Entrées : −18,28 points ; compositions : −39,95 points | Non |
| Reconnaissance de l'inconnu : borne inférieure ≥ 80 % | 22,14 % | Non |
| Erreurs à haute confiance sur l'inconnu : borne supérieure ≤ 15 % | 77,86 % | Non |
| Calibration complète, Brier ≤ 0,2, dégradation ≤ 0,02 | Brier 0,891667, dégradation 0,891667 | Non |

Les bornes utilisent les six tests unilatéraux et la correction de Bonferroni
prévus : risque familial 5 %, Hoeffding apparié pour le gain et binomial exact
pour l'inconnu. Les seuils de couverture/calibration sont descriptifs. Aucune
nouvelle méthode statistique ni seuil plus favorable n'a remplacé ces critères.

## Vérifications et exemples

Le rejeu JavaScript vérifie le manifeste, la chaîne du journal, les affectations,
les exemples autorisés dans les prompts, les oracles, l'abstention, les métriques
et le verdict : code de sortie 0. Une seconde implémentation Python recalcule
les 580 issues avec un oracle itératif et des sommes binomiales directes :
code de sortie 0, mêmes scores et bornes. Elle a été écrite avant l'analyse des
scores. Ces contrôles partagent le même auteur ; ce ne sont pas des attestations
d'un laboratoire indépendant.

Exemples illustratifs extraits après la clôture, sans intervenir dans le score :

- Extrapolation réussie : trois exemples donnent `op_498d9617(x) = 3x` ;
  pour 555, réponse 1 665, confiance 1, oracle 1 665.
- Composition échouée : `op_851b6367(op_e86d76f5(346))` ;
  réponse 311, confiance 1, oracle 4 152.
- Lacune ignorée : une expression combine un opérateur enseigné et
  `op_e87c9f92`, sans définition disponible ; réponse 329, confiance 1,
  aucune lacune déclarée. L'issue attendue est une abstention nommant cet opérateur.

## Artefacts et reproduction

Racine des résultats : `D:\genos-competence-results`.
Campagne : `D:\genos-competence-results\campaigns\d37e8398-fb46-41c7-a0b8-dd8c916cc002`.
Manifeste SHA-256 conservé séparément :
`9bfc90ef006cc7d126bb1d8fb1d483e40ddad197997787ae70edae34f1ac1960`.

Le dossier conserve `manifest.json`, `events.jsonl`, `measurements.json`,
`report.json`, les bases SQLite, `sources/`, `runtime.log`,
`python-crosscheck.json` et `illustrative-cases.json`. La racine conserve aussi
`independent_analysis.py`, les logs de validation et de campagne.

```powershell
node benchmarks/competence-100/verify.cjs D:\genos-competence-results\campaigns\d37e8398-fb46-41c7-a0b8-dd8c916cc002 9bfc90ef006cc7d126bb1d8fb1d483e40ddad197997787ae70edae34f1ac1960
python benchmarks/competence-100/diagnostics/python_crosscheck.py D:\genos-competence-results\campaigns\d37e8398-fb46-41c7-a0b8-dd8c916cc002
```

Le vérificateur JavaScript exige les mêmes sources que le manifeste ; les copies
historiques sont conservées pour une reprise après évolution du dépôt. Une
nouvelle exécution du modèle crée une autre campagne avec d'autres seeds ; le
rejeu ci-dessus vérifie les observations archivées sans réinterroger le modèle.

Les dix tests initiaux et les quatre tests de diagnostic passent. Le rejeu Python
versionné passe sur les 580 observations ; le script initial antérieur à l'analyse
des scores reste conservé sur `D:`. `cargo test --workspace` a passé lors de la
campagne. Le contrôle qualité global passait avant la campagne ; pendant le
diagnostic, il constate trois violations concurrentes hors du banc :
`nervous/regulationPolicy.js`, `tests/helpers/omegaProcessClient.cjs` et
`tests/helpers/omegaProcessRuntime.cjs`. Aucun fichier du banc n'est rejeté.
Le dernier précontrôle de `npm test` refuse le checkout sur `C:` : 482 Mio libres,
pour 512 Mio requis. Les refus précédents incluaient un verrou externe. Les logs
sont conservés ; aucune réussite de la suite Node globale n'est revendiquée.

## Portée et suite scientifique

Le résultat concerne ce modèle, ce prompt, cette mémoire, ce monde généré et ce
budget. Le banc exerce les services de mémoire et d'abstention de GenOS ; il
ne qualifie pas l'orchestrateur autonome complet ni une boucle de calibration
apprise. La connaissance préalable des règles affines n'est pas exclue ; les
associations noms/règles et les tâches exactes sont nouvelles.

Les tâches sont les unités conditionnellement à cet agent et ce monde, pas des
lignées indépendantes. Cent épisodes sont un point d'évaluation : leur nécessité
et un gain continu jusqu'au centième ne sont pas établis. Un contrôle de contexte
factice, des corpus tiers cachés, plusieurs lignées et une réplication indépendante
restent nécessaires pour élargir la conclusion.

Toute correction future devra être évaluée sur un nouveau corpus réservé. Ce
résultat négatif reste conservé : aucun relancement favorable, réglage des seuils
ou mécanisme de promotion ne l'a remplacé.

## Compréhension des échecs

L'[analyse reproductible](../../benchmarks/competence-100/diagnostics/README.md)
précise les causes et leurs limites. Un solveur déterministe utilisant uniquement
les exemples publics récupère les 120 réponses et les 40 lacunes : le rappel
n'est pas corrompu et les informations suffisent mathématiquement. Aucune réponse
n'est tronquée. Les prompts réservés après cent expériences contiennent exactement
les mêmes exemples qu'après douze ; seuls douze exemples distincts sont utilisés.

Le banc conserve des épisodes, mais n'active ni apprentissage procédural ni
calibration apprise. Il fournit à l'abstention une confiance déclarée, son inverse
comme incertitude, et une intégrité constante. Une confiance erronée de 1 passe
ainsi la politique. Ce montage ne permet pas de conclure sur une boucle complète
d'apprentissage GenOS.

Sur l'archive, les 24 lacunes ignorées sont précisément les expressions contenant
à la fois un opérateur connu et un inconnu. Quarante sondes LLM neuves explorent
les formats et les règles explicites ; quatre sondes additionnelles isolent le
calcul développé. Les règles textuelles aident sur les cas simples (3/4 contre
0/4 depuis les exemples négatifs), mais la composition et le calcul développé
restent à 0/4. La reconnaissance d'une lacune mixte passe de 0/4 avec exemples
à 4/4 avec règle explicite. Ces petits groupes, servis par Ollama réparé, sont
des diagnostics post hoc ; ils ne changent ni les scores ni les critères initiaux.

La prochaine expérience doit vérifier que l'état appris évolue effectivement,
séparer couverture des connaissances et confiance déclarée, et relier prévisions
et issues vérifiées sur un nouveau corpus réservé.

## Historique technique conservé

Les tentatives antérieures incluent un essai interrompu pour complexité et un
lancement de 580 erreurs HTTP 500 causées par l'exécuteur Ollama absent. Elles
restent sous `.genos-agent-worlds/competence-100/` avec leurs manifestes et sources.
Elles ne sont pas utilisées comme mesures cognitives. La mission de revue
GenOS avait également refusé un budget `biome` ; aucune revue indépendante n'en
est déduite.
