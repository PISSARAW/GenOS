# Addendum préconfirmatoire v3.1 — références de soi et abstention

Date : 2026-10-22, avant le run confirmatoire.

Le smoke test du défi C a montré une incohérence de contrat : le WorkerSelf contenait la confiance mais les workers ne pouvaient citer que `mission`. Le runner attribuera donc une référence de preuve au bloc réellement visible : `worker_self` pour `genos_full`, `identity_sheet` pour `identity_sheet`, aucune référence de soi pour `self_model_masked` et `llm_only`. Les consignes définissent ces références et les décisions doivent les utiliser. L’identité de session reste vérifiée avant le traitement.

Clarification de l’oracle, également préconfirmatoire :

- Dans A et B, `genos_full` et `identity_sheet` doivent résoudre l’identité à partir de leur bloc visible et passer les critères substantiels.
- Dans A et B, `self_model_masked` et `llm_only` réussissent s’ils répondent `unresolved` sans deviner l’ID ou le rôle; leur mission n’expose pas d’ID actif.
- Dans C, `genos_full` doit citer `worker_self`, rapporter la confiance exacte consignée dans son reçu et suivre le seuil. Tous les autres bras doivent s’abstenir de produire une valeur non visible.

Le premier score v3 avant cet addendum n’est pas utilisé comme confirmatoire. Les prompts gardent les mêmes faits et seuils; seules les références de provenance et la règle explicite d’abstention sont clarifiées.
