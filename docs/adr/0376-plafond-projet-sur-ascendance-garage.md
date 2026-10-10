# ADR 0376 — Plafond projet sur l'ascendance Garage

- **Statut** : Accepté pour la tranche locale
- **Date** : 2026-10-10
- **Domaine** : Garage Fabric, capacité projet, sous-orchestration
- **Décideurs** : maintenance GenOS
- **Lié à** : [ADR 0372](0372-fondation-garages-hierarchiques-et-plafond-projet.md), [ADR 0374](0374-registre-durable-des-domaines-garage.md)

## Contexte

Le plafond projet comptait le workspace d'un worker actif ou celui de son
parent immédiat. Un worker sans workspace propre, sous plusieurs managers
également sans workspace, échappait à ce comptage. Le domaine Garage savait
déjà retrouver la racine et le périmètre d'un manager, mais l'admission projet
ne réutilisait pas ce périmètre.

## Décision

Le comptage des workers actifs remonte la chaîne `parent_agent_id` jusqu'au
premier workspace persistant, avec une borne de 32 liens. Il conserve les
états actifs et les phases conservatrices du Garage existant. La transaction
SQLite de réservation garde le contrôle de concurrence.

L'admission prend le projet du domaine Garage enregistré pour le manager,
y compris quand ce manager n'a pas de `workspace_id` propre. Un appel direct
qui présente un worker avec un workspace explicite différent de celui du
domaine est refusé avant réservation, sauf si une délégation Trinity scellée
autorise cette vue privée dans le même périmètre organisation/projet.

La chaîne utilisée pour le comptage n'accorde aucune autorité de délégation.
Les contrats de l'ADR 0353 continuent à refuser un sous-orchestrateur enfant.
La borne du projet reste indépendante du plafond local de chaque domaine.

## Conséquences

### Positives

- Les descendants sans workspace propre consomment le même plafond projet.
- Les managers dont le périmètre est hérité ne contournent plus cette borne.
- Les appels directs ne peuvent plus réserver un worker doté d'un workspace
  explicite discordant sans délégation Trinity scellée.

### Limites

- La recherche reste locale à une base SQLite et bornée à 32 liens.
- Un ancien worker actif dont toute l'ascendance est sans workspace valide
  ne peut pas être affecté à un projet par ce comptage ; l'admission du
  manager doit donc être normalisée avant la délégation récursive.
- Ce changement ne réserve pas de GPU, RAM, fournisseur ou jetons modèle.
- Il ne qualifie pas le débit à 10 000 workers.

## Alternatives

1. Conserver la recherche sur le parent immédiat : rejeté, car le troisième
   niveau pouvait contourner le plafond.
2. Copier un workspace sur chaque descendant : différé ; cela modifierait
   des identités persistées et leurs contrats de provenance.
3. Utiliser le registre Garage comme compteur de workers : rejeté, car les
   états et claims durables restent la source de vérité des places occupées.

## Vérification

`backend/tests/test_garage_runtime_store.js` exerce deux admissions
concurrentes, une chaîne de plusieurs workers sans workspace propre et un
refus de workspace explicite discordant. Le résultat attendu est une seule
réservation supplémentaire avant saturation du projet.
`backend/tests/test_trinity_worker_authority.js` confirme que la délégation
Trinity scellée du même projet reste admissible et que ses altérations sont
refusées avant réservation.
