---
title: Émission du dossier workerArtifact par les runtimes supervisés et timeout de barrière proportionné
date: 2026-09-25
status: accepted
authors: GenOS
decision-id: 0114
---

# ADR 0114 : Émission du dossier workerArtifact par les runtimes supervisés et timeout de barrière proportionné

## Contexte

L'ADR 0064 exige un `workerArtifact` typé, avec champs sémantiques et provenance, avant validation d'un dossier worker. Or aucune mission passant par `GENOS_AGENT_EXECUTOR=local` ne pouvait franchir `finishSatisfiedBarrier` : toute mission échouait avec `INVALID_WORKER_ARTIFACT`, quel que soit le modèle local (llama3.1, qwen2.5-coder 7b/32b vérifiés). Une reproduction minimale sans LLM rejoue l'échec à l'identique.

Deux défauts cumulés, tous deux côté producteur/plateforme, aucun côté modèle :

1. Les producteurs d'évidence ne construisaient jamais `workerArtifact`. Deux producteurs concernés : le chemin supervisé (`local-codex-runtime.cjs`, `solar-direct.cjs`, `solar-direct-runtime-v2.cjs`, fonction `emitCompletion`) et, surtout, le chemin in-process réellement emprunté par ces missions (`workerEvidenceBarrierLocal.js`, `runEvidenceStage` : `isInProcessWorker` est vrai dès que `localModel` est routé avec `localRuntime`, donc le binaire `local-codex-runtime.cjs` n'était même pas exécuté). Le prompt worker ne contenait pas non plus l'instruction `artifactInstruction`. Le contrat était donc insatisfiable par construction.
2. Le timeout de la barrière d'évidence était plafonné à 8 secondes (`Math.min(8000, timeoutMs * 0.35)` dans `workerEvidenceBarrier.js`), insuffisant pour un aller-retour spawn + inférence LLM, ce qui transformait les modèles lents en `WORKER_BARRIER_NO_EVIDENCE` en mode strict.

## Décision

- Ajouter `buildDossierArtifact(reply, provenance)` à `workerArtifactContract.js` : construit en code (déterministe) un artefact `dossier` dont le claim porte la réponse LLM et dont la provenance porte le runtime, le modèle et le workspace. La gate n'est pas affaiblie : une réponse vide ou sans provenance échoue toujours la validation.
- Appeler ce builder dans `emitCompletion` des trois runtimes supervisés concernés, et dans `runEvidenceStage` de `workerEvidenceBarrierLocal.js` (`attachDossierArtifact`, à partir du texte brut du modèle + modèle/workspace routés), sans changer le reste des rapports.
- Remplacer le plafond de 8 s par `resolveBarrierTimeout` : 35 % du timeout mission, plancher 120 s, plafond 600 s. Le mode strict est conservé tel quel.
- Suivi hors périmètre : le runtime Codex (`agent-runtime-close.cjs`, parsing de sortie modèle) et l'injection de `evidenceRule` dans `buildWorkerPrompt` restent à traiter séparément.

## Conséquences

### Positives

- Les missions à workers locaux peuvent de nouveau franchir la barrière d'évidence sans contourner aucune gate.
- Le timeout de barrière suit la taille de la mission au lieu d'une constante incompatible avec l'inférence.

### Négatives

- Le claim du dossier reste monolithique (réponse entière) : la granularité des claims dépendra du suivi `evidenceRule` dans le prompt.
- Toute divergence avec le registre Rust (`genos-worker`) nécessitera un test de parité, comme pour l'ADR 0064.

## Alternatives

- Assouplir `validateWorkerArtifact` (accepter les rapports sans artefact) : rejeté, cela aurait faké le succès contre la règle centrale du runtime.
- Demander au modèle d'émettre l'enveloppe en JSON : rejeté, fragile au parsing et redondant avec une construction en code déterministe.
