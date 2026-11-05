# Conserver les contrats des workers et les refus A-Team typés

- Statut : accepté.
- Date : 2026-11-05.

## Constat

Le lancement d'un worker topologique perdait le booléen explicite
`localCodeWorker`. L'environnement pouvait encore autoriser la génération de
code, tandis que la boucle de réparation ne reconnaissait plus ce worker.
Une proposition échouant aux tests s'arrêtait donc immédiatement.

Les limites `executionPolicy.inferenceLimits` étaient également perdues par le
payload de lancement et par la reconstruction de la politique du worker direct.
Réactiver la réparation sans conserver ces limites aurait rétabli le plafond
par défaut, plus large que le contrat explicite du parent.

Un refus terminal A-Team portait son état et son code en mémoire, mais le CLI
et le pont MCP ne conservaient qu'une stack de processus. Cela brouillait la
distinction entre refus de complétion et panne d'infrastructure.

## Décision

Le payload transmet le booléen de code explicite et les limites d'inférence
validées. La reconstruction de politique conserve ces limites. Une valeur non
booléenne n'active pas la réparation ; une limite invalide est refusée avant
l'exécution. Les tentatives continuent à débiter le budget restant et à respecter
les contrôles d'absence de progrès. Ces limites concernent chaque worker ; un
plafond global de propositions doit conserver son propre contrôleur partagé.

Un JSON malformé dans l'évaluation après tests reste refusé, avec le code
`WORKER_OUTPUT_SCHEMA_VIOLATION` et des diagnostics plutôt qu'une `SyntaxError`
générique. Les tokens consommés restent comptabilisés.

Les refus terminaux `BLOCKED` et `FAILED` utilisent l'enveloppe
`genos.a-team-dispatch-result/v1`. Ils conservent `success: false`,
`accepted: false`, un code d'erreur et le résultat terminal. Le processus sort
toujours avec un code non nul et le serveur MCP Node retourne toujours `isError: true`.
Le résultat publié est une projection bornée des codes de raison et des checks
de clôture. Les communications, rapports, preuves et entrées de clôture bruts
restent internes ; une sentinelle de fixture vérifie leur exclusion.
Le pont ne reconnaît comme refus typé que cette enveloppe stricte ; les sorties
malformées ou portant une prétention de succès restent des erreurs de processus.

## Conséquences et vérification

Les contrôles exécutables vérifient la réparation autorisée et l'arrêt à trois
tentatives, les booléens stricts, les limites invalides, le budget décrémenté,
le rejet des JSON malformés et un vrai échange MCP stdio avec un subprocess de
fixture sortant en erreur. Cette fixture valide le transport du refus ; elle
ne constitue pas une mission native qualifiée.

Les gates de tests, de critères et de handoffs restent inchangées. Les leases
de replay ne sont pas élargies. La campagne Bug Vicieux déjà scellée sur D:
conserve son runtime antérieur : ces corrections ne réécrivent aucun essai et
ne changent pas rétrospectivement ses résultats.
Elles ne résolvent pas la suffisance des tests visibles : une évaluation de
critère positive n'est pas un oracle indépendant de correction générale.
