# ADR 0429 — Lier les gates Trinity au journal de comparaison

## Statut

Accepté.

## Contexte

La campagne nominale lisait `variantGates` dans la décision promue. Cette
projection est produite par le comparateur, mais le lecteur de campagne ne la
confrontait pas à la comparaison persistée. Une décision pouvait ainsi
annoncer un gate exécuté sans journal correspondant. Le cas `controlled`,
sans gate spécialisé, pouvait également manquer de comparaison observable.

## Décision

- La campagne lit le journal `comparison` en lecture seule. Elle contrôle
  l'empreinte de la valeur, celle de son événement terminal, la corrélation
  de mission et les empreintes d'entrée et de résultat.
- L'événement terminal doit exister dans le journal append-only des traces et
  correspondre à l'événement référencé par la comparaison.
- Les `variantGates` de la décision doivent être égaux à la projection
  recalculée depuis `comparativeAnalysis` du journal. Le monde promu doit être
  le monde sélectionné par cette comparaison. Sinon, la campagne
  refuse `variant_gates_not_durable`; en absence ou corruption de journal,
  elle refuse `comparison_journal_not_verified`.

## Limites

La cohérence cryptographique locale ne prouve pas l'authenticité d'un modèle
ou la vérité des mesures initiales. Les contrôles indépendants du candidat,
la signature AgentGit, les gates propres aux variants et la campagne réelle
des douze missions restent nécessaires.
