# Regressions déterministes après contrat spécialiste v3.7

Révision testée : `21384c999`.

Toutes les commandes ci-dessous ont terminé avec le code 0 :

- `npm run test:identity --prefix backend` — dossiers d'identité, runtime AgentSelf/WorkerSelf et Identity v2 passés.
- `node backend/tests/test_autobiographical_memory.js` — salience, capture, oubli, consolidation et rappel passés.
- `node backend/tests/test_fork_identity_service.js` — service de fork passé.
- `node backend/tests/test_self_ablation_p1.js` — preuves runtime comportementales B/C/D/G et garde-fou, 5/5.
- `node benchmarks/cognitive-key-ablation/self-ablation-harness.cjs` — protocole A-H, 4 scénarios, verdict `selfIsCausal: true`; la strate C est indiquée `decorative` dans ce harness et reste appuyée par le test runtime P1 distinct.
- `node backend/tests/test_identity_experiment_prompt_treatment.js`, `node backend/tests/test_local_artifact_policy.js`, `node backend/tests/test_worker_delegation_identity.js`, `node backend/tests/test_worker_runtime_identity_prompt.js`, `node benchmarks/identity-challenge/test-runtime-llm-score.cjs` — tous passés après les adaptations du contrat d'expérience.

Ces tests valident les contrats locaux et déterministes. Ils ne remplacent pas les défis LLM A/B/C ni les contrôles réels.
