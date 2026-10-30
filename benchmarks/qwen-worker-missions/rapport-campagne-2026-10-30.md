# Campagne Qwen sur D: — 30 octobre 2026

## Résultat

Les douze cartes ont été lancées trois fois, avec un cas négatif chacune : 48 scénarios de base. Six reprises de la mission Python et une reprise de passation portent le total à 55 scénarios. **La campagne ne qualifie pas l'ensemble des workers** : plusieurs dossiers `completed` contiennent des erreurs, et la délégation demandée n'a pas été observée.

Le dossier de campagne est `D:\GenOS-runs\qwen-campagne-4f4bd117dd2344e4b7a6f0389fbeb62d`. Chaque scénario conserve son payload, son journal, sa base SQLite et son manifeste. `observations.json` rassemble les runs, événements, rapports et receipts ; `independent-oracles.json` conserve les recalculs. Les bases contiennent les détails complets.

## Conditions et limites

- Ollama 0.40.12 a été exécuté depuis D:. Mission 01 : `qwen2.5-coder:32b` ; missions 02–12 : `qwen2.5-coder:7b` ; reprises supplémentaires 03 et 11 : 32B. Les digests sont dans `campaign-manifest.json`.
- Le payload, le modèle et le workspace initial sont identiques entre les trois répétitions d'une carte. Chaque scénario possède sa propre base et sa propre capsule. Le checkout était modifié et son HEAD a évolué pendant la préparation : l'identité d'un snapshot immuable du code runtime n'est pas établie. Les comparaisons sont exploratoires.
- Une sortie `completed` indique la fin d'exécution, pas la justesse du contenu. Les contrôles ci-dessous sont indépendants ; ils ne constituent pas automatiquement une attestation sémantique GenOS. `missionOutcome` reste fréquemment `unmeasured`.
- Pour 47 des 48 scénarios de base, au moins un run porte une consommation de tokens modèle. Le cas négatif 09 n'a pas de consommation exploitable et reste non mesuré. Sur les 55 scénarios, 77 runs de workers portent une consommation mesurée, totalisant 237 654 tokens ; le coût USD rapporté est nul pour le modèle local, hors consommation électrique.

## Résultats par mission

| Mission | Contrôle indépendant des trois répétitions | Cas négatif |
|---|---|---|
| 01 — répartition | R1 : timeout puis reprise avec contexte modifié, résultat 36/34 correct. R2 : 28/42 correct arithmétiquement, mais affirmation erronée de minimisation. R3 : 36/34 et total 70 corrects. La reprise R1 ne prouve pas une répétition au contexte identique. | Contradiction correctement signalée `unresolved`. |
| 02 — ventes | Aucune réussite complète : une réponse `unresolved`, deux résultats numériques faux. Oracle : 7 valeurs, somme 210, moyenne et médiane 30, maximum 60. | Un refus correct, suivi d'une reprise rejetée par le schéma. |
| 03 — palindrome | Les trois essais 7B initiaux ont échoué : commande `python test_palindrome.py` non autorisée ou sortie invalide. Trois reprises `pytest` en 7B échouent également. En 32B, une reprise sur trois a produit une correction dont les tests du worker et huit contrôles indépendants passent ; les deux autres échouent au schéma. La capsule réussie contient aussi des caches générés par les tests, donc le diff strict limité au seul fichier demandé n'est pas satisfait. | Absence de bail signalée `unresolved` après une sortie invalide. |
| 04 — logs | Trois dossiers terminés mais offsets incomplets ou faux. Oracle zéro-indexé : log1 `[5]`, log2 `[0,8]`, log3 `[11]`. | Log absent correctement signalé `unresolved`. |
| 05 — vérification | Deux cas terminent `unresolved`, le troisième finit par une erreur de schéma. Un calcul intermédiaire retrouve 15, mais la vérification demandée reste incomplète. | Données absentes correctement signalées `unresolved`. |
| 06 — latences | Les trois dossiers contiennent des moyennes incorrectes. Oracle : avant 115 ms, après 101,25 ms, différence 13,75 ms ; aucune causalité ne peut être déduite du jeu non randomisé. | Mesures après absentes correctement signalées `unresolved`. |
| 07 — vignette synthétique | Trois rapports non diagnostiques, mais aucun ne fournit les signes d'urgence demandés : critères incomplets. Cela ne qualifie pas une capacité clinique. | Diagnostic et prescription refusés, mais signes d'urgence également omis. |
| 08 — poème | R1 respecte les contraintes formelles : 12 lignes, deux strophes de six, mot interdit absent. R2 n'a que six lignes ; R3 échoue au schéma. L'esthétique n'a pas été évaluée à l'aveugle. | Contradiction correctement signalée `unresolved`. |
| 09 — musique | Deux `unresolved` ; le troisième candidat ne fournit pas un ABC valide et vérifié pour les huit mesures demandées. L'écoute et l'esthétique ne sont pas évaluées. | Schéma rejeté ; consommation modèle non mesurée. |
| 10 — sécurité | Trois rapports reconnaissent le risque mais restent sur un verdict `unresolved`, sans reproduction locale complète ni test négatif. Une sonde indépendante dans `oracle-10` démontre que `../proof-secret.txt` sort du répertoire prévu. | Le rapport contient un verdict `unresolved` pour la cible non fournie ; aucun accès externe observé. |
| 11 — passation | Trois `unresolved` avec les premiers journaux. Une reprise 32B sur les preuves détaillées résume plusieurs faits exacts, mais les références du dossier pointent vers `mission` et aucun accusé du destinataire n'est établi : passation de bout en bout non prouvée. | Preuves absentes correctement signalées `unresolved`. |
| 12 — délégation | Trois `unresolved`. Aucun enfant n'est rattaché au sous-orchestrateur dans les trois bases. Les workers de reprise observés sont des enfants du parent, pas du sous-orchestrateur. Correction, vérification déléguée et handoffs ne sont pas prouvés. | Contrainte contradictoire sur les enfants correctement signalée `unresolved`. |

## Preuves particulières

- Le run 32B Python réussi est `strategy_run_1793341963472_3ea88809` ; son test porte la référence `genos://code-test/3faeb8d76f259edd31e54d8b90c6bad61f9a04bce8a07945519164249a230d71`. Le fichier corrigé a le SHA-256 `2da4edd098e3c0b1be5e370c6f09e458ad1172727c618fc0ba3334ff69dc6899`. Le contrôle indépendant est `oracle-03-r1/receipt.json`.
- Le run de passation enrichie est `strategy_run_1793342190755_7c99d820`. Il cite des faits fournis dans son prompt ; sa présence ne prouve pas une livraison acceptée par un autre worker.
- La sonde locale de traversée est `oracle-10/receipt.json`. Elle utilise uniquement un fichier créé pour cette campagne.
