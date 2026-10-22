# Pilote runtime réel v2 — résultat et invalidation du protocole

Date : 2026-10-22. Rapport brut : `runtime-llm-1792701109901.json`.

## Ce qui est démontré

- 36/36 missions ont une inférence Ollama `qwen2.5:14b` terminée.
- 36/36 ont un reçu GenOS du traitement demandé, avec hash SHA-256 du prompt.
- Digest du modèle : `7cdf5a0187d5c58cc5d369b255592f7841d1c4696d45a8c8a9489440385b22f6`.
- 0 échec de dispatch et 0 timeout. Le routage GenOS local et les quatre traitements ont donc réellement tourné.

## Verdict expérimental

**Pilote invalide pour conclure à l’utilité causale du modèle du soi.** Le score exploratoire de l’oracle (19/36) n’est pas interprétable comme effet de traitement :

1. A/B injectaient l’ID du worker réel dans le texte de mission comme ID enfant. Le bras `llm_only` pouvait recopier cet ID sans consulter son identité runtime; le défi divulguait donc le label.
2. C disait dans la mission qu’aucune sonde n’avait été exécutée et qu’aucun bail d’outil n’était fourni. Les quatre bras pouvaient abstentionner à partir de la tâche, sans consulter leur WorkerSelf.
3. Les IDs d’orchestrateur étaient générés sans équilibre parent/enfant. Le rôle pouvait être deviné à partir de la construction du cas.
4. La règle de score lexicale ne suffit pas à établir une attribution autobiographique fiable.

Les 36 inférences et reçus sont une réussite de runtime. Les réponses et scores de ce pilote sont conservés, mais **aucune conclusion comportementale A/B/C n’en est tirée**. Il faut supprimer les fuites de label, randomiser l’identité active et scorer la décision selon une oracle préenregistrée à partir du reçu de traitement.
