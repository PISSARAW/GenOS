# Qualification réelle des variants Trinity

- **Date** : 2026-10-06
- **Statut** : Partiel, aucune promotion démontrée
- **Portée** : les 48 missions du document fourni, sur un laboratoire isolé dans D:

## Source et protocole

Le document `Missions de test des variants Trinity.docx` définit douze variantes,
avec quatre niveaux chacune. Son SHA256 est
`a68540e55f4e0435a221b4585225c5bbece8ff6b9902994911d72878cd766d44`.
Quatre agents de qualification ont distribué les missions à de vrais workers.
Les bases, capsules privées, requêtes, sorties et journaux sont conservés dans
`D:\GenOS-Trinity-qualification-20261006-01a1109a`.

Les missions ouvertes reçoivent une instance explicite et un contrat de fichiers.
Ces ajouts sont documentés séparément de la demande originale. Les workers
produisent `answer.json`, leurs explications et, lorsque demandé, du code exécutable.
Les contrôles sont rejoués avec le vérificateur original du laboratoire.
L'intégrité des fichiers de contrôle est vérifiée par empreinte avant de retenir
un PASS. Les réponses constantes qui remplaceraient un calcul attendu restent
refusées. Aucun reçu de claim ni état de promotion n'est créé par le laboratoire.

## Ce que prouve un résultat

Le relevé final compte **48 missions soumises, 88 tentatives, 24 missions avec
au moins un livrable contrôlé et 71 mondes PASS**. Les copies destinées à la
publication ont été rejouées : **71/71 PASS**. Il y a **zéro promotion vérifiée**.

Un livrable qui passe le banc prouve les propriétés calculées sur les instances
publiées. Il ne prouve pas automatiquement la qualité de toute l'argumentation,
l'achèvement du worker, le mécanisme distinctif de la variante ou sa promotion.
Les fronts Pareto utilisent des coûts hypothétiques, les migrations temporelles
des scénarios locaux et les graphes exploratoires des exemples construits.
Aucun de ces résultats ne constitue une mesure de performance en production.

Les prédictions oraculaires viennent d'appels Ollama réels, horodatés avant les
dispatchs. Elles servent à comparer les prédictions du laboratoire aux calculs
ultérieurs. Elles ne qualifient pas la garantie ex ante du moteur Oracle Trinity.
Les votes d'un jury, les enfants récursifs et les changements adaptatifs exigent
leurs propres traces runtime ; une réponse présentant ces idées ne suffit pas.

## Blocages observés

- Le plafond effectif de 8 000 tokens par worker interrompt des travailleurs
  après la création de réponses correctes, malgré un budget de mission supérieur.
- Des arrêts Sentinel, des timeouts et des mondes incomplets empêchent la promotion.
- Heterogeneous refuse une diversité configurée de 0.135, inférieure au minimum
  de 0.35. Aucune diversité observée multi-modèle n'est revendiquée.
- `BIOLOGICAL_WORKER_MISSION_AMBIGUOUS` apparaît lorsque la mission demandée au
  binding diffère de la mission active assignée au worker. Les refus sont conservés.
- Le chemin local rencontre aussi des capacités manquantes. Il n'est pas qualifié
  par les réussites des workers Codex.

## Corrections et validation

Les corrections du démarrage et de la livraison des missions sont décrites dans
[l'ADR de délégation](../adr/0332-delegation-workspaces-scelles-trinity.md).
Elles conservent l'isolation, Cedar, les leases, le confinement des chemins et les
gates d'évidence. Les hooks Codex n'ont pas été forcés en confiance et leur
enforcement reste non qualifié.

La suite Trinity passe ses **28 tests sur 28**. Les tests Cedar et les contrôles
biologiques ciblés passent également. Les vérifications globales du dépôt restent
incomplètes : `npm test` échoue sur la dépendance absente
`@biscuit-auth/biscuit-wasm`, après biologie 7/7 et backend initial 55/55 ;
`cargo test --workspace` échoue à l'édition de liens MSVC lorsque C: est plein.
Le gate de qualité du checkout partagé signale 153 violations nouvelles par
rapport à sa baseline. La baseline n'a pas été modifiée.

## Publication des preuves

Le rapport complet, le manifeste de toutes les tentatives et les protocoles
originaux restent dans le laboratoire D:. À la demande de l'utilisateur, seules
les copies exactes des livrables contrôlés, leurs vérificateurs et les fichiers
nécessaires au replay sont destinés à la publication dans
[GenOSWork](https://github.com/PISSARAW/GenOSWork/tree/main/public/recorded-runs/trinity-2026-10-06).
Le manifeste public `results.json` contient les compteurs des réussites, la date
d'observation, les scopes, les contrôles et les SHA256. Les bases, secrets et
répertoires de runtime restent locaux. La publication précise l'absence de
promotion ; elle ne présente pas les douze variantes comme intégralement qualifiées.

Le site GenOSWork a été compilé avec Next.js 16.3.8/Turbopack dans une copie
complète sur D: : 338 pages générées. Ses tests comptent 126 PASS et 61 ignorés.
Cette validation du site ne remplace pas la validation globale du runtime GenOS.
