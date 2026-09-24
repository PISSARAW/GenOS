# 0090 — Variants exécutables de Biocénose

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Biocénose, protocoles, décisions
- **Décideurs** : GenOS
- **Lié à** : [ADR 0089](0089-gates-decision-biocenose.md), [topologie Biocénose](../02-orchestration/topologies/biocenose.md)

## Contexte

La documentation décrivait douze variants alors que le routeur n'en acceptait que trois,
et les politiques n'étaient pas consultées par le runtime. Une sélection ne doit ni
changer silencieusement en cours de délibération ni faire passer une capacité théorique
pour un comportement implémenté.

## Décision

- Le registre accepte les douze identifiants documentés; `delphi` reste un alias compatible
  de `delphi_community`.
- L'identifiant du variant est enregistré dans la constitution versionnée et son hash.
  Le runtime ne permet pas de le remplacer à l'exécution.
- Le runtime applique les contraintes disponibles : tours minimaux et retour anonymisé
  pour Delphi, reviewer adversarial obligatoire, poids de calibration et d'indépendance
  pour Forecasting Crowd, préservation des IDs de dissent, revue humaine obligatoire et
  vérificateur déterministe pour les faits dans Hybrid Oracle.
- Le résultat du jugement indique le variant et son niveau d'exécution. Les variants
  polycentrique, représentatif, persistant et Byzantine ainsi que la variante
  d'argumentation dédiée restent `PARTIAL` tant que leurs mécanismes propres ne sont pas
  intégrés.

## Conséquences

### Positives

- La sélection du variant devient reproductible avec la constitution qui gouverne la session.
- Les variantes partielles sont visibles comme telles au lieu d'être présentées comme
  des protocoles complets.
- Les contraintes d'un variant incompatible avec le type de question sont refusées à
  la constitution.

### Négatives

- Les variants partiels restent utilisables pour compatibilité, mais ne fournissent pas
  les garanties décrites dans leur modèle cible.
- Les capacités de réputation persistante, d'échantillonnage représentatif, de composition
  polycentrique et de tolérance BFT demandent des lots d'architecture ultérieurs.

## Alternatives

- Garder les variants comme presets descriptifs : rejeté, car le runtime ne les appliquait
  pas et l'interface suggérait une sélection effective.
- Déclarer les douze variantes complètes : rejeté, car plusieurs mécanismes n'existent pas
  encore et cela contredirait l'état du code.
