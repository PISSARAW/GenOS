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

## Adaptateurs du cycle standard

Sans module personnalisé, `gvxLifecycleAdapterProvider` charge `gvxStandardLifecycleAdapters`. Il exige `GENOS_GVX_RUNTIME_PROFILE_ID` et la configuration du service externe Ed25519. Le profil signé est lié au scope et à l’agent ; il fournit politiques parent/candidate, contrôles, prédictions, critères et fenêtres de suivi. L’évaluateur fixe reste dans le processus de vérification.

Le cycle applique la politique AGOW sous autorisation externe et comparaison atomique, exécute le suivi indépendant, puis demande le crédit signé après maturation. Le journal conserve chaque étape ; les leases SQLite protègent les opérations concurrentes. Une retransmission reprend les étapes manquantes, et un profil modifié pour un cycle existant est rejeté.

Un module personnalisé peut exporter `createAdapters({ db, signal })` via `GENOS_GVX_LIFECYCLE_ADAPTER_MODULE` et son empreinte `GENOS_GVX_LIFECYCLE_ADAPTER_SHA256`. Il doit fournir le suivi et les vérificateurs distants exigés par le contrôleur. Les autres domaines gardent leurs adaptateurs métier explicites.

Voir le [profil standard](profil-execution-gvx.md), le [service externe](../05-securite-gouvernance/service-verificateur-gvx.md) et la [validation fonctionnelle](../06-qualite-preuves/validation-cycle-standard-gvx.md).

Voir [ADR 0267](../adr/0267-branchement-runtime-adaptateurs-gvx.md).
