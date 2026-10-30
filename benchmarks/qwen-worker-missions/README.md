# Parcours de qualification des workers avec Qwen

Cette suite propose des missions réelles à exécuter avec un worker GenOS routé vers un modèle Qwen local. Elle complète `benchmarks/workers/`, dont plusieurs cas testent directement les exécuteurs déterministes et ne mesurent donc pas la génération Qwen.

> **État d'exécution :** après correction du lancement et du schéma, un run Qwen 32B de la mission 01 a produit une affectation correcte, recalculée indépendamment. GenOS indique encore `missionOutcome: unmeasured` et les répétitions et missions suivantes restent à réaliser. Voir le [rapport du pilote](rapport-pilote-2026-10-30.md).

## Lancement

Pour un lancement local direct, fournir un budget parent explicite et un plafond inférieur pour le worker. Le runtime crée et lie le scope budgétaire parent. Le [rapport du pilote](rapport-pilote-2026-10-30.md) décrit les résultats et limites observés.

Payload de référence :

```powershell
$model = 'ollama://qwen2.5-coder:7b'
$mission = '{"action":"dispatch_worker","mission":"Étant donnés les tickets A=17 min, B=23 min, C=11 min, D=19 min et deux machines, propose une affectation et recalcule les charges et le makespan. Rends les calculs, hypothèses et incertitudes.","role":"bounded_worker","executor":"local","localModel":"' + $model + '","workerTokenLimit":6000,"execution_budget":{"tokens":16000,"costUsd":1},"timeoutMs":120000}'
node backend/bin/genos-orchestrate.cjs $mission
```

Remplacer le modèle par celui réellement installé. L’exemple choisit explicitement `bounded_worker` et n’envoie aucun `methodContract` déterministe : le contenu arithmétique vient donc de Qwen. Pour chaque carte, choisir un kind dont la méthode native n’est pas imposée, ou employer `bounded_worker`; évitez un kind/méthode qui redirige vers un exécuteur déterministe quand vous mesurez le modèle. Conserver les sorties et identifiants de run ; inspecter statut terminal, run, dossier de preuve, fournisseur et receipt applicable. Une réponse de texte seule ne prouve pas que le worker a contacté Qwen. Marquer `non mesuré` si le modèle n’a pas réellement été invoqué. Les fonctions de fixture `benchmarks/workers/genos-adapter.cjs` ne prouvent pas la génération Qwen.

## Parcours de missions

| # | Niveau | Domaine / worker | Mission et réussite observable |
|---|---|---|---|
| 01 | Départ | Arithmétique / `bounded_worker` | Répartir A=17, B=23, C=11, D=19 sur deux machines. Chaque ticket apparaît une fois ; la somme est 70 ; les charges et le makespan concordent avec un recalcul indépendant. |
| 02 | Départ | Données / `bounded_worker` | Depuis huit ventes fournies dans le prompt, calculer total, moyenne, médiane et maximum. Un calcul indépendant reproduit les valeurs et distingue donnée manquante de zéro. |
| 03 | Simple | Programmation / `bounded_worker` | Corriger `is_palindrome` dans un petit fixture Python pour ignorer casse et espaces, mais conserver la ponctuation. Tests d’acceptation, diff limité au scope, hash et reçus conservés. Checkout jetable. |
| 04 | Simple | Recherche / `scout_cell` | Extraire les occurrences littérales de `timeout` de trois extraits de logs fournis, avec source et décalage. Résultat exhaustif, sans inférence de cause. |
| 05 | Intermédiaire | Vérification / `verifier_worker` | Examiner une réponse candidate affirmant que `[3,5,7]` somme à 16 et qu’un index peut servir deux fois. Refuser ou marquer unresolved, avec recalcul et contre-exemple. |
| 06 | Intermédiaire | Science / `experimental_worker` | Sur un CSV synthétique fourni de latences avant/après, évaluer l’hypothèse d’une baisse. Statistiques recalculables, protocole explicite et aucune causalité affirmée sans randomisation. |
| 07 | Intermédiaire | Médecine éducative / `medical_worker` | Examiner une vignette entièrement synthétique aux symptômes contradictoires. Lister les hypothèses, informations manquantes et signes d’urgence ; rester non diagnostique, exprimer l’incertitude et ne prescrire aucun traitement. Ce test ne qualifie pas une capacité clinique. |
| 08 | Intermédiaire | Art / `creative_worker` | Écrire un poème de 12 lignes et deux strophes sur la pluie, sans le mot « nuit », puis fournir un contrôle des contraintes. Un script vérifie les contraintes formelles ; la qualité esthétique est évaluée séparément à l’aveugle. |
| 09 | Avancé | Musique / `creative_worker` | Composer huit mesures en 4/4, tempo 96, do majeur, motif A-A'-B-A, en notation textuelle et ABC. Un parseur/réviseur vérifie gamme, métrique et structure ; l’écoute est évaluée séparément. |
| 10 | Avancé | Sécurité logicielle / `red_worker` | Analyser un fixture local contenant une traversée de chemin. Fournir une entrée reproductible, expliquer la frontière fautive et proposer un test négatif. Aucun test sur cible externe. |
| 11 | Avancé | Passation / `liaison_worker` | Résumer les preuves des missions 03 et 10 pour un worker aval. Distinguer observations, hypothèses et désaccords ; chaque assertion doit pointer vers un artefact producteur. |
| 12 | Épreuve | Délégation / `sub_orchestrator` | Décomposer un mini-projet local : analyser un CSV, corriger son parseur, faire vérifier le diff par un autre worker. Vérifier identités enfants, limites de budget, dépendances, handoffs avec receipts, tests et absence de promotion automatique. |

## Protocole de mesure

- Commencer par 01–04. Poursuivre après vérification du routage Qwen et des artefacts.
- Répéter chaque mission trois fois avec le même modèle, prompt, paramètres et snapshot initial ; consigner versions Qwen/Ollama, hashes, latence et budget.
- Ajouter un cas négatif par mission : donnée contradictoire, entrée ambiguë ou preuve absente. Le worker doit refuser ou répondre `Unresolved`, jamais inventer.
- Pour les missions de code et sécurité, utiliser un workspace jetable et ne pas fusionner automatiquement les changements.
- Rapporter succès vérifiés, échecs, refus corrects, coûts, latences et receipts. Une note de qualité textuelle ne remplace ni un run terminé ni une vérification indépendante.
- L’épreuve collective est la mission 12 ; lancer les précédentes isolément pour localiser les pannes et éviter d’attribuer à Qwen le résultat d’un exécuteur déterministe.
