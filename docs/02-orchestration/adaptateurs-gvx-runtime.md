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

Pour les artefacts d'expérience ou de transfert, enregistrer les implémentations
autorisées au démarrage avec `gvxVerifierControlPlaneRegistry` avant la première
résolution, qui scelle ensuite le registre, puis construire le
registre par `gvxVerifierRegistry.fromTrustedRegistry` avec leurs seuls identifiants
du `verifierTrustRegistry`. Un binding d'appel ne peut plus injecter la fonction de
vérification ou les requirements. Sans implémentation enregistrée, la nurserie échoue
fermée pour les exigences sémantiques. Le vérificateur intégré `artifact-integrity-v1`
ne certifie que l'égalité entre les octets lus et le SHA-256 déclaré. Fournir aussi
un `artifactReader` qui lit le contenu autorisé; GVX recalcule le SHA-256 avant
d'accepter ce reçu d'intégrité.

Le cycle standard peut utiliser le service externe Ed25519 et l’évaluateur de profils opérateur épinglés. Il fournit application et rollback AGOW, suivi indépendant et reprise. Les autres domaines gardent leurs adaptateurs métier explicites. Voir le [profil standard](profil-execution-gvx.md) et le [service externe](../05-securite-gouvernance/service-verificateur-gvx.md).

Voir [ADR 0267](../adr/0267-branchement-runtime-adaptateurs-gvx.md).
