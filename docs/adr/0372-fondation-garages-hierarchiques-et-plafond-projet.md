# ADR 0372 — Fondation des garages hiérarchiques et plafond projet

- **Statut** : Accepté pour la tranche de sûreté ; hiérarchie non implémentée
- **Date** : 2026-10-10
- **Domaine** : Garage Fabric, capacité, sous-orchestration
- **Décideurs** : maintenance GenOS
- **Lié à** : [ADR 0312](0312-garage-fabric-adaptatif.md), [ADR 0353](0353-delegation-worker-bornee-et-admission-runtime.md)

## Contexte

Garage Fabric réserve des places locales et vérifie un plafond partagé par
projet. Avant cette décision, le comptage projet ne retenait que les workers
dont le parent direct avait `execution_mode = 'orchestrator'`. Les enfants
existants d'un `sub_orchestrator`, dont le parent est lui-même un worker,
pouvaient donc occuper une place sans apparaître dans ce plafond.

Le projet de garages hiérarchiques amplifierait cette erreur. Son objectif de
10 000 identités logiques ne démontre ni 10 000 exécutions concurrentes, ni
une admission distribuée, ni une délégation récursive déjà autorisée.

## Décision

La première tranche enlève la condition sur le type du parent direct du
comptage projet. Tous les workers actifs dont le `workspace_id` appartient au
projet et à l'organisation sélectionnés sont comptés, y compris ceux sous un
parent worker. Pour une ancienne identité sans `workspace_id`, le comptage
emploie celui du parent immédiat. Les états de suspension et de réservation
conservatrice restent ceux du Garage existant.

`reserveSlot` effectue le contrôle et la réservation dans la même transaction
SQLite `BEGIN IMMEDIATE`. Deux garages du même projet ne peuvent donc pas
réserver simultanément une dernière place disponible dans ce domaine SQLite.
Un worker encore actif sous un parent terminé reste compté jusqu'à ce que son
arrêt soit établi ; le statut du parent seul ne libère pas une ressource.

Cette décision ne change ni la limite de cinq enfants à vie, ni la profondeur
de délégation un, ni les politiques de stationnement. Le mode `tower` conserve
sa signification actuelle de politique de voie.

## Invariants à conserver avant la récursion

1. Une identité active ou en arrêt non confirmé conserve sa place projet.
2. Une admission compte les descendants et les enfants directs de tous les
   garages du même projet et de la même organisation.
3. Le claim, le contrôle de capacité et la réservation restent atomiques.
4. Un ACK de lancement et une synthèse d'étage ne constituent pas une preuve
   de résultat ni une autorisation de promotion.

## Validation

`backend/tests/test_garage_runtime_store.js` place un sous-orchestrateur et
ses enfants sous un second orchestrateur, dont un enfant ancien sans
`workspace_id`, remplit le projet jusqu'à une place libre, puis lance deux
réservations sur deux connexions SQLite. Une seule réussit ; l'autre reçoit
`PROJECT_WORKER_CAPACITY_FULL`.

## Conséquences

### Positives

- Le plafond projet inclut les descendants ayant un workspace persisté dans
  le périmètre du projet, ou héritant de celui de leur parent immédiat.
- Un parent terminé ne masque pas un descendant encore actif.
- La sonde concurrente couvre le cas qui aurait contourné le plafond.

### Négatives et limites

- Le comptage SQL reste global au projet à chaque réservation ; son coût doit
  être mesuré avant une flotte de grande taille.
- Une chaîne de plusieurs ancêtres sans `workspace_id` n'est pas attribuable
  par ce comptage. Sa normalisation ou un registre de scope durable est requis
  avant de promettre une conservation de capacité pour toutes les identités.
- Aucun budget GPU, RAM, fournisseur ou stockage global n'est réservé ici.
- Aucune distribution multi-hôtes ni délégation récursive n'est ajoutée.

## Alternatives

1. **Garder le filtre sur le parent orchestrateur** : rejeté, car un
   descendant actif peut contourner le plafond partagé.
2. **Déduire la capacité du statut de l'ancêtre** : rejeté, car un parent
   terminé ne prouve pas l'arrêt de ses descendants.
3. **Créer immédiatement un registre distribué de ressources** : différé
   jusqu'à la qualification des garanties locales et des besoins mesurés.
