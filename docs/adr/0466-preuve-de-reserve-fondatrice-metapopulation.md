# ADR 0466 — Preuve de réserve fondatrice Métapopulation

## Contexte

Le variant `rescue_network` inscrit `FOUNDER_RESERVE_STAGED` et ajoute les
fondateurs à `regionalMemory.founderReserve`. Le gate `VERIFY` contrôlait le
reçu et l'événement, mais pouvait accepter un cycle après disparition de la
réserve persistée. Un journal d'intention ne suffit pas à prouver la capacité
de recolonisation encore disponible.

## Décision

La vérification de `STAGE_FOUNDER_RESERVE` exige aussi la présence de chaque
fondateur planifié dans la réserve de la session. Elle compare le contenu des
entrées, avec leur multiplicité, afin qu'une entrée ne puisse prouver deux
stages. Si la mémoire régionale est absente, mal typée ou incomplète, le cycle
est refusé. L'exécution et l'écriture transactionnelle de l'événement restent
inchangées.

## Preuve

`test_metapopulation_durable_execution.js` exécute le staging réel, constate
que `VERIFY` passe, efface ensuite `regionalMemory` et exige que `VERIFY`
échoue. Avant correction, cette dernière assertion était rouge (`true !==
false`). Après correction, la suite durable passe.

## Limites

La présence persistée ne prouve ni la viabilité biologique des lignées, ni la
réussite d'une colonisation future. Le contrôle utilise l'état SQLite observé
pendant `VERIFY` ; une mutation ultérieure doit être évaluée par un nouveau
cycle ou par le préflight du snapshot.
