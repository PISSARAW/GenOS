# 0131 — Mécanismes runtime des variants Syncytium

- **Statut** : Accepté
- **Date** : 2026-09-26
- **Domaine** : Syncytium, cohérence, coédition, réplication, autorité humaine
- **Décideurs** : Équipe GenOS
- **Lié à** : [ADR 0125](0125-profils-morphologiques-composables.md)

## Contexte

Le registre décrivait des variants Syncytium dont plusieurs capacités restaient des
intentions architecturales. Les profils avaient besoin de contrats exécutables raccordés
aux services de coordination existants, sans confondre simulation logicielle, preuve
déclarative et garanties fournies par une infrastructure distribuée.

## Décision

1. Implémenter les opérations propres aux variants au moyen de services dédiés derrière
   la façade Syncytium, en réutilisant le schéma, le journal causal et les transactions.
2. Ajouter des contrôles bornés et explicites pour fencing, autorité hors ligne, anti-entropie,
   objets de blackboard, édition documentaire, branches spéculatives et régions.
3. Représenter les claims épistémiques et les interactions humain–IA avec provenance,
   attribution, consentement et audit append-only.
4. Garder les garanties hors de portée visibles dans la documentation : les reçus WCET
   ne sont pas des mesures certifiées, le scheduler n'est pas temps réel dur, les compensations
   ne peuvent annuler un effet externe et les adaptateurs locaux ne forment pas à eux seuls
   un système distribué.

## Conséquences

### Positives

- Les variants exposent des opérations concrètes avec des limites vérifiables.
- Les contrôles d'autorité et d'intégrité sont attachés aux chemins d'écriture concernés.
- La documentation distingue les capacités exécutables des objectifs encore conceptuels.

### Négatives

- Les capacités restent dépendantes du runtime local et du stockage/configuration GenOS.
- Plusieurs objectifs exigent encore une infrastructure distribuée, des protocoles CRDT
  spécialisés ou une validation externe.

## Alternatives

- Maintenir uniquement les profils déclaratifs : rejeté, car cela ne raccorde pas les
  politiques aux opérations.
- Déclarer toutes les capacités du tableau comme garanties : rejeté, faute d'implémentation
  et de preuve pour les propriétés distribuées, cryptographiques et temps réel dur.
