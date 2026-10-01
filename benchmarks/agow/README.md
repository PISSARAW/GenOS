# Campagne empirique AGOW locale

Cette campagne exécute le vrai modèle local configuré dans Ollama et les primitives
`compete`, `diffuse` et `consume` de `globalWorkspaceService`. Le protocole gelé est
[`protocol-local-2026-10.json`](protocol-local-2026-10.json). Les cas sont créés par
graine et leurs valeurs attendues ne sont jamais ajoutées au prompt du modèle.

## Lancer

Depuis PowerShell à la racine du dépôt :

```powershell
node benchmarks/agow/run-local-campaign.cjs
```

Le lanceur exige Ollama local, le modèle `qwen2.5-coder:7b`, `sqlite` et `sqlite3` du
backend. Il vérifie l'identifiant exact du modèle avant de commencer et conserve les
reçus du runner dans une base SQLite mémoire pendant le processus. Les résultats
exportés sont écrits dans `benchmarks/agow/results/` avec les corpus, reçus, version
Ollama, empreintes SHA-256, graines, latences et comptages de tokens observés.

## Interventions et mesures

- **Ablation** : `full` diffuse le candidat gagnant; `workspace_ablated` contourne la
  compétition et transmet tous les candidats; `broadcast_ablated` conserve la
  compétition puis supprime la diffusion.
- **Médiation contrôlée** : les deux groupes exécutent la même compétition; seule la
  livraison du gagnant au module de réponse change.
- **Réplication** : trois exécutions de médiation ont le même protocole et snapshot,
  avec graines et cas distincts.

Le score est une égalité exacte sur le champ demandé. Le runner consigne aussi
l'activation, la livraison, le rappel du candidat pertinent, les tokens du modèle et
la latence locale. Une sortie du modèle invalide compte comme échec; les appels
infructueux font échouer la campagne au lieu d'être éliminés.

## Portée des résultats

Le corpus est synthétique, généré pour cette étude et non scellé par un tiers. Les
résultats établissent au mieux que ces primitives ont un effet mesurable sur des
recherches exactes contrôlées avec ce modèle local. Ils ne démontrent ni une amélioration
générale d'AGOW, ni la médiation de tous ses organes, ni une réplication indépendante
sur un corpus métier. Les reçus gardent `promotionDecision: null` et
`evidenceStatus: replication_required`.
