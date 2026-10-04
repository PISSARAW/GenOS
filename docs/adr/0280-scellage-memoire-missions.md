# ADR 0280 — Scellage mémoire des missions (scope mission/chambre)

- **Statut** : Accepté
- **Date** : 2026-10-03
- **Domaine** : Mémoire agent, Trinity, isolation, preuves
- **Décideurs** : GenOS
- **Lié à** : ADR 0279, campagne Trinity réelle du 03/10/2026

## Contexte

La campagne réelle a observé deux contaminations : un monde N1 a répondu à la
mission N3, un monde N6 a cité la mission N5 comme preuve. Mécanisme :

1. `agentMemoryStore.memoryContent` stocke le texte intégral de la tâche
   (`Task: <mission complète>`) dans `genome_decisions`, partagée dans le
   tenant sans filtre `ownerId` (`vectorMemoryCorpus.js`, ligne documentée).
2. `loadMemoryBlock` (runtimes locaux) ne transmet aucun scope : ni
   organisation/projet, ni mission/chambre. Les clauses tenant prévues par le
   code ne sont donc jamais alimentées.
3. La recherche par similarité de tâche rapproche les missions Trinity entre
   elles (même gabarit textuel) et injecte le dossier d'une autre mission
   comme « souvenir ».
4. Aucune notion de mission/chambre n'existe dans la couche mémoire.

## Décision

1. Plomberie du scope : le handler Trinity attache
   `missionScope: { missionId, chamber }` au membre ; le payload worker le
   propage ; les runtimes le transmettent aux lectures (`formatCognitiveMemoryPrompt`,
   primitives `search_memory`/`search_failures`) et à l'écriture
   (`compileExecutionMemory`).
2. Marquage à l'écriture : `memoryContent` ajoute
   `[MISSION_SCOPE id=<...> chamber=<...>]`, encodé dans le contenu (même
   précédent que le TTL des unverified, sans migration de schéma).
3. Filtre dur à la lecture (`agentMemoryScope.keepForScope`), actif
   uniquement quand un scope est déclaré :
   - enregistrement tagué d'une autre mission → exclu ;
   - enregistrement non tagué dont la `Task:` intégrée est longue (≥ 120
     caractères) et différente de la tâche courante → exclu (dossier d'une
     autre mission) ;
   - le reste (courtes connaissances génériques, même mission) est conservé.
4. Sans scope déclaré, comportement strictement inchangé.

## Conséquences

### Positives

- Les chambres Trinity deviennent informationnellement scellées côté mémoire,
  pas seulement côté topologie.
- Le marquage rend les futures fuites attribuables ( requêtable en SQL `LIKE`).

### Limites assumées

- `ownerId` transmis = nom d'affichage de l'agent, pas son id : le filtre
  `author_id` des trajectoires ne matche donc jamais pour les workers.
  Constaté, non corrigé ici (touche l'identité pour tous les tenants).
- La primitive `compile_memory` du pipeline stocke des fragments courts sans
  tag ; seuls les contenus `compileExecutionMemory` (vecteur de fuite
  observé) sont tagués. Suivi requis.
- Les vésicules synaptiques ne sont pas scopées. Suivi requis.

## Addendum 2026-10-03 — règle par défaut sans plomberie

La vérification live a montré que `missionScope` n'atteint pas le runtime :
`prepareWorker` / `startWorkerMission` reconstruisent le membre sans les
champs ajoutés, et l'enveloppe protobuf (`AgentMission`, `agent.proto`) n'a
ni `variant_index` ni `mission_scope_json` — l'encodage les élimine. Le même
trou affecte `variantIndex` / `localModel` du point 2 (seul le texte du prompt
passe de bout en bout).

En conséquence, la règle dossier-étranger s'applique aussi **sans scope
déclaré** : tâche intégrée longue et différente de la tâche courante (elle
aussi longue) → exclu ; enregistrement tagué lu sans scope → exclu (un tag
n'existe que par écriture scopée, le lecteur est donc étranger). Tâches
courtes : comportement inchangé. Le scope déclaré ajoute la précision
d'attribution par `missionId` et `chamber`.

Transport de bout en bout des champs (`prepareWorker`, `startWorkerMission`,
`buildMissionEnvelope`, `agent.proto`) : suivi requis, commun aux points 2
et 3.

## Addendum 2026-10-04 — lecture ciblée du contexte de mission

Le point d'injection `attachMissionMemoryContext` transmet maintenant le
`missionScope` reçu au filtre de mémoire. Une entrée taguée pour une chambre
différente de la chambre demandée est refusée, même si l'identifiant de mission
est identique ; une lecture sans chambre n'ouvre pas une entrée privée de chambre.
Cette correction ne prouve pas que tous les lanceurs transportent un scope
authentifié, ni que les vésicules et mémoires non taguées sont privées.

## Preuves exigées

- Test `backend/tests/test_trinity_memory_sealing.js` : dossier étranger
  long exclu (avec et sans scope), même mission conservée, générique court
  conservé, tag étranger exclu, tâche courte en passthrough, marquage
  aller-retour.
