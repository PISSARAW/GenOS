# ADR 0683 — Délégation asynchrone causale d’Ontogenèse

- **Statut** : Accepté pour la tranche backend bornée
- **Date** : 2026-10-19
- **Domaine** : Ontogenèse, SHEV, délégation, reprise, preuve
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0295c, ADR 0606b, ADR 0609a, ADR 0611b

## Contexte

Un agent de code asynchrone peut recevoir une consigne, travailler dans une branche
et remettre une modification. Cette mécanique ne suffit pas à établir pourquoi la
mission existe, quel mandat l’autorise, quel état reprendre après interruption ni si
le changement intégré améliore effectivement le projet.

Ontogenèse et SHEV possèdent déjà des responsabilités persistantes, des capsules,
des contrôles d’intégration et une continuité d’hôte. Il manquait un contrat étroit
reliant ces mécanismes pour une délégation longue : mission dérivée du mandat,
plan immuable, checkpoints ordonnés, reprise avec fencing et issue épistémique.

## Décision

### 1. La responsabilité précède la mission

`asyncDelegationPlanService` n’accepte pas un ticket libre comme source d’objectif.
Il exige une responsabilité SHEV active au stade `delegated`, reprend sa version,
son autorité, son but et ses critères. Le plan résultant est canonisé et haché.

La capsule doit appartenir à `managedRoot(project)/capsules/` et exister comme
répertoire. La tranche atteste donc le confinement du chemin ; elle ne crée pas à
elle seule le worktree Git ni le processus worker.

### 2. Le plan est une séquence de checkpoints

Le plan comporte quatre étapes : cadrage, exécution isolée, vérification
indépendante, puis mesure de l’effet après intégration. Chaque checkpoint lie une
séquence, l’étape, le fencing courant, un état canonique, ses références de preuve
et, si nécessaire, un artefact.

Une répétition identique est idempotente. Une répétition différente ou un saut de
séquence est refusé.

### 3. La reprise remplace l’ancien exécutant

Une lease nomme l’exécutant courant. Après expiration ou interruption explicite,
un nouveau claim incrémente le fencing. Tout checkpoint ou verdict portant un
ancien fencing est refusé, même si l’ancien processus reprend plus tard.

Ce mécanisme est une **diapause computationnelle** : l’état minimal transmissible
survit à l’arrêt et reprend sous une nouvelle autorité d’exécution. C’est une
analogie biomimétique, pas une propriété biologique du logiciel.

### 4. L’absence de changement est un résultat

Trois issues terminales existent :

- `ACCEPT` exige un vérificateur distinct du producteur, un verdict positif, une
  révision candidate, une révision intégrée et une mesure post-intégration confirmée ;
- `NO_CHANGE` exige une preuve de cadrage et interdit toute mutation déjà
  checkpointée ;
- `HUMAN_REVIEW` exige une raison et une référence de revue.

Un transport réussi, un commit ou une auto-revue ne constitue donc jamais une
preuve suffisante.

## Persistance et vérification

La migration `147-ontogenesis-async-delegation` crée
`ontogenesis_delegations` et `ontogenesis_delegation_checkpoints`. Le test
`backend/tests/test_ontogenesis_async_delegation.js` couvre la dérivation depuis
SHEV, le confinement, l’idempotence, le vol de lease après expiration, le refus du
fencing périmé, la reprise au curseur, la séparation du vérificateur, l’effet
post-intégration, `NO_CHANGE` et `HUMAN_REVIEW`.

## Conséquences

### Positives

- la cause de la mission reste liée à une responsabilité versionnée ;
- une interruption ne permet pas à deux workers de continuer à écrire ;
- le résultat du worker et l’effet projet sont deux observations distinctes ;
- l’abstention et l’escalade humaine sont des issues natives et auditables.

### Négatives

- deux tables et un protocole de lease supplémentaires doivent être exploités ;
- le service ne lance pas encore de worker ni de worktree ;
- la preuve indépendante repose sur des références persistées, sans signature
  cryptographique nouvelle dans cette tranche ;
- aucune disponibilité cloud, exécution multi-région ou supériorité générale sur
  Jules n’est démontrée par ce test local.

## Alternatives

1. **Réutiliser seulement `ontogenesis_operations`** : écarté, car son automate ne
   distingue pas proprement `NO_CHANGE` d’un effet appliqué.
2. **Relancer le prompt complet après interruption** : écarté, car cela perd le
   curseur causal et autorise la répétition d’effets.
3. **Accepter l’auto-vérification du worker** : écarté par séparation des rôles.
4. **Promouvoir après les tests pré-intégration** : écarté, car cela confond qualité
   de la candidate et effet observé dans le projet intégré.
