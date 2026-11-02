# OMEGA dans l'exécution réelle des missions

Le raccord `missionProtocols/omega.js` est actif par défaut aux deux frontières
du routeur cognitif lorsqu'un run possède une identité de mission scellée :

- `modelRouter.executeInferenceThroughOmega` pour le parcours ordinaire
  `READ(prompt) → SELECT → INFER` ;
- `cognitiveOmegaRouterExecution.executeNativeGraph` pour un graphe natif
  explicitement fourni au routeur.

Les appels sans run de mission gardent leur comportement existant. Une mission
explicitement identifiée sans binding ne reçoit pas un succès de substitution.
L'adaptateur exige l'acteur du run, refuse un autre tenant et relit l'enveloppe,
le bail et les générations natifs via `missionProtocols/context` avant les
actions. Un identifiant de run n'est pas, à lui seul, une autorisation.

## Admission et exécution

Le graphe est converti en vrai programme `genos.gcir.omega/v1`, validé par son
contrat et son codec MessagePack. `OmegaAdmission` traite successivement
`DESCRIBE_RUNTIME`, `SUBMIT_PROGRAM` et `ACCEPT_PLAN`. Les capacités dérivent des
handlers effectivement installés dans le routeur, pas d'une liste de pouvoirs
déclarée dans le JSON de mission.

Le plan lie les obligations, le graphe complet, les objets, l'instantané natif
du workspace, les implémentations installées, le runtime Node, la politique et
les générations. Le contexte est relu lors des gardes d'exécution ; une source
modifiée exige une nouvelle admission. Les handlers READ, SELECT et CHECK
installés doivent respecter leur contrat de lecture seule. Une fonction
arbitraire qui change son environnement hors de la frontière autoritative ne
devient pas transactionnelle par sa seule inscription au registre.

`OmegaExecution` utilise son vrai journal durable. Les phases, résultats,
preuves et reçus sont conservés dans des SQLite distincts sous le répertoire
de run calculé par le backend. Les noms de fichiers sont des localisateurs
courts compatibles Windows ; les identités et fingerprints complets restent
vérifiés dans les messages et registres.

L'identité d'un appel vient de `routeActionId`. Si le routeur n'en possède pas,
l'adaptateur crée un nouvel UUID pour cet appel et le transmet au registre
natif des tentatives modèle. Deux appels distincts avec un prompt identique
ne sont pas assimilés. Une reprise explicite doit conserver cet identifiant ;
le prompt seul ne permet pas d'inférer qu'une requête est un rejeu.

L'inférence appelle réellement `modelRouteRunner`. Le scope partagé, les
réservations tokens/coûts, les tentatives et les reçus fournisseur natifs
continuent à comptabiliser les consommations. L'adaptateur utilise le scope
parent persisté lorsqu'il existe, sinon les plafonds du run scellé. Il ne
remplace pas un usage inconnu par zéro et ne relance pas une inférence dont
l'issue durable reste inconnue.

## Effet natif borné : `mission.result`

Le seul émetteur installé par ce raccord est `EMIT mission.result`. Il écrit
le candidat JSON dans `OmegaEffectResource`, avec une autorité de ressource,
un quota installé d'une opération par run, une tarification fixe de 1 et un
contrôle atomique de l'autorité au point d'écriture SQLite.

L'émission doit dépendre directement de CHECK réels. Le raccord retrouve les
reçus CHECK effectivement committés dans le journal, compare le digest du
candidat, relance les vérificateurs installés sur ce même candidat et vérifie
le plan, la base, l'environnement, la politique et les générations.

`EffectGate` écrit son intention avant dispatch. Le receiver écrit la valeur,
la déduplication et son reçu dans la même transaction. Un crash après l'effet
et avant l'accusé laisse une issue inconnue ; la reprise interroge le receiver,
retrouve le reçu exact puis reprend le journal sans réémettre l'effet.

Il s'agit d'une valeur durable de résultat de mission. Ce reçu n'autorise ni
déploiement, ni publication externe, ni mutation arbitraire du workspace.
`CALL` et les autres références EMIT sont refusés tant qu'un endpoint durable
approprié n'est pas installé. Une fonction legacy n'est pas déclarée
idempotente simplement parce qu'elle est enveloppée par le protocole. Une
interdiction explicite `cognitiveAllowEmit: false` reste contraignante.

## Vérifications exécutables

`test_mission_protocols_omega.js` traverse le vrai point d'insertion du routeur,
l'admission, le journal et la ressource. Il vérifie l'écriture réelle, le rejeu,
le prédicat faux sans effet, les acteurs échangés et une autorité remplacée.

`test_mission_protocols_omega_recovery.js` tue un vrai processus après le commit
de la ressource et avant le reçu local. Le processus suivant réconcilie puis
termine avec une seule écriture et un seul débit.

`test_mission_protocols_omega_inference.js` utilise un endpoint HTTP de test
local, des reçus fournisseur typés et les vraies réservations natives. Cet
endpoint est une fixture de transport, pas un modèle évalué ni une
facturation externe. Le test distingue deux appels identiques de deux rejeux
du même appel et vérifie leur consommation persistée.
