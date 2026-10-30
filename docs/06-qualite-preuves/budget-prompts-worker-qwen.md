# Budget du prompt complet et reliquats des workers Qwen

Le cas `03-r1` de la campagne figée `4fc489872` demandait un plafond collectif de
24 000 tokens et un worker de 9 000 tokens. Le contrat et le run persistaient bien
9 000. Les deux premières tentatives avaient consommé respectivement
`2 905 + 162 = 3 067` puis `3 209 + 160 = 3 369` tokens mesurés. Le reliquat de
réparation était donc `9 000 − 3 067 − 3 369 = 2 564`.

Le troisième appel a pourtant consommé `3 808 + 150 = 3 958` tokens. La garde
initiale ne regardait que `mission.prompt`, avant assemblage de l'identité, des
instructions, du workspace et des retours de réparation. Le calcul de sortie
réservait en outre au moins 256 tokens même quand le prompt ne laissait pas cette
place. Le reliquat n'était pas une nouvelle allocation de 2 564 tokens.

Le runtime vérifie désormais le prompt assemblé avant génération. Il transmet le
reliquat explicite `requestTokenBudget` au routeur, qui recontrôle le prompt final
après préparation cognitive et avant réservation/appel fournisseur. Le plafond de
sortie est au plus `reliquat − estimation du prompt complet` ; aucun plancher de
sortie ne peut agrandir ce reliquat. Un prompt qui le consomme entièrement est
refusé avant l'appel. Le plan de délégation inclut ses propres instructions dans
ce calcul ; sa synthèse utilise le budget diminué de la consommation du plan.

`execution_budget.tokens` borne le scope collectif, `workerTokenLimit` borne le
worker et le reliquat borne la tentative courante. `localContextTokens` borne la
fenêtre du modèle : ce sont trois contraintes distinctes. La correction n'augmente
aucun plafond et ne réinterprète aucune exécution de la campagne figée.

L'estimation utilise les octets UTF-8 divisés par quatre ; elle n'est pas le
tokenizer Qwen et ne garantit pas le compte exact. Le provider reste la source de
consommation mesurée et le contrôle après génération reste nécessaire. Un refus
avant appel a `provider_called=0`, `token_usage_source=not_called` et des comptes
de tokens nuls dans le ledger, jamais une consommation estimée présentée comme
mesurée.

Validation : `test_worker_request_token_budget.cjs` utilise SQLite, le routeur et
le provider réel sur un transport HTTP simulé. Il vérifie le compteur fournisseur
inchangé en cas de refus, le reçu sans usage inventé, le plafond de sortie réduit,
la transmission du reliquat et le refus d'un plan trop grand. Le test
`test_worker_evidence_barrier_local_budget.js` vérifie les bornes arithmétiques.
