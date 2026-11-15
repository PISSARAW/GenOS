# ADR 0798 — Pont gouverné du runtime de morphogenèse

- **Statut** : Accepté
- **Date** : 2026-11-14
- **Domaine** : morphogenèse, autorité, transition, reprise
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0407, ADR 0566, ADR 0610

## Contexte

Le runtime historique construisait un plan puis appelait directement le moteur de
transition. Il ne transmettait ni la portée authentifiée, ni l'identité de mission,
ni la persistance AgentGit. En pratique, ses préconditions fermaient toujours le
commit. Le même chemin ignorait le mode `shadow` et aurait pu muter si ces seules
préconditions avaient été ajoutées.

## Décision

Le runtime délègue désormais une demande de commit au pipeline versionné existant.
Le pont transmet le plan exact, l'état collectif, l'acteur, la mission et la portée
authentifiée. Le pipeline conserve l'autorité Rust, le snapshot durable, le journal
d'actions, l'hystérésis, le commit AgentGit et les compensations transactionnelles.

Le mode `shadow` quitte le runtime avant ce pont. Le parcours public post-mission
reste donc non mutant conformément à l'ADR 0407. Un appel de commit sans identité,
tenant, état collectif, preuve de gain et risque, ou adaptateur requis reste refusé
par les gates existants.

## Conséquences

### Positives

- un appelant authentifié peut appliquer une transition depuis le runtime commun ;
- aucun callback local ne remplace la décision Rust ou la persistance versionnée ;
- le mode shadow ne dépend plus de préconditions manquantes pour rester sûr ;
- le test de bout en bout traverse le runtime, Rust, SQLite et AgentGit.

### Négatives

- l'appelant doit fournir un plan de production complet et un état quiescent ;
- les créations et retraits exigent toujours leurs adaptateurs et compensateurs ;
- le parcours CLI post-mission ne gagne aucune autorité implicite.

## Alternatives

- Configurer des services V2 qui répondent localement `APPLY` : rejeté, car ils
  simuleraient le noyau et la gouvernance.
- Fabriquer une identité depuis le JSON CLI : rejeté, car une valeur déclarée par
  l'appelant ne constitue pas une authentification.
- Appeler directement le moteur sans AgentGit : rejeté, car le commit ne serait ni
  versionné ni lié à son snapshot restaurable.
