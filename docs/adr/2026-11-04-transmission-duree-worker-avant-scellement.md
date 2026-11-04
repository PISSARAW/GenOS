# Transmettre la durée du worker avant son scellement

- Statut : implémenté, régression exécutable.
- Date : 2026-11-04.

## Contexte

La relance native du Dernier Sas du 4 novembre a demandé deux heures au parent
et une heure à GQEL. L'identité persistée du worker a pourtant conservé le
défaut de trente minutes : la création du contrat ne transmettait que les
tokens du budget. Le constructeur CLI direct présentait la même perte.

Le binding GVX de `strategy_run_1793812669380_5bc55edd` contient ainsi
`latencyMs: 1800000` et `tokens: 160000`. Après le retour tronqué de S3, le
checkpoint conserve `repairEligible: true`. L'événement suivant arrête
l'agent pour `EXECUTION_AUTHORITY_EXPIRED` avant la réparation. Cela ne prouve
pas un échec du mécanisme de réparation de scène : l'autorité était expirée.

La politique de ressources connaît déjà `timeoutMs` et
`executionBudget.latencyMs`. Cependant la reconstruction canonique du contrat
ne conservait pas cette allocation explicite ; transmettre simplement la durée
aurait conduit à refuser les ressources supérieures au défaut de trente minutes.

## Décision

La création de l'identité topologique et le constructeur CLI direct transmettent
le budget complet et le `timeoutMs` existants au constructeur du contrat.
La durée demandée est conservée dans `workerContract.mission.timeoutMs` avant
le scellement. Elle est finie, entière, strictement positive et bornée à vingt-
quatre heures, cohérente avec la borne du superviseur de worker existant.
La reconstruction canonique relit cette allocation. Retirer l'allocation d'un
contrat étendu ou augmenter ses ressources au-delà d'elle est refusé.

Aucun nouveau paramètre de mission ni de membre n'est introduit. Une mission
fraîche peut fournir `timeoutMs: 7200000` et
`execution_budget: { tokens: 1200000, costUsd: 1, latencyMs: 7200000 }` au
parent. Les allocations de tokens par membre et le plafond qualité de la
politique restent applicables. L'enveloppe finale est toujours construite par
les services natifs, sous les contraintes de l'admission clinique et de
l'autorité du parent ; le transport ne constitue pas sa preuve de validité.

Les autorités actives ou expirées ne sont jamais prolongées. Les contrôles
d'expiration, d'annulation et de promotion restent obligatoires. La correction
du diagnostic masqué par la clôture GQWF est un point distinct.

## Conséquences et vérification

Le plafond qualité de 160 000 tokens de l'ADR 0782 reste inchangé. Un contrat
GQEL à 500 000 tokens est un plafond interne plus haut, il n'autorise pas le
worker à dépasser son propre plafond natif de 160 000. Les consommations des
lecteurs et des réparations participent toujours à ce même garde cumulatif.

`backend/tests/test_gqel_worker_budget.cjs` vérifie le passage par le CLI et
l'identité persistée, la reconstruction canonique, les refus des ressources
augmentées ou de l'allocation supprimée, les bornes de durée et le budget
natif effectif de deux heures avec le plafond de tokens préservé. Les tests
n'allongent aucune autorité existante et ne certifient aucune qualité artistique.
La prochaine mission devra fournir son propre binding et son enveloppe signée.

## Alternatives

- Modifier l'enveloppe expirée aurait contourné l'autorité scellée.
- Relever le plafond global de tokens aurait modifié une politique distincte.
- Ajouter un nouveau réglage de durée par membre n'était pas nécessaire pour
  transmettre les paramètres déjà demandés par cette mission.
