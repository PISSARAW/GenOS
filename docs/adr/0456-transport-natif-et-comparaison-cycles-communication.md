# ADR 0456 — Transport natif et comparaison des cycles de communication

- **Statut** : Accepté pour le canal `SIGNAL` ; gain net non démontré.
- **Date** : 2026-10-12.
- **Domaine** : Communication d'équipe et mesure des tokens.
- **Lié à** : [ADR 0449](0449-raccord-checkpoint-communication-et-couts-par-agent.md).

## Contexte

Le cycle live sait publier un `SIGNAL` par le transport natif, mais son test
principal utilisait un adaptateur. Les reçus pouvaient également être fournis
dans les options du cycle, sans passer par le résultat du transport. Une somme
de reçus partiels ne permettait pas de comparer deux cycles.

## Décision

Le cycle live accepte les reçus de tokens uniquement dans le résultat du
transport exécuté. Un inventaire des appels modèle (`modelCalls`) accompagné
de `modelCallsComplete: true` doit correspondre exactement aux identifiants
des reçus pour déclarer la couverture complète. Sans cet inventaire, la somme
reste une borne inférieure. Pour le transport natif `SIGNAL` en mode
`deliveryOnly`, aucun appel modèle n'est déclenché **dans ce cycle de
transport** ; le compteur local vaut donc zéro. La génération éventuelle du
contenu avant le cycle demeure hors de cette portée.

Chaque résultat conserve la provenance des tokens et un identifiant de
comparaison dérivé de l'intention, des références, des destinataires et du
grounding demandé. Si un cycle témoin est fourni, une différence de tokens par
agent et par phase est calculée seulement quand les deux cycles ont le même
identifiant, sont publiés, satisfont le grounding et déclarent une couverture
complète. Le résultat s'appelle `reported_delta` et fixe toujours
`savingsVerified: false` : un adaptateur déclare son inventaire, sans preuve
indépendante que chaque appel fournisseur y figure. Aucun compteur de tokens
évités n'est alimenté par cette différence.

## Vérification

`node backend/tests/test_communication_native_comparison.js` traverse le
transport natif, observe `signal_blobs` et `signal_deliveries`, puis compare
ce cycle à un cycle témoin avec reçus par agent et par phase. Le test refuse
la comparaison si les reçus sont partiels et refuse un reçu injecté dans les
options. Les tests du cycle live et du checkpoint restent applicables.

## Limites

La clé compare les références déclarées, pas l'équivalence sémantique des
résultats. Le témoin est fourni par l'appelant et les reçus de l'adaptateur
restent déclaratifs. Une économie de bout en bout exige des appels fournisseur
observés indépendamment, le coût de production du contenu et des missions
appariées avec la même qualité de résultat.
