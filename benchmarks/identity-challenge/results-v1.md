# GenOS Identity Challenge — résultats v1

Date : 2026-10-22 (Europe/Paris)
Code testé : `46004f1774517bd980d6691b1022eee2915987aa` (`origin/v3`). Protocole : [preregistration-v1.md](./preregistration-v1.md).

## Bras A — continuité de Thésée et fork

**Résultat : PASS, 3/3 suites.**

`npm run test:identity --prefix backend` a réussi : `test_agent_identity_dossier.js`, `test_identity_dossier_runtime.js` et `test_identity_v2.js`. Les assertions couvrent notamment la révision causale malgré changement de nom/modèle, le fencing de session, la reconnaissance et le rejet d’une présentation falsifiée ou rejouée, l’apprentissage, le fork, la restauration et la provenance d’un épisode hérité.

Sortie brute : `D:\GenOS\identity-campaign-20261022\A-theseus.log`.

**Limite :** ce sont des suites déterministes sur fixtures. Elles ne demandent pas à un agent LLM de s’auto-identifier après une série de changements d’environnement, rôle, machine et contexte.
