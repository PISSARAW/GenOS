# ADR 0395 — Régulation supervisée des workers natifs par checkpoint vérifié

- **Statut** : Accepté pour les workers natifs en environnement simulé
- **Date** : 2026-10-10
- **Domaine** : Exécution native, régulation, persistance, récupération
- **Décideurs** : Équipe GenOS
- **Lié à** : [protocole de validation](../02-orchestration/regulation-workers-protocole.md), [ADR 0394](0394-preflight-restauration-organisme.md)

## Contexte

Les 19 types de workers terminaient leurs méthodes déterministes et produisaient des rapports, même lorsque leur état régulatoire était hors plage. Le service de régulation était en mémoire ; `runDeterministicWorker` ne le consultait pas. Un RPE positif peut réduire le stress, mais ne constitue pas une source d'énergie ni une réparation d'intégrité.

## Décision

1. Le runtime natif vérifie l'état avant et après la méthode. Hors plage (énergie < 0,4, intégrité < 0,5, survie ≥ 0,7 ou stress > 0,7), il refuse l'exécution tant qu'aucune récupération vérifiée n'est disponible.
2. Le superviseur peut créer un checkpoint uniquement depuis un état fonctionnel. Il persiste le snapshot, son SHA-256 et la révision en SQLite. Un checkpoint est consommable une seule fois.
3. Une reprise exige un `recovery_worker` natif distinct, dans le même workspace et sous le même parent. Son contrat doit autoriser `restore_checkpoint` pour le chemin précis ; le run doit être terminé ; le rapport de preuve doit citer le reçu et le SHA-256 du fichier restauré. La référence de récupération doit figurer dans le contrat persisté du worker cible. Le superviseur relit le fichier et compare son condensat au checkpoint.
4. La restauration du snapshot en mémoire est suivie d'une écriture versionnée en SQLite et d'un événement de récupération. Un conflit de révision, un checkpoint réutilisé ou un reçu invalide bloque le worker. Un RPE nul reste neutre ; les autres hormones ne sont pas réinitialisées par une mise à jour partielle.
5. Le checkpoint restaure **l'état simulé de l'agent**. Il ne prétend pas créer de ressources physiques. Un déploiement où énergie ou intégrité représentent des ressources externes doit fournir une mesure et une action propres à ces ressources avant de réutiliser cette politique.

## Conséquences

### Positives

- Les 19 types peuvent traverser un cycle de perturbation, récupération prouvée et méthode native sans déclarer de succès hors plage.
- L'état restauré survit à une réhydratation depuis SQLite ; le replay d'un checkpoint consommé est refusé.
- Un worker hors plage sans preuve, ou dont le fichier restauré a été modifié, s'arrête avant sa méthode.

### Coûts et limites

- Le protocole couvre le runtime natif déterministe ; il ne qualifie pas la planification complète de mission ni les autres chemins d'exécution.
- Les checkpoints doivent être créés avant la perturbation et le superviseur doit disposer d'un `recovery_worker` avec le bail adapté. Sans checkpoint valide, le système choisit l'arrêt sûr.
- Le protocole de sonde construit le parent et les contrats dans une base isolée. Ses fichiers changent pendant que l'observateur du workspace les lit ; ses messages de snapshot auxiliaires ne valent pas preuve de réussite ou d'échec du run natif.

## Alternatives écartées

- **Relever directement énergie et intégrité après une méthode réussie** : cela ferait passer la sonde sans acte réparateur vérifié.
- **Assimiler RPE positif à une restauration générale** : un feedback de qualité ne prouve ni budget renouvelé ni intégrité réparée.
- **Accepter la seule déclaration de succès du `recovery_worker`** : elle ne prouve pas le contenu réel du fichier ; le reçu, le contrat et le condensat sont tous contrôlés.
