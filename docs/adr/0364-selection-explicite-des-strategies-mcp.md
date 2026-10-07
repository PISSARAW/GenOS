# ADR 0364 — Relier la stratégie demandée au sélecteur sous preuve

- **Statut** : accepté.
- **Date** : 2026-10-07.

## Contexte

Le champ public `strategy` de `genos_change_strategy` était décrit comme un identifiant cible mais servait de texte de besoin. Une réponse de transition pouvait donc annoncer une sélection sans avoir examiné l’identifiant demandé. Le planificateur utilisait également une raison générique quand le demandeur n’en fournissait aucune.

## Décision

Transmettre `strategy` comme `requestedPrimary` au sélecteur existant et garder `need` comme description du besoin. Le sélecteur valide l’existence et l’éligibilité de la stratégie ; si elle est inéligible, il peut retenir un repli qu’il nomme dans le contrat. Exiger une raison explicite pour toute adaptation, sans synthétiser une justification probante.

## Conséquences et limites

Les appels qui utilisaient `strategy` comme prose doivent désormais passer cette prose dans `need`. Une stratégie inconnue est refusée. Le test MCP crée un contrat v2 et un run `planned`, puis relit leur état dans SQLite ; il ne prétend ni exécuter le run ni promouvoir son résultat.
