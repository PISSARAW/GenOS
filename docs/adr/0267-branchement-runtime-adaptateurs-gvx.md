# ADR 0267 — Branchement des outcomes runtime et adaptateurs GVX de confiance

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : AGOW, T0–T3, AgentGit, preuves GVX
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0257, ADR 0259, ADR 0262, ADR 0263

## Contexte

Les services Self-Twin, multi-échelles, recherche de lignées et vérification existaient,
mais les outcomes réels du pipeline ne les appelaient pas. Les adaptateurs AgentGit et les
registres de vérificateurs pouvaient être assemblés par appelant sans référence centrale
à la source de confiance du control plane.

## Décision

Le pipeline d'événements appelle `runtimePredictiveBridgeService` après l'ingress AGOW. Les
événements de perception, action, worker, stratégie et mission alimentent T0–T3 seulement
si des métriques prédites et observées sont fournies. Les références passent par une
validation scope-aware dans `provenance_records`, ou par l'adaptateur de vérification du
contexte; une preuve rejetée ne propage pas l'erreur. Un feedback Self-Twin ne s'exécute que
si l'événement nomme une prédiction déjà enregistrée.

`gvxAgentGitAdapter` construit des branches via `AgentGit.speciation`, vérifie le parent
attendu et exige des callbacks distincts pour l'application de candidat et l'évaluation.
Il n'effectue aucun merge ni promotion.

`gvxVerifierRegistry.fromTrustedRegistry` accepte uniquement des bindings dont l'identité
est déjà inscrite dans `verifierTrustRegistry`; la nursery et le transfert relisent les
octets, recalculent le hash et appellent ce binding. Le factory générique de registre n'est
pas exporté.

Le monitoring longitudinal calcule désormais des intervalles t de Student à 95 % sur les
deltas métriques; sous deux observations, il retourne des bornes nulles.

## Conséquences

- Les événements sans mesures explicites ne produisent pas de pseudo-prédiction.
- T4–T6 ne sont pas encore alimentés automatiquement par leurs producteurs.
- L'isolation, la lecture d'artefacts et les fonctions verifier/apply/evaluate restent des
  capacités explicites de l'hôte et doivent être construites côté control plane.
- Le wiring ne constitue pas une campagne de validation des nouveaux modèles.

## Alternatives

- Propager les hashes et noms de vérificateurs bruts fournis par un worker : rejeté, car
  ils n'authentifient ni le contenu ni l'autorité qui l'a vérifié.
- Exécuter une branche par mutation directement sur `main` : rejeté, car une recherche de
  lignées ne possède pas l'autorité de promotion.
