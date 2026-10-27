# ADR 0748 — Viabilité collective et allostasie multiniveau dans AGOW

- **Statut** : Accepté — implémentation incrémentale
- **Date** : 2026-10-27
- **Domaine** : AGOW, arbitrage, allostasie, morphogenèse et validation causale
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0006](0006-active-global-organism-workspace.md), [ADR 0240](0240-agow-regret-predictif.md), [ADR 0241](0241-agow-shadow-contrefactuel-isole.md)

## Contexte

AGOW calcule déjà un regret de viabilité à partir d'une mesure d'interoception et
d'un état allostatique attendu par candidat. L'interoception runtime applique aussi
une posture locale à l'agent. Ces mécanismes n'expriment pas encore distinctement les
besoins de l'agent, de la topologie, de la mission et de l'organisation; ils ne
connectent pas non plus la sélection à une transition morphogénétique admise. La
présence de ces composants ne prouve pas qu'ils améliorent les résultats des tâches.

## Décision

1. La sélection AGOW évaluera le coût attendu de traiter et d'ignorer les candidats
   selon leurs effets mesurés ou prédits sur les objectifs, les ressources, les risques
   de blocage et la stabilité de la mission à horizons déclarés.
2. Les mesures allostatiques restent séparées par scope (`agent`, `topology`, `mission`,
   `organization`), avec provenance, fraîcheur, incertitude et unités explicites. Elles
   ne sont pas fondues dans une moyenne sans conservation des composantes.
3. Les politiques s'arbitrent d'abord sous les contraintes de sécurité, d'autorité et
   de preuve. Les limites de mission et d'organisation forment ensuite les contraintes
   de viabilité du collectif; les besoins de l'agent sont arbitrés à l'intérieur de ces
   limites et les conflits demeurent visibles dans le reçu.
4. AGOW peut produire un diagnostic et une proposition morphogénétique explicables.
   Morphogenèse reste l'autorité qui valide et applique les transitions, sous ses
   contrats existants de budget, lease, quiescence, snapshot, vérification et rollback.
5. Toute politique influençant la sélection ou la topologie possède un mode de contrôle
   explicite et une ablation correspondante. Le passage de `shadow` à un contrôle borné
   dépend des gates et d'une revue séparée; aucune fonctionnalité ni simulation ne vaut
   preuve causale.

## Conséquences

- Les reçus d'arbitrage deviennent inspectables par dimension et par niveau.
- L'absence ou l'expiration d'une mesure produit un état indisponible, jamais une
  amélioration implicite de viabilité.
- La qualité des prédictions, les poids et les seuils exigent calibration et holdouts.
- La relation AGOW–Morphogenèse reste propositionnelle jusqu'à l'admission d'une
  transition par le runtime morphogénétique.
- Le claim scientifique porte sur l'effet causal des signaux allostatiques sur des
  outcomes indépendants, avec ressources et tâches appariées, ablations, réplications
  et intervalles d'incertitude.

## Séquence d'implémentation

1. Étendre le regret prospectif et ses reçus sans affaiblir les contraintes bloquantes.
2. Ajouter les contrats et l'arbitrage allostatique multi-scope.
3. Relier les diagnostics AGOW à une proposition Morphogenèse puis aux gates existants.
4. Préenregistrer un protocole de comparaison causale avec mesures indépendantes.
5. Déployer shadow, puis proposer une activation bornée après revue des preuves.
