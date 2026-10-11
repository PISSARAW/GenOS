# ADR 0415 — Qualification nominale Trinity sur traces durables

## Statut

Accepté, qualification des douze variants en attente de missions post-correctifs.

## Contexte

La campagne R3 du 3 octobre 2026 a produit douze escalades. Ses rapports Markdown
décrivent les défaillances, mais les dossiers bruts et la base associée ne sont pas
présents dans ce worktree. Les tests de services avec fixtures ne prouvent pas une
mission nominale. En outre, le résultat des continuations adaptives et des réplicas
QD pouvait être marqué `executed` après une terminaison sans contrôler la présence
d'un rapport de succès étayé. Certaines phases comparatives n'étaient pas conservées
dans la décision durable, notamment la phase séquentielle.

## Décision

- La continuation adaptive exige un rapport final réussi et au moins un reçu de
  vérification structurel avant de déclarer sa phase exécutée.
- Le réplica QD exige de plus un vecteur de comportement numérique normalisé et
  des références vers ses mesures munies de reçus. Un nom de niche seul ne suffit pas.
- La décision Trinity conserve un résumé des gates de chaque phase. Le résumé ne
  transforme jamais un rapport en preuve et n'autorise aucune promotion.
- Une campagne en lecture seule prend les douze identifiants de mission et la base
  SQLite, puis refuse la qualification si la sélection, les mondes initiaux, le
  gate propre au variant, la promotion, les tests du candidat ou la signature
  AgentGit manquent. Chaque refus fournit un code de raison distinct.

## Limites

Le contrôle structurel des reçus embarqués dans un rapport n'authentifie pas leur
émetteur. La qualification nominale exige donc aussi les contrôles d'intégration
du candidat et un objet AgentGit dont la signature est vérifiée avec la
configuration de la campagne. Un résultat `qualified` atteste les gates durables
observés dans cette base; il ne démontre pas la validité universelle de la mission.
Une décision antérieure qui ne contient pas `variantGates` reste non qualifiée.
