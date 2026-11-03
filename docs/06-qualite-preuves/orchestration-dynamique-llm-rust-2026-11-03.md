# Qualification de l’orchestration dynamique LLM dans Rust

**Date :** 3 novembre 2026.  
**Statut :** qualification ciblée, suites globales et essai réel vérifiés ; audit externe lié à la livraison.  
**Périmètre :** délégations choisies par un coordinateur LLM vers des workers préadmis, outils natifs confinés, vagues parallèles et sept protocoles.

Cette fiche complète la [référence opérateur](../03-reference/orchestration-dynamique-llm-rust.md) et l’[ADR 0786](../adr/0786-orchestration-dynamique-et-delegation-llm-rust.md).
Elle distingue les mécanismes vérifiés, les réponses HTTP de fixtures, les observations d’un modèle réel, les contrôles globaux et le reçu externe d’audit.
La publication conserve l’assurance `artifact_contract_verified` ; elle n’accorde ni vérité sémantique ni autorité de promotion ou d’effet externe.

## Mécanismes et frontière de preuve

Le profil réutilise les [vagues parallèles](../03-reference/missions-llm-paralleles-rust.md), leur [journal durable](../03-reference/rust-agentique-journal-parallele.md) et les [outils privés multi-agents](../03-reference/missions-llm-multi-agents-rust.md).
Le coordinateur choisit un sous-ensemble d’un pool d’un à trois workers.
Chaque slot est affectable une seule fois ; les identités, outils et quotas restent ceux de l’admission.

| Protocole | Frontière contrôlée |
| --- | --- |
| MORPH | Installation préalable des rôles, puis activation unique liée à l’affectation native |
| OMEGA | Intention avant HTTP ; reçu durable de chaque délégation et outil ; aucun nouveau permis pour une issue inconnue |
| ALLOSTASIE | Quotas globaux, réserve protégée de 5 %, usage observé cumulatif et expositions inconnues retenues |
| SYNAPSE | Tâche réellement reçue par le worker ; résultats reçus consommés par un tour ultérieur du coordinateur |
| GQWF Exchange | Copies CAS distinctes des tâches et des résultats, rehachées avant consommation |
| CONTINUITY | Refus de succession tant qu’une affectation ou son retour reste en attente ; refus conservateur sans vérificateur natif |
| EVIDENCE | Couverture exacte des appels admis, affectations, activations, copies, complétions et vagues closes avant publication |

Les modules d’[affectation](../../crates/genos-orchestrator/src/mission_protocols/agentic_delegation.rs), de [copie des tâches](../../crates/genos-orchestrator/src/mission_protocols/agentic_delegation_exchange_tasks.rs) et de [retour des workers](../../crates/genos-orchestrator/src/mission_protocols/agentic_delegation_exchange_returns.rs) sont raccordés au parcours natif.
Une tâche envoyée par le coordinateur ne prétend pas que ce dernier est terminé.
Le reçu de `delegate_task` atteste son enregistrement, pas la future complétion du worker.

La [reconstruction des contextes](../../crates/genos-orchestrator/src/mission_protocols/agentic_context_prompt.rs) conserve un préfixe historique : au tour `t`, seules les affectations émises avant `t` et leurs retours requis peuvent entrer dans la requête du coordinateur.
L’[ordonnanceur](../../crates/genos-orchestrator/src/mission_protocols/agentic_parallel_scheduler.rs) attend ces retours, puis peut activer un autre slot encore dormant.
La [clôture EVIDENCE](../../crates/genos-orchestrator/src/mission_protocols/agentic_evidence_closure.rs) ne transforme pas les slots inutilisés en agents exécutés ou terminés.

## Vérifications ciblées

| Groupe | Résultat effectivement recueilli |
| --- | --- |
| Affectations, origine native, unicité, permissions et rollback | 7 tests unitaires passent |
| Tâches et retours CAS, événements, contextes historiques et couverture inverse | 8 tests unitaires passent |
| Runtime HTTP, sélection, adaptation, parallélisme, inconnus et reprise | 5 tests passent |
| CLI dans de nouveaux processus, ordre des outils, quotas et reprise | 7 tests passent |
| SDK sans `native-llm`, succession et refus de vérification indisponible | 8 tests passent, dont 2 nouveaux |

Les quinze tests unitaires, cinq tests runtime et sept tests CLI ont passé dans la même campagne ciblée F2 : **27 tests exécutés, aucun échec**.
Ils utilisent de vraies requêtes HTTP et de vraies transactions SQLite avec des réponses contrôlées ; ils ne sont pas présentés comme des générations d’un modèle réel.
Les huit tests sans fonctionnalité native ont ensuite passé sous les sources F3.
La suite globale F3 a ensuite réexécuté l’ensemble natif avec succès ; le résultat ciblé F2 reste un historique distinct. Les contrôles F4 portent sur le périmètre de livraison étendu décrit ci-dessous.

Les [tests runtime](../../crates/genos-orchestrator/tests/agentic_dynamic_runtime.rs) observent deux requêtes de workers reçues avant la première réponse de la fixture.
Ils vérifient une sélection partielle qui laisse un slot dormant, puis une sélection adaptative d’un troisième worker après consommation des premiers retours.
Ils couvrent aussi la réponse ambiguë d’un worker, l’exposition conservée, l’arrêt du parent et l’absence de redispatch au rejeu.

Un trigger SQLite peut interrompre l’enregistrement d’un outil après une observation modèle réelle.
La reprise termine seulement les effets connus manquants, conserve les reçus déjà appliqués et active les enfants sans renvoyer l’observation du parent.
La corruption du BLOB reçu par le coordinateur bloque la publication ou son rejeu, sans nouvel appel modèle.

Les [tests CLI](../../crates/genos-cli/tests/rust_agentic_dynamic_mission.rs) contrôlent ces frontières dans de nouveaux processus, avec `PATH` privé et `GENOS_MOCK_LLM=1`.
Cette variable n’autorise aucun court-circuit de l’HTTP natif.
Le rollback de l’enregistrement d’une délégation ou de son reçu conserve les observations connues et permet une reprise sans nouvelles inférences.

### Correction d’une assertion de test

La première campagne runtime avait quatre tests réussis et un test en échec.
Le test de corruption attendait une autre forme de refus alors que le runtime produisait déjà `AGENTIC_EXCHANGE_OBJECT_CORRUPT`.
L’assertion a été corrigée pour vérifier ce refus exact et maintenir les exigences de non-publication et de zéro appel supplémentaire.
La garde de production n’a pas été affaiblie ; le journal de cet échec reste conservé.

### Barrière des lots de délégation

Le premier essai réel ci-dessous a révélé qu’un coordinateur pouvait demander deux délégations et écrire un brouillon immuable dans la même réponse, avant les retours.
Le [dispatch des outils](../../crates/genos-orchestrator/src/mission_protocols/agentic_tools_dispatch.rs) traite désormais tout lot contenant `delegate_task` comme un lot d’enregistrement uniquement.
Chaque autre outil reçoit `AGENTIC_DELEGATION_BATCH_REGISTRATION_ONLY`, même s’il apparaît au premier index, avant l’activation des workers.
Le refus reste durable et compté ; l’outil peut être redemandé après les retours.

La régression CLI place précisément cette écriture au premier index.
Elle exige son refus, l’absence d’artefact empoisonné, puis une véritable écriture après consommation des résultats.
La barrière porte sur le lot observé : elle ne prétend pas prédire les délégations que le modèle pourrait demander dans un autre tour.

### Succession d’un SDK sans vérificateur natif

La revue a trouvé un chemin public `Store::handoff` compilé sans `native-llm` qui pouvait ignorer les affectations lorsque modèles, outils, vagues et expositions semblaient déjà clos.
Le [garde CONTINUITY](../../crates/genos-orchestrator/src/mission_protocols/continuity.rs) refuse maintenant la succession dès qu’une affectation du run courant est présente et que ce build ne dispose pas du vérificateur natif.

Les [tests de succession](../../crates/genos-orchestrator/tests/mission_protocol_continuity.rs) ajoutent deux cas sans fonctionnalité native.
Le premier utilise une vraie admission de mission générique et un marqueur négatif synthétique de délégation : aucun reçu modèle ou MORPH n’est inventé.
Il exige le refus, la conservation de l’incarnation courante et l’absence de handoff journalisé.
Le second maintient le cas positif d’une table vide ou d’une affectation appartenant à un autre run.
Les huit tests de ce groupe ont passé avec `--no-default-features`.

### Correction complémentaire du caller Node

La première exécution globale `npm test` sous F3 s’est arrêtée avec code 1 sur
`SQLITE_ERROR: cannot start a transaction within a transaction`.
Le caller de complétion locale était déjà présent, avec le même contenu,
dans la base Git `80f9bf24`.
Quatre sondes isolées pouvaient passer avec les anciens et nouveaux binaires ;
elles ne reproduisaient pas à elles seules l’échec global.

La trace a néanmoins identifié un défaut d’appel précis :
[workerEvidenceBarrierLocalCompletion.js](../../backend/src/services/workerEvidenceBarrierLocalCompletion.js)
passait quatre arguments positionnels à une API qui attend un objet.
La déstructuration sélectionnait le handle brut `sqlite3.Database` du wrapper,
avec des `BEGIN` et `ROLLBACK` sans callback sur la même connexion.
Le correctif transmet l’objet `{db, agentId, state, options}`.
Le défaut et son correctif ne sont pas attribués à une modification du runtime Rust.

Le [test local du worker](../../backend/tests/test_mission_protocols_local_worker.js)
ajoute une assertion réelle sur `conscience_transitions`.
Avec le caller original et cette assertion renforcée, le processus termine
avec code 1 : zéro transition au lieu d’une.
Après le correctif, le même test termine avec code zéro et vérifie une seule
transition `worker_task_completed`, une révision augmentée de un, un budget
non augmenté et des valeurs avant/après identiques à celles de l’agent.

Le caller conserve aussi un budget explicitement nul en utilisant `??`
pour sa valeur par défaut.
La garde de preuve métier reste active : la réponse du modèle non vérifiée
ne devient pas une complétion métier acceptée.
La sonde après correction observe une arité de persistance égale à un,
zéro entrée transactionnelle avec driver brut et zéro appel transactionnel
sans callback.

Les reçus RED, GREEN et de trace, ainsi que le premier échec npm et les
sondes précédentes, sont conservés séparément.
Ce contrôle Node complète les preuves natives ; il ne remplace aucun des
tests, usages ou essais LLM du domaine Rust.

## Essais avec un modèle réel local

Les essais utilisent Ollama local et `qwen2.5:14b`, avec appels d’outils structurés réellement reçus.
La source est une note publique synthétique ; aucun shell ni accès implicite au filesystem du workspace n’est accordé au modèle.
Chaque binaire est copié, haché et lié à l’admission.
Le rejeu utilise un nouveau processus et la même mission ; les traces antérieures ne sont ni effacées ni reclassées.

| Mission réelle | Verdict de l’objectif expérimental |
| --- | --- |
| `ac181258-2312-466b-adfc-5edb1944ae3c` | **Non qualifié** : CLI et rejeu `completed` avec codes zéro, mais brouillon créé avant les retours |
| `76d5429e-c145-482f-83f0-8a7cece57706` | **Non qualifié** : code 1, `unresolved`, réponse tronquée ; aucun outil appliqué |
| `c99d68e5-9526-4fc4-83e9-60187cb45aa3` | **Qualifié pour cet objectif borné** : codes zéro, retours consommés avant écriture et rejeu stable |

### Premier essai : résultat négatif conservé

| Observation | Valeur |
| --- | --- |
| Premier processus | 49,428 s, code zéro, `completed` |
| Rejeu | 12,412 s, code zéro, observations, usages et publication inchangés |
| Acteurs et HTTP | Trois identités logiques, six observations natives |
| Outils | Cinq reçus réussis : deux délégations, deux lectures et une écriture |
| Vagues | Quatre vagues jointes ; pic de deux workers de tours actifs |
| Tokens reçus | 4 004, égaux à la somme des compteurs des reçus |
| Temps agrégé observé | 27 223 ms ; somme des opérations, distincte du temps écoulé |
| Ordre réellement observé | Deux délégations et `write_artifact` dans le tour zéro du coordinateur ; complétion au tour suivant |
| Verdict du harness | `qualified:false`, malgré le statut CLI `completed` |

Le résultat ne démontre pas que le brouillon écrit a utilisé les réponses déléguées.
Le coordinateur a consommé les retours dans son dernier contexte, mais la création originale du brouillon était déjà persistée au tour zéro.
Une complétion ultérieure ne change pas rétroactivement la provenance de cette écriture.

Le manifeste figé du premier essai porte l’empreinte
`ebaefa964a697d3d58c49d5c488fd95d152b437d64e5d21897f706850f526154`.
La copie SQLite cohérente porte
`1d167cb4302dd455a7ff5330a8056563566a1dc7ea7b918725188dfddcccfdbe`.
L’audit indépendant ouvre cette copie en lecture seule immuable, vérifie les copies CAS et reçus, et conserve le verdict négatif.
Ses contrôles causaux refusent effectivement la création précoce du brouillon et le lot mixte de délégations et d’écriture.
Les vingt-deux fichiers du manifeste restent inchangés.

### Second essai : réponse tronquée, aucun outil appliqué

Ce nouvel essai utilise les sources F3 et le binaire final, avec une limite de sortie de 256 tokens.
Le CLI termine en `unresolved`, code 1, après 31,559 s.
Le fournisseur rapporte 857 tokens au total, dont 256 tokens de sortie, et 27 471 ms de temps agrégé.
Une observation native est conservée avec `finish:truncated`.

Deux appels `delegate_task` sont réellement présents dans cette réponse HTTP et parsés.
Aucun outil n’est cependant exécuté : zéro reçu d’outil, affectation, activation de worker ou brouillon.
L’unique vague ne permet aucune publication.
Les compteurs restent à un appel modèle, zéro outil, zéro exposition et zéro inconnu ; le budget n’est pas déclaré libéré.
Aucun rejeu de cet essai n’a été lancé.

Ce refus applique la garde existante des réponses tronquées.
Aucun code ni contrat n’est affaibli pour rendre l’essai positif.
Le manifeste de vingt-cinq fichiers porte
`56cfbca305aef2ffe5f46205816a81c167a7b98173b17eeb224f13041845ae80`
et le snapshot SQLite
`d00993985547df173cbfe23efc13d324b4fa28f93fb60945912a15edc71234b5`.
L’audit indépendant maintient son verdict négatif et vérifie ces fichiers sans ouvrir la base de travail.

### Troisième essai : ordre causal observé et rejeu stable

L’opérateur admet une nouvelle mission avec une limite de sortie de 768 tokens et des tâches plus courtes.
Le code, le binaire et les garde-fous restent ceux de F3.
Ce changement explicite de configuration ne permet pas de comparer les trois essais comme un benchmark à paramètres constants.

| Observation | Valeur |
| --- | --- |
| Binaire SHA-256 | `2df3f0260e5876f0ea9fd86dee634dc7730caae3a30cc290745b665aaec9d75d` |
| Incarnation | `38ad743b-0a23-41c3-8e6a-ae960c697346` |
| Premier processus | 28,003 s, code zéro, `completed` |
| Rejeu dans un nouveau processus | 11,178 s, code zéro, même publication et même usage |
| Modèles et rôles | Sept observations HTTP authentiques ; trois identités logiques |
| Délégations | Deux appels natifs admis dans le tour zéro du coordinateur |
| Outils | Six reçus : cinq succès et un refus durable |
| Écriture précoce | `tool/coordinator/0/2` refusé par `AGENTIC_DELEGATION_BATCH_REGISTRATION_ONLY` |
| Lectures | Un `read_source` réellement exécuté par chacun des deux workers |
| Création du brouillon | `tool/coordinator/1/0`, après réception des deux résultats |
| Vagues | Cinq vagues jointes ; pic de deux workers de tours actifs |
| Tokens reçus | 5 304, égaux à la somme des compteurs des sept reçus |
| Temps agrégé observé | 9 288 ms, distinct des 28,003 s écoulées |
| Expositions et inconnus finaux | Zéro ; budget libéré |
| Rejeu | Zéro nouvelle vague ou worker ; observations, événements, coûts et publication inchangés |

L’écriture originale du brouillon produit réellement 21 octets, d’empreinte
`1d1216a849b0889b9f23a9ba74a6e1ffd8a23f952655342ac9d5b60e6975f560`.
Son reçu vient du tour un du coordinateur.
Le contexte SYNAPSE de ce tour contient exactement les deux retours copiés et rehachés depuis les workers.
Le refus du premier lot n’a donc pas laissé un artefact immuable créé avant ces retours.

Le brouillon privé et le texte final publié ont des identités distinctes.
La tête CAS finale correspond au texte final du coordinateur, d’empreinte
`d65d56c677c458d22f3db7fd93ee0c6457c62e0c81d47469985cd2198ca3b78c`.
La publication GQWF, le reçu OMEGA, la fermeture EVIDENCE et le statut de run sont effectivement persistés.
L’audit contrôle les sept journaux de protocoles, les effets CONTINUITY clos, la réserve protégée, les usages et les historiques de vagues.

Le manifeste de vingt-quatre fichiers porte
`0ac23c6b209d3b505c4b92f84dcd54cf192027566ddad12db1d3887a76b87a98`,
la preuve brute
`b646f386a1c820ad20165278f3426438f148f2a57b1cfe46ace37394ded8a614`
et le snapshot SQLite cohérent
`bf1fb57821d91b9781e9985b8e491726b3f00ac5cd5b47ead6c80f4116081425`.
La relecture indépendante utilise uniquement ce snapshot en mode lecture seule immuable.
Ses octets, le manifeste et les deux essais négatifs restent inchangés après audit.

Cet essai satisfait l’objectif borné de délégation native, de consommation des retours avant écriture et de reprise stable.
Il n’établit pas de vérité sémantique, de calcul parallèle dans le fournisseur ou de garantie de réussite pour toute mission.

## Sources et validations globales

Le travail se poursuit dans un checkout Git indépendant sur D:, branche
`codex/dynamic-llm-rust`, après saturation du disque C: et accord de déplacement.
Le checkout C: est préservé ; aucun processus étranger ni verrou de test
n’est supprimé.
Les sources F1, F2 et F3, leurs résultats et leurs échecs demeurent des
historiques distincts.

Le domaine natif compilé de l’essai réel reste **exactement les 30 fichiers
Rust figés en F3**, avec normalisation CRLF vers LF :
`6e3ad8e24977f9ed2f87fba96ecbe18576d3c851a4065ecc99e38fabffc05aa5`.
Le binaire épinglé et les trois manifestes d’essais ne sont pas reconstruits
ou réécrits pour ajouter le correctif Node.

Le domaine de livraison et des contrôles globaux F4 comporte **32 fichiers** :
ces mêmes 30 fichiers Rust inchangés, plus uniquement
`backend/src/services/workerEvidenceBarrierLocalCompletion.js` et
`backend/tests/test_mission_protocols_local_worker.js`.
Son empreinte normalisée est
`4c768c53f9a4dd785cb4704cff9fde68f5052ca25cd2ab587fe8a0602e462756`.

L’audit exige que le domaine de l’essai soit la projection exacte de F4
obtenue en retirant ces deux chemins Node nommés.
Il n’accepte aucun sous-ensemble arbitraire, fichier Rust changé ou manquant,
ni entrée de compilation ajoutée en dehors du gel natif.
Le correctif Node est couvert par ses propres preuves RED/GREEN et par les
contrôles globaux F4, avec empreinte avant/après.

| Commande ou contrôle | Périmètre et résultat recueilli |
| --- | --- |
| Vérification qualité F3 | Code zéro ; 8 813 sources, zéro violation ; historique conservé |
| SDK sans `native-llm`, F3 | Code zéro ; 8 tests passent |
| Compilation workspace `--no-run`, F3 | Code zéro ; compilation seule, aucun test compté |
| `cargo test --workspace --locked --offline`, F3 | Code zéro ; 1 194 tests passés, 149 cibles, zéro échec et zéro ignoré ; historique conservé |
| Premier `npm test`, F3 | Code 1 ; erreur SQLite observée, diagnostic et sondes conservés |
| [Vérification qualité](../../scripts/ci/check_code_quality.py), F4 | Code zéro ; 8 813 sources, zéro violation ; empreinte F4 inchangée |
| `cargo test --workspace --locked --offline`, F4 | Code zéro ; 1 194 tests passés, 149 cibles, zéro échec et zéro ignoré ; empreinte F4 inchangée |
| `npm test`, F4 | Code zéro ; chaîne racine complète jusqu’aux 14/14 suites d’inventaire ; empreinte F4 et binaire épinglé inchangés |
| Audit des dix commits et de la livraison finale | Le reçu externe sera produit après vérification des dix commits, des sources et des preuves ; aucun succès d’audit anticipé ici |

Les résultats antérieurs ne sont pas reclassés comme validations F4.
L’audit final devra lier les dix commits réellement ancêtres, les
projections documentaires, les deux domaines source exacts, le binaire et
les sorties de processus terminées.
Une compilation `--no-run` n’est jamais transformée en tests exécutés.
Les preuves brutes, journaux, reçus et bases restent hors Git, sans lien
machine-spécifique dans cette documentation.

## Mémoire de développement et attribution

Les appels au MCP de développement initial ont rencontré `SQLITE_FULL` sur C:.
Leur persistance n’a pas été revendiquée.
Un serveur MCP réel a ensuite été utilisé sur D:, avec une base de mémoire neuve et un lease explicite exposant seize outils du catalogue canonique.
L’historique de C: n’a pas été importé dans cette nouvelle base.

La décision de barrière `decision-8d3dfe27-f1be-4ce5-9fe7-58ef66b5469f` et l’épisode
`9aa38d54-42e4-471f-a91a-406422ab7a47` ont été persistés et relus dans SQLite D:.
Ces traces portaient un statut de travail en cours.
Leur attribution reste `external_unattributed` : fournir un identifiant d’agent dans le contenu ne crée pas une attribution `agent_bound`.
Cette persistance ne certifie ni les tests, ni une autorité de promotion.

## Limites de la qualification

Les rôles sont des identités logiques préadmises, partageant l’hôte et le fournisseur.
Un pic de deux workers de tours ou des HTTP concurrents ne prouve pas que le fournisseur calcule deux générations simultanément.
Le quota de temps mesure une somme d’opérations ; le bail borne séparément la durée écoulée.

Les deux méthodes de vérification du contrat textuel s’exécutent dans le même hôte Rust.
Elles vérifient les critères structuraux installés et la fermeture causale, pas une vérité générale de la prose.
Les champs `semantic_truth_verified`, `promotable` et `external_effects_authorized` restent faux.
La reprise conserve les observations et effets durables ; elle ne restaure ni poids du modèle ni KV cache.

Les [preuves du profil parallèle statique](missions-llm-paralleles-rust-2026-11-03.md) et celles du [profil multi-agents précédent](missions-llm-multi-agents-rust-2026-11-03.md) restent inchangées.
Cette fiche ne les réutilise pas comme essais de délégation dynamique.
