# ADR 0075 — Routage du moteur selon le contrat du symbionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, runtime, routage, confidentialité
- **Décideurs** : GenOS
- **Lié à** : ADR 0066, ADR 0073, ADR 0074

## Contexte

Le routage fixe par rôle distingue seulement le Host et les symbiontes. Il ne peut
pas tenir compte des contraintes concrètes de confidentialité, de latence, de coût,
de capacité, d'outils et de fiabilité fournisseur portées par une exécution.

## Décision

Le runtime expose `engineForSymbiont(contract, context)`. Il sélectionne parmi les
moteurs disponibles ceux qui satisfont les contraintes déclarées, puis minimise un
score combinant latence, coût et manque de fiabilité. Une route locale est imposée
par une exigence `LOCAL_ONLY`; si aucun moteur déclaré ne respecte les contraintes,
le routage échoue explicitement. Les tâches marquées sans besoin de LLM utilisent
`no_llm`.

L'ancienne fonction `engineFor(role)` reste disponible pour compatibilité des
intégrations existantes. Les moteurs disponibles peuvent représenter un modèle local
ou cloud, un solveur, une CLI, une base de données, un daemon ou une exécution sans
LLM; cette fonction ne lance pas elle-même ces moteurs.

## Conséquences

### Positives

- Les routes déclarées sont filtrées par capacité, outils, confidentialité,
  disponibilité, latence, coût et fiabilité.
- Les contraintes impossibles ne se transforment pas en succès de routage silencieux.
- Les intégrations historiques continuent d'utiliser le routage par rôle.

### Négatives

- Les appelants doivent fournir un inventaire honnête des moteurs disponibles et
  leurs mesures.
- Le score de sélection ne remplace pas les contrôles d'accès du moteur choisi.

## Alternatives

- Continuer à choisir uniquement `local` ou `cloud` d'après le rôle : rejeté, car les
  contrats et les contraintes opérationnelles resteraient ignorés.
