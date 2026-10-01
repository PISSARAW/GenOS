# ADR 0007 — Persistance, activation des organes et évaluation AGOW

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Runtime cognitif, persistance, évaluation
- **Lié à** : [ADR 0006](0006-active-global-organism-workspace.md)

## Contexte

Les services AGOW avaient un pool, des frames et des reçus locaux au processus. Le
broadcast ne branchait aucun récepteur métier par défaut et le cycle ne déclenchait
pas de requête active. Les expériences causales existantes ne contrôlaient ni les
manifestes ni les corpus réservés.

## Décision

- Persister l'état AGOW par agent dans `adaptive_state`, le store durable partagé déjà
  utilisé par le backend.
- Enregistrer les récepteurs mémoire, modèle du monde, soi, interoception et
  métacognition au premier broadcast. Brancher perception et efférence aux événements
  runtime existants; les résultats worker et les missions produisent des candidats.
- Déclencher au plus une requête par cycle lorsqu'une lacune épistémique existe. Les
  réponses sont candidates et soumises au même arbitrage; une empreinte persistée
  applique un délai anti-répétition.
- Fournir un runner d'ablation, de médiation contrôlée et de réplication qui exige un
  snapshot, un protocole préenregistré, un manifeste d'environnement, des graines et des corpus marqués holdout.
  Les résultats sont descriptifs et la décision de promotion reste nulle.

## Conséquences et limites

Le backend conserve l'isolation multi-agent au niveau de `adaptive_state`. Le runner
ne fabrique ni snapshots reproductibles ni corpus indépendants: les appelants doivent
fournir des entrées réelles et un protocole préenregistré; les campagnes vérifient un
snapshot, un environnement, un protocole et des bras identiques, avec seeds distincts
et partitions holdout disjointes par identifiant et contenu. Aucun indicateur AGOW n'est promu par cette implémentation.
Le receiver daemon exige un territoire rattaché au workspace et une mesure machine;
le receiver morphogenèse exécute seulement le préflight shadow, sans transition.
