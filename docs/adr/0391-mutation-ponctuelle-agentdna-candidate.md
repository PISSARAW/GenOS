# ADR 0391 — Substitution ponctuelle dans un AgentDNA candidat

- **Statut** : accepté pour la création d'un candidat isolé
- **Date** : 2026-10-10
- **Domaine** : AgentDNA, mutation candidate et Studio
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0390

Aucun effet fonctionnel ni déploiement automatique n'est établi par cette opération.

## Contexte

Le handler biomimétique `pointMutation` conserve un registre descriptif. Le Studio
disposait d'une mutation AgentDNA stochastique qui créait un candidat, mais elle ne
garantissait pas qu'une base précise change. Un succès de transport ou un événement
de mutation ne prouve pas l'exécution d'un phénotype modifié.

## Décision

L'opération native `genos genome point-mutate` reçoit un locus, une position de
nucléotide et une base `A/C/G/T`. Elle refuse les loci d'instinct protégés, une
position hors bornes et une substitution identique. Elle dérive une nouvelle identité
de génome, modifie exactement cette base, valide la structure et inscrit dans la
provenance le parent ainsi que les bases avant/après. La signature du parent n'est
pas héritée.

Le Studio expose `POST /api/studio/genomes/:genomeId/point-mutate` sous les
permissions d'écriture et la portée organisation/projet existantes. Le client doit
fournir le hash courant du génome. Le service vérifie ce hash avant et dans la
transaction, enregistre un nouveau `agent_genomes` au statut `candidate` et un
événement `MUTATION` avec le parent. Il ne remplace pas le génome source.

La réponse indique explicitement `functionalEffectMeasured: false`,
`promotionGranted: false` et `deployed: false`. Les mécanismes existants
d'évaluation et de promotion restent seuls habilités à rendre ce candidat actif.

## Limites et vérification

La substitution change la séquence AgentDNA, mais peut laisser le phénotype
inchangé ou produire un texte de gène dégradé. La validation structurelle ne prouve
pas une amélioration ni une exécution. L'admission comme worker dépend encore de
la confiance de signature et des gates de promotion.

Les tests doivent vérifier une unique base modifiée, la source intacte, le parent
et l'événement persistés, les refus de version/portée et l'absence de promotion.

## Alternatives

- Étendre le registre MCP : rejeté, car il ne porte pas l'AgentDNA exécutable.
- Activer directement la mutation : rejeté, faute de preuve fonctionnelle.
- Réutiliser un taux stochastique à 1 sur un locus : rejeté, car cela modifie
  plusieurs bases et ne représente pas une substitution ponctuelle.
