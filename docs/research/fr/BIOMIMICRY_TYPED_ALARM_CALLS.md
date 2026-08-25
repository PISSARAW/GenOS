# Biomimétisme & Alarmes Typées : Communication à Référents Structurés

> Domaine : éthologie (cognition animale, vervets) — Statut : proposition de recherche

## 1. Fondement biologique
Les vervets d'Afrique de l'Est émettent trois alarmes distinctes : aigle, léopard, serpent — chacune déclenchant une réponse *différente et adaptée* (regarder le ciel / monter à l'arbre / scruter le sol). C'est la preuve classique d'une communication à référents : le message encode une catégorie sémantique du monde, pas seulement une intensité d'alerte. Les jeunes doivent apprendre le bon usage (erreurs corrigées par les adultes).

## 2. Formalisation GenOS
```
Alerte typée = {taxonomie fermée : type ∈ Taxo_alertes, référent: contexte vérifiable, sévérité, TTL}
Taxo_alertes (extensible) : {injection, fuite_données, divergence_phénotypique, panne_provider,
                            contamination_fork, saturation_budget, ...}
Récepteur : table de réponse par type (comportements réflexes différenciés, cf. arc réflexe)
Apprentissage social : nouveaux agents apprennent la taxonomie par tutorat ; mauvais usage → correction (sanction douce)
Contrainte : types fermés et versionnés (pas de chaînes libres) pour garantir l'interopérabilité
```

## 3. Mapping primitives existantes
- Interférons (doc sœur) — transport du signal ; ici on structure le *contenu*.
- Arc réflexe (`reflex_gate.rs`) — tables de réponse par type.
- Protocole MCP (`genos-protocol/specs`) — schématisation naturelle des types.

## 4. Cas d'usage
- Une alerte `fuite_données` déclenche automatiquement gel des écritures externes, alors qu'une `saturation_budget` déclenche AMPK catabolique — même canal, réponses radicalement différentes.
- Post-mortem : statistiques par type d'alerte = cartographie fine des risques réels.

## 5. Apports attendus
- Réponses adaptées au lieu d'alertes génériques uniformes.
- Sémantique d'urgence interopérable entre flottes hétérogènes.
- Apprentissage social contrôlé du vocabulaire d'alerte (culture commune).

## 6. Points d'intégration
Schéma `AlertType` dans `genos-protocol/src/specs/resilience.rs`, branchement interférons/réflexes.
