# ADR 0761 — Séparer les invocations mesurées de la réponse terminale

## Contexte

Les runs 03 et 12 de la campagne e4c4 contenaient des appels Qwen mesurés dans
leur ledger. Leur dernier refus venait du préflight ou de la préparation d'une
revue ; il ne possédait donc pas de fournisseur terminal. L'assesseur confondait
ce fait avec l'absence d'invocation Qwen dans le run.

## Décision

L'inspection conserve les tentatives du ledger. La mesure filtre exactement le
worker et le run reliés au reçu CLI et à leur mission. Les appels fournisseur
doivent posséder une mesure réelle, des identités uniques et un total concordant
avec les métriques du run et l'usage terminal. Les autres workers et anciens
runs ne peuvent pas fournir cette preuve.

`modelInvocationMeasured` indique une invocation ainsi mesurée ;
`terminalResponseMeasured` indique en plus l'attribution de la réponse terminale.
Un refus sans nouvel appel ne perd plus les consommations antérieures. Un rapport
`AGENT_COMPLETED` conserve l'exigence stricte d'un producteur correspondant au
modèle demandé : une ancienne invocation ne qualifie pas une sortie non attribuée.

## Conséquences

Les erreurs d'exécution peuvent être évaluées comme des échecs observables plutôt
que comme une absence de mesure. Les données partielles, estimées, contradictoires
ou étrangères restent non mesurées. Les anciennes inspections sans ledger
conservent leur contrôle terminal conservateur et ne sont pas réécrites.
Cette mesure ne crée ni oracle sémantique, ni preuve clinique, ni promotion GenOS.

## Alternatives

Attribuer un fournisseur au dernier refus aurait faussement décrit son origine.
Choisir un ancien run réussi aurait masqué l'échec du run réellement demandé.
Le ledger permet de préserver les deux observations sans ces substitutions.

Validation : `node backend/tests/test_qwen_ledger_measurement.cjs`, tests de
provenance existants et réinspection en lecture seule des bases e4c4 sur D:.
