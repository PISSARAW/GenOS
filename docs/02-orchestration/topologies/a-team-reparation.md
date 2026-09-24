# Exécution des réparations A-Team

Ce document décrit l'exécution d'un plan de réparation calculé par l'A-Team. La
planification choisit une action ; ce service applique une action déjà décidée sans
confondre démarrage du worker et validation de ses preuves.

## Entrée et préconditions

`executeRepair` reçoit le `teamRunId`, un `repairId` stable pour la demande, le
`repairPlan`, le budget résiduel et les slots disponibles. Le run doit être à l'état
`RUNNING` et aucun stage runner ne doit détenir un bail valide. Les actions permises sont
`REASSIGN`, `RECRUIT` et `REPLACE`.

`REASSIGN` cible un membre présent à l'état `ACTIVE` et transfère la
responsabilité déclarée. `RECRUIT` et `REPLACE` vérifient le coût et la capacité, puis
exigent deux adaptateurs fournis par le dispatch : `reserveCandidate` et `launchWorker`.
Le worker n'est inscrit dans les membres de l'équipe qu'après confirmation d'un
identifiant et d'un état `ACTIVE` ou `RUNNING`. Une réservation refusée, un lancement
échoué ou un worker inactif n'ajoute aucun membre ; si disponible, `releaseCandidate`
libère la réservation.

## États et reprise

L'exécution fait passer le run de `RUNNING` à `REPAIRING` par transition avec révision
attendue (CAS). Elle inscrit un reçu `EXECUTING` dans
`execution.repairReceipts`, puis termine par `COMPLETED` et retourne le run à `RUNNING`,
ou inscrit `BLOCKED` et bloque le run si l'action échoue. Le reçu contient l'identifiant
de réparation, l'action, l'état, les dates et l'identifiant du worker quand il existe.

Un appel répété avec le même `repairId` retourne le reçu existant sans relancer les
adaptateurs. Un conflit de révision n'est pas rejoué automatiquement : l'appelant doit
recharger le run et décider si un nouvel identifiant de réparation est justifié.

## Limites du lot

`executeRepair` seul s'arrête après l'action. Le flux de production doit passer par
`coordinateRepair` pour recompiler le WorkGraph, invalider les preuves et reprendre la
branche. Les transitions Morphogenesis restent des propositions à faire valider par leur
moteur dédié. Le dispatch injecté conserve les contrôles de lease, capacité, autorité et
politique d'exécution du runtime.

## Orchestration complète

`coordinateRepair` maintient le run à `REPAIRING` après le lancement et la confirmation
du worker. Il recompile le WorkGraph sous le même identifiant, compare l'ancien et le
nouveau graphe, puis invalide le nœud modifié et ses descendants. Les états des nœuds
hors branche touchée sont conservés ; les nœuds touchés redeviennent `READY` lorsque
leurs dépendances sont terminées, sinon `BLOCKED`.

L'appelant doit fournir `invalidateEvidence` et `resumeAffectedBranch`. Le premier doit
confirmer l'invalidation avant que le second reçoive les seuls identifiants des nœuds
touchés et puisse redémarrer la branche. Le run ne revient à `RUNNING` qu'après les deux
confirmations. Si recompilation, invalidation ou reprise échoue, le reçu est marqué
`BLOCKED` et le run reste bloqué avec le code d'erreur ; les adaptateurs doivent accepter
le même `repairId` pour reprendre sans dupliquer leurs effets.
