# Vérification des suites déterministes B/C — 2026-10-22

Worktree : `codex/identity-real-llm-isolated` sur D:\GenOS\identity-real-llm-isolated.
Révision de départ : `6bb3d2dd5`.

Toutes les commandes ci-dessous ont terminé avec le code 0 :

- `node backend/tests/test_autobiographical_memory.js` — salience, capture, oubli, consolidation et rappel passés.
- `node backend/tests/test_fork_identity_service.js` — service de fork passé (8 dimensions).
- `node backend/tests/test_self_ablation_p1.js` — preuves runtime B/C/D/G et garde-fou passés (5/5).
- `node benchmarks/cognitive-key-ablation/self-ablation-harness.cjs` — protocole A-H exécuté sur 4 scénarios. Verdict `selfIsCausal: true`; strates causales B, D, E, F, G, H. La strate C reste explicitement `decorative` dans ce harness et `requiresRuntimeProof: [C]`; le test P1 apporte une preuve runtime distincte, mais cela ne démontre pas encore le comportement de vrais agents LLM pour le défi C.

Ces résultats valident les suites déterministes et runtime locales visées. Ils ne sont pas comptés comme preuve de l'expérience confirmatoire avec de vrais agents LLM.
