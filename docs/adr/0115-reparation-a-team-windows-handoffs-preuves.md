---
title: Réparation A-Team Windows, handoffs créatifs et preuves intégrales
date: 2026-09-25
status: accepted
authors: GenOS
decision-id: 0115
---

# ADR 0115 : Réparation A-Team Windows, handoffs créatifs et preuves intégrales

## Contexte

Une mission A-Team « chanson style Eminem » (`dispatch_team` avec `creative_writing`, `editing`, `critique`) a été acceptée (`TEAM_READY`, `teamRunId: ateam_affd9cbbda603eff3afb0a4065211aa2`) mais aucun worker détaché n'a démarré : 0 agent fils en base. Cinq invalidations ont été établies par replay des traces réelles (`traj_c7a1ed42-1584-4241-a902-605714a329d1`, `snp-muged3vr-d50f9e86b2`, replay Rust `VERIFIED`).

1. Sur Windows, `spawnDetachedRunner` enveloppait la commande dans `cmd.exe /c` avec le JSON concaténé : le payload était découpé sur les espaces et le child mourait sur `Invalid JSON`. Le transport réussi n'est pas une preuve de décision valide.
2. Les domaines créatifs n'avaient aucune dépendance (`handoffs: 0`, tout en stage 0) : `isObserverRole` ne couvre pas `editor`/`critic` et `prepareDispatch` ne transférait jamais `request.dependencies` vers `compose()`.
3. Le quality gate exposait `missionCoverage`/`staffedCoverage`/`runtimeToolCoverage`/`verifiedCoverage` sans les noms normatifs MCC/TSC/RCA/VEC de la fiche A-Team.
4. Le rapport d'évidence du worker local ne conservait que le claim parsé (`RATPACHE...`), pas le texte LLM intégral.
5. Le replay restait ambigu : `execution_replayed: true` signifie trace vérifiée, jamais ré-exécution des modèles.

## Décision

- Transport détaché : nouveau `backend/bin/detachedSpawn.cjs` (`toSpawnArgs`, `loadArgv`, `payloadFile`, seuil 15 000 caractères). `spawnDetachedRunner` n'utilise plus `cmd.exe` sur win32 (spawn direct + `windowsHide`) et bascule sur `--payload-file` au-delà du seuil. `genos-orchestrate.cjs` accepte `--payload-file`. `topologyHandlers.cjs` utilisait déjà `shell: false` (hors périmètre de ce commit).
- Handoffs : `prepareDispatch` transfère `request.dependencies || request.depends_on || request.dependsOn` vers `composeTeam`. `aTeamService.js` applique des défauts créatifs (`editing` après `creative_writing`, `critique` après les deux) ; les dépendances explicites priment. Le scheduler existant (`aTeamStageScheduler.js`) dérive déjà les étages par profondeur topologique et refuse cycles et dépendances inconnues.
- Quality gate : `coverageDimensions` conserve les noms existants et ajoute l'alias canonique (`MCC`, `TSC`, `RCA`, `VEC`) ; un ratio `null` ou nul bloque toujours la promotion.
- Preuves : `attachFullText` conserve `result.text` intégral dans `evidenceReport.fullText`, donc dans le payload `EVIDENCE_REPORT` et la trajectoire.
- Replay : aucune ré-exécution silencieuse. `INCONCLUSIVE_PENDING_EXECUTION` + `validationRequired: true` restent obligatoires côté primitives ; le runbook rappelle que le replay Rust vérifie la chaîne de hash, pas les appels modèle.

## Conséquences

### Positives

- `dispatch_team` démarre réellement ses workers sur Windows, avec un DAG créatif 0/1/2 et des handoffs typés.
- Les quatre couvertures sont lisibles sous leurs noms normatifs sans casser les tests existants.
- Le texte créatif intégral est traçable par `payload_hash` dans `provenance_records`.

### Négatives

- Les fichiers payload temporaires reposent sur `os.tmpdir()` et un unlink best-effort côté child.
- Le claim du dossier reste monolithique (voir ADR 0114) : la granularité n'est pas traitée ici.

## Alternatives

- Échapper le JSON pour `cmd.exe` : rejeté, fragile aux chemins avec espaces et aux guillemets imbriqués.
- Étendre `isObserverRole` à `editor`/`critic` : rejeté, effet de bord sur les équipes techniques ; les défauts explicites par domaine sont plus étroits.
- Assouplir la gate ou la barrière d'évidence : rejeté, cela fakerait le succès contre la règle centrale du runtime.
