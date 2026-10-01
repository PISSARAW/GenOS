# Adaptateurs GVX runtime

Le pipeline d'événements appelle `runtimePredictiveBridgeService` après l'ingress AGOW.
Les métriques doivent être explicitement fournies sous `predictedMetrics` et `metrics`;
les références de preuve sont ensuite vérifiées par leur hash dans `provenance_records`
et le scope de mission. Les références non trouvées sont ignorées. Une intégration peut
fournir `ctx.verifyEvidenceRefs` si elle vérifie les mêmes invariants à partir de reçus
signés. Le feedback Self-Twin doit citer un `predictionId` déjà présent dans le ledger.

`gvxAgentGitAdapter.createLineageAdapters` fournit les callbacks
`createCandidateBranch` et `evaluate` consommés par `gvxLineageSearch`. L'hôte fournit
`resolveParent`, `requestFor`, `applyCandidate` et `evaluateBranch`; le parent AgentGit doit
correspondre au hash du candidat. Les résultats demeurent des branches candidates et
n'atteignent jamais `main` automatiquement.

Pour les artefacts d'expérience ou de transfert, construire le registre de vérificateurs
par `gvxVerifierRegistry.fromTrustedRegistry` depuis les identifiants du
`verifierTrustRegistry`. Fournir aussi un `artifactReader` qui lit le contenu autorisé;
GVX recalcule le SHA-256 avant d'accepter le reçu.

Voir [ADR 0267](../adr/0267-branchement-runtime-adaptateurs-gvx.md).
