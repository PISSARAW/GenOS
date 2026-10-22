# GenOS Identity Challenge — résultats v1

Date : 2026-10-22 (Europe/Paris)
Code testé : `46004f1774517bd980d6691b1022eee2915987aa` (`origin/v3`). Protocole : [preregistration-v1.md](./preregistration-v1.md).

## Bras A — continuité de Thésée et fork

**Résultat : PASS, 3/3 suites.**

`npm run test:identity --prefix backend` a réussi : `test_agent_identity_dossier.js`, `test_identity_dossier_runtime.js` et `test_identity_v2.js`. Les assertions couvrent notamment la révision causale malgré changement de nom/modèle, le fencing de session, la reconnaissance et le rejet d’une présentation falsifiée ou rejouée, l’apprentissage, le fork, la restauration et la provenance d’un épisode hérité.

Sortie brute : `D:\GenOS\identity-campaign-20261022\A-theseus.log`.

**Limite :** ce sont des suites déterministes sur fixtures. Elles ne demandent pas à un agent LLM de s’auto-identifier après une série de changements d’environnement, rôle, machine et contexte.

## Bras B — attribution des souvenirs

**Résultat : PASS, 2/2 suites confirmatoires.**

`test_autobiographical_memory.js` passe pour capture, oubli, consolidation et rappel; `test_fork_identity_service.js` passe ses 8 dimensions. Le scénario de fork dans le bras A confirme aussi que l’auteur expérientiel initial reste `a` après transmission à `child`, puis à `b`, et que la transmission à un agent hors portée est rejetée.

Sorties brutes : `D:\GenOS\identity-campaign-20261022\B-autobiographical-memory-retry.log` et `B-fork-provenance.log`. Le premier lancement de B, conservé dans `B-autobiographical-memory.log`, s’est arrêté avant les assertions parce que `NODE_PATH` n’était pas défini; le relancement avec le chemin de dépendances partagé a réussi.

**Limite :** aucune fausse phrase autobiographique n’a été injectée dans le contexte d’un agent en langage naturel. Ce bras établit la provenance structurée et ses contrôles de portée, pas la capacité d’un agent à contester un récit persuasif.

## Bras C — ablation du modèle du soi

**Résultat : PASS des harnesses déterministes; bras LLM runtime non exécuté.**

`test_self_ablation_p1.js` passe ses 5 assertions sur les chemins réels de promotion, mémoire, interoception et homéostasie. Dans `self-ablation-harness.cjs`, sur 4 scénarios fixes, retirer le modèle opérationnel change la décision dans 2/4 scénarios; retirer la mémoire autobiographique ne change aucune des 4 décisions; l’interoception change 2/4 décisions; le workspace produit 3 effets de broadcast; le comparateur d’agence change l’attribution de 0,75; l’homéostasie change le comportement dans 1/4 scénarios (son delta d’affichage de 2 n’est pas causal); la métacognition change 1/4 décisions. Le test P1 séparé montre toutefois que les leçons autobiographiques changent la réponse « ce que j’ai appris ».

Sorties brutes : `D:\GenOS\identity-campaign-20261022\C-self-ablation-p1-retry.log` et `C-self-ablation-structural.log`.

**Limites déterminantes :** les scores sont des différences discrètes sur quatre fixtures, pas des estimations de probabilités d’action, des intervalles de confiance ou une campagne de missions. `computeCoupling` rend 0 ou 1 selon l’égalité des décisions; il ne mesure pas la différence statistique annoncée dans son commentaire. Le résultat mémoire dépend du chemin évalué : aucun delta de décision sur ces quatre scénarios, mais réponse différente dans le test du chemin `WorkerSelf`.

Le runner de missions LLM `runtime-ablation.cjs` n’a pas été lancé : aucun service n’écoutait sur les ports locaux Ollama (11434), LM Studio (1234) ou GenOS (4000) au contrôle préalable. L’appel à `genos_orchestrate` a également échoué avant l’exécution, car le runtime a sélectionné `a_team` sans activer son plan dédié. L’échec est conservé dans la trace de cette conversation; aucune mission LLM ni aucun oracle indépendant ne sont donc revendiqués ici.
