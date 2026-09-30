# ADR 0183 — Régénération Axolotl ciblée et fondée sur des preuves

- **Statut :** Proposé
- **Date :** 2026-09-30
- **Domaine :** Backend, résilience, cognition
- **Décideurs :** Équipe GenOS
- **Lié à :** `docs/01-concepts/biomimetisme/axolotl.md`, ADR 0177

## Contexte

Le service Axolotl reconstruit une topologie et le dépôt possède déjà un régulateur
de plasticité à six états. La régénération ciblée, l’expérimentation cognitive,
la mesure des coûts et la sélection stratégique doivent rester réversibles,
traçables et compatibles avec les gates de preuve.

## Décision proposée

1. Une régénération peut cibler une topologie entière, des identifiants de
   composants ou des rôles. Les périmètres ciblés sont validés contre la topologie
   source et préservent les composants hors périmètre.
2. Les changements cognitifs sont des candidats expérimentaux. Ils ne sont pas
   promus par le service Axolotl; une évaluation doit fournir des références de
   preuve pour qu’un candidat soit marqué comme étayé.
3. Les changements de plasticité suivent un graphe de transitions explicite,
   consomment le budget existant et conservent motif et historique.
4. Les coûts sont cumulés uniquement à partir de mesures runtime non négatives;
   aucune estimation n’est présentée comme une mesure.
5. Le sélecteur accorde un bonus aux stratégies régénératives seulement lorsque
   le profil porte un signal explicite de défaillance structurelle.

## Conséquences

### Positives

- Les défaillances locales peuvent être traitées sans remplacer toute la structure.
- Les propositions cognitives restent distinctes des connaissances promues.
- Les transitions et coûts sont auditables.

### Négatives

- Les consommateurs doivent fournir les preuves fonctionnelles et les mesures
  qu’ils souhaitent enregistrer.
- Le régulateur et les sessions Axolotl restent en mémoire adaptative; la
  persistance durable doit faire l’objet d’un lot dédié.

## Alternatives

- Toujours reconstruire toute la topologie : rejeté pour les incidents localisés.
- Promouvoir automatiquement les connaissances générées : rejeté faute de gate
  indépendant.
- Déduire un coût à partir du nombre de composants : rejeté car ce n’est pas une
  mesure de dépense runtime.
