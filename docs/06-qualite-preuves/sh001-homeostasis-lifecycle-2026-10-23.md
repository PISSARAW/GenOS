# Correction du cycle de vie Homeostasis — 23 octobre 2026

## Échec observé

L’expérience SH-001 avec Qwen 14B a produit un correctif qui passe le contrôle public et l’oracle indépendant, mais la clôture GenOS est restée partielle. Le rapport d’orchestration a signalé `HOMEOSTASIS_CONTINUATION_START_FAILED` avec « Worker garage is full (slots: 0/3 used) », puis l’invariant `completion_contract_configured` a échoué. L’expérience Qwen elle-même ne constitue donc pas une réussite complète du gate GenOS.

La lecture de `D:\GenOS\data\operational\genos.db` n’a pas retrouvé l’identifiant de mission. Cette base n’est pas la source de vérité pour ce run; aucune conclusion sur l’état de son agent n’en est tirée.

## Cause confirmée dans le code

La voie Windows locale construit la mission worker avec l’ID de l’agent orchestrateur. Le worker local émet ensuite `AGENT_COMPLETED` ou `AGENT_FAILED`. Le service de statut terminal interprète ces événements et ferme l’agent avant que le gate de complétion n’ait fini d’évaluer la Homeostasis. Le garage refuse alors, à juste titre, de donner un slot à cet orchestrateur terminal. Le message « 0/3 utilisés » provenait du refus fail-closed d’un parent terminal, pas de trois workers actifs.

## Correction

La mission locale Windows porte `deferAgentTerminalStatus`. Pendant cette phase, les rapports conservent leur preuve mais passent par `LOCAL_WORKER_COMPLETED` ou `LOCAL_WORKER_FAILED`, avec statut `running`. Ces événements ne sont pas terminaux. L’orchestrateur garde ainsi son autorité de continuation; son finaliseur reste responsable du statut terminal après le gate. Le comportement ordinaire des workers sans ce drapeau reste inchangé.

## Échecs de l’itération

- Le premier patch scripté n’a trouvé aucun texte correspondant et n’a modifié aucun fichier; il a été réécrit avec le bon délimiteur de ligne.
- Une première version du nouveau test annonçait trois scénarios alors que seuls deux s’exécutaient. Le scénario du builder Windows a ensuite été ajouté réellement.
- L’assertion d’événement d’échec lisait l’index 7 au lieu de l’index 6 de la signature `emit`; elle a été corrigée après échec du test.
- Une première correction qui évitait seulement `updateAgent` était insuffisante: l’événement terminal restait consommé par `agentTerminalStatusService`. Les événements différés ont été renommés en événements de résultat locaux non terminaux et l’échec est couvert aussi.

## Vérifications finales

- `node backend/tests/test_local_worker_deferred_terminal_status.js` — 3 scénarios réussis, dont builder Windows, fin de worker avec preuve et échec worker.
- `node backend/tests/test_homeostasis_continuation.js` — 19 réussis, 0 échec.
- `git diff --check` — propre.

Cette correction élimine le blocage de cycle de vie démontré par le code et les tests ciblés. Une nouvelle expérience Qwen avec contrat de complétion explicite reste nécessaire pour prouver le gate de bout en bout.
## Refus de commit lors de l’expérience
La premiere tentative de commit a ete bloquee par le hook faute du bloc Receipt exact. Le gate qualite avait accepte les 7 fichiers source avec 0 violation. Le commit suivant fournit le recu demande.
