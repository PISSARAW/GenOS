# GenOS Identity Challenge — préenregistrement v1

Date d’enregistrement : 2026-10-22 (Europe/Paris)
Révision testée : `46004f1774517bd980d6691b1022eee2915987aa` (`origin/v3`)
Branche de travail : `codex/identity-tests`

## Question et portée

Les mécanismes d’identité causale, de mémoire de provenance et de modèle du soi modifient-ils les états ou décisions observables de GenOS dans les scénarios ciblés ? Cette campagne mesure des propriétés fonctionnelles du runtime. Elle ne teste ni ne revendique une expérience subjective ou une conscience.

La campagne initiale se limite aux harnesses déterministes présents dans le dépôt. Aucun modèle génératif local n’étant actif au contrôle préalable, les réponses d’agents en langage naturel, l’évaluation indépendante par LLM et les comparaisons runtime ne sont pas incluses dans les résultats de cette version.

## Bras préenregistrés

### A — Continuité de Thésée et fork

- Commande : `npm run test:identity --prefix backend`.
- Unités : les trois suites `test_agent_identity_dossier.js`, `test_identity_dossier_runtime.js` et `test_identity_v2.js`.
- Critère de réussite : code de sortie 0 et assertions de continuité, révision causale, fencing, reconnaissance, fork, restauration et provenance héritée passées.
- Interprétation : preuve de contrat logiciel sur fixtures; pas une interrogation comportementale d’agents LLM après mutations de nom, rôle, machine et contexte.

### B — Mémoire personnelle, héritée et attribution

- Commandes : `node backend/tests/test_autobiographical_memory.js` et `node backend/tests/test_fork_identity_service.js`.
- Critère de réussite : code de sortie 0; les épisodes hérités gardent leur auteur expérimentateur et les scénarios négatifs de portée/provenance sont rejetés.
- Interprétation : vérification de provenance structurée. Le récit en langage naturel « faux souvenir » et l’abstention d’un agent face à ce récit ne sont pas mesurés par ces tests.

### C — Ablation causale du modèle du soi

- Commandes : `node backend/tests/test_self_ablation_p1.js` et `node benchmarks/cognitive-key-ablation/self-ablation-harness.cjs`.
- Critère de réussite : les assertions préexistantes passent; consigner chaque bras, scénario, delta comportemental et mécanisme non branché en production.
- Interprétation : mesures déterministes sur fonctions et scénarios fixés. Un score binaire de différence n’est pas une estimation de `P(action|self) − P(action|self ablated)` sur une population de missions.

## Procédure et rapport

1. Enregistrer cette spécification dans Git avant les exécutions confirmatoires.
2. Rejouer A, B et C depuis la révision ci-dessus, dans cet ordre; conserver stdout, stderr, code de sortie, heure UTC et empreinte de la révision dans `D:\GenOS\identity-campaign-20261022\`.
3. Ne retirer aucun scénario en fonction de son résultat. Toute déviation est consignée.
4. Rapporter les tests réussis séparément des comportements non testés et des limites de l’environnement.

Aucune graine pseudo-aléatoire n’est déclarée : les harnesses retenus utilisent des fixtures déterministes et leurs propres identifiants générés ne sont pas des variables expérimentales.
