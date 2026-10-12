# ADR 0430 — Devis prudent des coûts d'action

- **Statut** : Accepté pour le module de devis ; intégration au contrôleur à qualifier.
- **Date** : 2026-10-11.
- **Domaine** : Décision, budget et économie de tokens.
- **Lié à** : [ADR 0383](0383-economie-tokens-conditionnee-aux-preuves.md).

## Contexte

Le routage et plusieurs sous-systèmes disposent d'estimations locales, mais
aucun devis commun ne décrit le coût d'une action et de ses conséquences
immédiates avant décision. Une procédure semble gratuite si on omet sa
vérification ; un modèle semble abordable si on omet les reprises ; l'abstention
semble toujours optimale si on ne représente que ses zéro token.

## Décision

`actionCostQuoteService` accepte huit types d'action : `none`, `abstain`,
`procedure`, `tool`, `small_model`, `large_model`, `delegation` et
`verification`. Chaque action active fournit trois composantes : exécution,
vérification aval et coût d'une reprise complète. Les composantes exposent
tokens, dollars et latence sous forme d'intervalles finis non négatifs. Le
nombre maximal de reprises est explicite. Le coût d'une reprise doit inclure
ses propres contrôles ; le module ne suppose aucune vérification gratuite.

Le devis retourne la somme des bornes, leur provenance `measured`, `estimated`
ou `unknown`, et un plafond de réservation par dimension. Tout élément
manquant rend le plafond correspondant inconnu. Un contrôleur ne doit pas
interpréter `null` comme zéro ni réserver sur un devis incomplet.

Pour `none` et `abstain`, le coût d'exécution est nul, mais le risque de
non-satisfaction de la mission est fourni séparément comme probabilité et
impact normalisé dans `[0, 1]`. Le risque n'est pas converti arbitrairement en
tokens ou en dollars. Un comparateur ne déclare une action moins chère que si
ses bornes supérieures ne dépassent les bornes inférieures de l'autre dans
**les trois dimensions**, avec au moins une inégalité stricte. Si le risque
de non-action est matériel, les deux choix restent incomparables sans
politique de valeur explicite.

## Limites

Le module est déterministe et sans effet externe ; il n'est pas encore branché
au routeur ou à la réservation transactionnelle. Il ne mesure ni ne calibre
la probabilité de réussite d'une action. Les entrées `measured` attestent une
provenance déclarée par l'appelant, pas une mesure vérifiée par ce module.
Les plafonds sont ceux des composantes fournies, et non une garantie sur le
prix réel d'un fournisseur. Une latence parallèle demanderait un modèle de
graphe ; la somme présente est une borne de travail séquentiel conservatrice.

## Vérification locale

`node backend/tests/test_action_cost_quote.js` couvre les huit types, la somme
avec vérification et reprises, les inconnues, la provenance, le risque de
non-action, les intervalles qui se recouvrent et les entrées invalides.
