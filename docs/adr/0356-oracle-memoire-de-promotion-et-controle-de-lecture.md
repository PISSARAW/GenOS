# ADR 0356 — Oracle mémoire de promotion et contrôle de lecture

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Domaine** : P1 L01, L03 et L22, mémoire, AEIS

## Contexte

Une mémoire de promotion conserve un parent de provenance lié au run et à
l'assemblée AEIS. Le hash de sa provenance ne prouve pas que le texte ou
les claims de la mémoire correspondent au rapport source. La recherche
vectorielle peut restituer un contenu modifié après son enregistrement.

## Décision

L'adaptateur `memory_semantic` vérifie l'assertion canonique « La mémoire
reproduit fidèlement le rapport de promotion enregistré. » Il charge le
sujet depuis la mémoire persistée dans le scope demandé, sa provenance,
le parent de promotion, le journal de promotion signé, le run terminé et
l'assemblée AEIS acceptée appartenant au run et au workspace. Les claims,
l'auteur, les références et les liens de scope sont confrontés aux sources.
La commande et le texte faisant autorité ne proviennent pas du candidat.

Deux stratégies exécutables vérifient la copie : reconstruction du texte
attendu et consommation positionnelle de ses champs. Elles vérifient aussi
les claims structurés, le résumé, la tâche et l'auteur. Chaque exécution
utilise une entrée de programme fixe dans un processus et un répertoire
frais. Le bridge AEIS calcule l'indépendance depuis les processus réellement
observés et signe leurs observations. Le sujet est rechargé après le processus
pour refuser une modification pendant la vérification. Le FormalResult doit
correspondre au contenu, au domaine et au digest de provenance actuels.
L'identité productrice utilisée pour l'indépendance est liée à l'auteur et
au workspace du journal ; les labels candidats ne peuvent pas la remplacer.

Le processus existant d'oracle accepte deux types fixes, subset sum et mémoire.
Il ne reçoit pas de chemin de programme arbitraire. Les bornes d'entrée,
de sortie, de durée et l'environnement minimal de l'ADR 0354 restent applicables.

La lecture cognitive utilise le même contrat de fidélité, sans lancer un
processus par souvenir. Avant scoring et injection, les mémoires liées sont
résolues et contrôlées. Une mémoire contredite ou indisponible est exclue.
Le contenu restitué doit correspondre au hash du texte effectivement contrôlé,
pour éviter de valider une révision puis d'injecter un ancien texte. L'inspection
commune expose le verdict et la raison à côté de l'intégrité de provenance.

## Domaine et portée du verdict

Le domaine implémenté est celui des mémoires `Experience` de promotion,
sans contexte philosophique, épistémique interprétatif ou comparaison éthique.
Le rapport comporte de un à seize claims et des références textuelles bornées.
Les preuves structurées et les autres formats restent `inconclusive` avec
`memory_oracle_domain_unavailable`. Les mémoires sans lien de provenance
conservent leur comportement historique ; elles ne sont pas qualifiées par
ce nouvel oracle.

`verified` porte sur la fidélité au rapport enregistré. Le champ
`sourceTruth: not_evaluated` reste présent dans le verdict. Ce contrôle ne
prouve ni la vérité de tous les énoncés source, ni la pertinence du souvenir
pour une nouvelle tâche, ni le gain causal apporté par son retrieval. Une
assemblée de fidélité ne remplace pas un oracle du problème d'origine.

## Vérification

La sonde `nativeMemoryProbes` suit une vraie promotion native avec approbation
humaine. Elle vérifie deux processus différents, leurs workspaces, les receipts
signés et l'assemblée AEIS. Le souvenir valide est effectivement retrouvé par
`searchMemory`. Un texte ajouté n'atteint plus les résultats de recherche.
Les deux stratégies réfutent ensuite le contenu contredit. Des claims modifiés
avec un hash de provenance recalculé sont aussi réfutés. Une preuve portant
sur l'ancien sujet et un scope étranger sont refusés.
Deux labels différents pour la même stratégie ne fabriquent pas un quorum
indépendant. Un budget d'exécution nul reste inconclusif sans receipt.

## Limites et suite de P1

Le budget AEIS limite les exécutions de la sonde, mais l'allocation durable,
les nonces et la clôture d'un run de vérification mémoire restent à raccorder.
L'oracle ne change pas la validité historique du run producteur. Les processus
partagent Node et des contrôles communs de champs ; leur séparation ne prouve
pas un confinement OS ou une indépendance scientifique complète. La diffusion
des rétractations source, les formats mémoire restants, les holdouts et
l'évaluation de l'utilité du retrieval restent ouverts, ainsi que l'oracle code.
Cette extension ne clôture aucun des six lots ni les 115 obligations de P1.
