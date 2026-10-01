# ADR 0246 — Graphe de compétences GVX dérivé du registre

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, registre développemental, compétences

## Contexte

Le lot 3 demande un graphe durable de compétences. GVX possède déjà un registre
append-only d'expériences et de transformations candidates. Un second magasin
dupliquerait ces faits et pourrait diverger après une reprise ou une migration.

## Décision

Le graphe est une projection reconstruite depuis les événements GVX du même
scope. Les transformations proposent des compétences ajoutées et leurs
prérequis. Une compétence reste `unknown` tant qu'une expérience source
correspond à un événement terminé avec toutes les exigences de vérification
satisfaites (`ready_for_independent_review`). Dans ce cas, elle est étiquetée
`empirically_supported`, jamais `verified` : la revue indépendante reste à
faire. Les identifiants d'expérience sans correspondance ne contribuent pas à
la preuve. Les prérequis sans preuve restent visibles comme nœuds inconnus.

## Conséquences

- Le graphe est reproductible et ne requiert ni table ni migration parallèle.
- Sa construction dépend du registre GVX et reste isolée par organisation,
  projet et entité.
- Les compétences ne sont pas encore utilisées pour adapter un curriculum.
- La projection dépend de l'ordre du journal pour identifier ses sources, mais
  trie ses nœuds, relations et références de preuve pour produire une sortie
  stable.

## Alternatives considérées

- Maintenir des nœuds et arêtes mutables dans une table dédiée : rejeté à ce
  stade, car le registre existant suffit comme source de vérité.
- Marquer comme vérifiée toute compétence liée à un plan terminé : rejeté,
  car le protocole n'atteste que la couverture des exigences et demande encore
  une revue indépendante.
