# ADR 0370 — Checkpoint logique local et continuité LLM opaque

Statut : accepté, portée limitée
Date : 2026-10-10
Domaine : snapshots, runtime local, modèles
Décideurs : équipe GenOS
Lié à : [ADR 0368](0368-reprise-curseur-mission-et-frontieres-runtime.md)

## Contexte

Le snapshot durable conserve `agent_runtime_state` et les tours LLM visibles,
mais ne peut ni copier la RAM d'un processus arbitraire ni lire l'état interne
d'un fournisseur. Le runtime Codex externe est lancé avec `--ephemeral` et ne
fournit pas de contrat de checkpoint. Le runtime local GenOS est contrôlé par
le dépôt et peut déclarer des points de reprise logiques.

## Décision

- Le runtime local écrit un checkpoint versionné dans `agent_runtime_state` aux
  phases `prepared`, `inference`, `generated`, `evaluating`, `evaluated` et
  `completed`. Le prompt est lié par SHA-256. La réponse conservée est bornée
  à 1 Mio. La capture et la reprise ne sont permises qu'aux phases
  `prepared`, `generated` et `evaluated`, après arrêt du processus.
- Un redémarrage exige l'identifiant explicite du checkpoint. L'autorité de la
  mission, l'agent, le workspace, l'exécutable local et le prompt sont vérifiés
  avant l'import. La phase `generated` évite une seconde inférence ; la phase
  `evaluated` évite une seconde exécution du pipeline de post-traitement.
- Les phases `inference` et `evaluating` sont refusées : l'issue d'un appel
  modèle ou d'un effet externe peut être inconnue après un arrêt.
- La continuité fournisseur est optionnelle. Le chemin OpenAI Responses garde
  une référence de réponse chiffrée dans le tour durable et la réutilise pour
  un appel ultérieur de la même session, du même tenant et du même modèle. Il
  n'y a pas de bascule silencieuse vers un autre modèle si cette reprise échoue.
- Le manifeste version 4 distingue référence de continuité, contexte visible
  et contexte caché. L'API de restauration indique qu'une référence est
  disponible ; elle ne déclare sa reprise effective qu'après un appel accepté
  par le fournisseur. `processMemoryRestored` et
  `providerHiddenContextRestored` restent `false`.

## Conséquences

### Positives

- Un runtime local arrêté à une étape sûre peut reprendre sans répéter une
  inférence déjà terminée ou un pipeline déjà terminé.
- Les autres exécutables et fournisseurs restent explicitement sans contrat.
- Le snapshot existant continue de refuser un processus ou un appel LLM actif.

### Négatives

- La reprise exige une action explicite et une clé `GENOS_SECRET_KEY` pour les
  références du fournisseur. Une référence peut expirer ou être révoquée.
- Les écritures de fichiers, SQLite, télémétrie et effets externes ne forment
  pas une transaction globale. Une panne pendant un effet externe demande une
  réconciliation ; le runtime refuse de le rejouer automatiquement.
- Ce contrat ne restaure pas la RAM, les handles, la mémoire du fournisseur,
  ni un processus Codex éphémère.

## Alternatives

- Capturer le processus complet avec CRIU : réservé à une étude Linux distincte
  avec matrice de compatibilité ; hors portée du runtime Windows actuel.
- Rejouer systématiquement le prompt après restauration : rejeté car les
  appels modèles et effets externes peuvent être facturés ou dupliqués.
