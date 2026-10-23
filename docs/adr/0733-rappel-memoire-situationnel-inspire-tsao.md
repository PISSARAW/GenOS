# ADR 0733 — Rappel mémoire situationnel inspiré des recherches de Tsao

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Domaine** : Mémoire, runtime Node.js, classement et traçabilité
- **Décideurs** : Mainteneur GenOS, à sa demande d'intégration
- **Lié à** : [mémoire situationnelle](../01-concepts/rappel-memoire-situationnel.md), [ADR 0280](0280-scellage-memoire-missions.md)

## Contexte

Le contexte mémoire des agents réunit recherche hybride, expériences causales,
pièges, golden paths et épisodes. Les filtres de portée et le budget historique
sont déjà présents. La sélection ne compare toutefois pas explicitement les
caractéristiques structurelles d'une situation selon la phase de travail.

Les recherches de Chang et Tsao (2017) sur un code distribué d'identité faciale
et de Shi et al. (2026) sur le passage d'un code de détection à un code de
discrimination fournissent une inspiration de conception. Leurs résultats
expérimentaux concernent la vision du macaque ; leur transposition à GenOS reste
une hypothèse d'ingénierie. Les sources primaires et limites sont expliquées
dans la fiche conceptuelle liée.

## Décision

Introduire un classeur pur après les filtres existants de portée et d'obligations,
avant la sélection du prompt. La détection associe similarité existante et
recouvrement de huit dimensions lexicales. La discrimination pondère structure,
similarité, fraîcheur et disponibilité de références selon `recallPhase`.
L'exploration pénalise les profils redondants.

Le service examine au plus 2 048 entrées et conserve 64 candidats par famille.
Il conserve les champs d'origine et produit une trace `ranking-only` versionnée.
Le compilateur respecte le score calculé et inclut la trace dans le budget.
Les précautions restent prioritaires. La politique est activée par défaut pour
le contexte mémoire historique des prompts Node.js et désactivable par
`situationalRecall: false` pour une comparaison ou un retour de politique.

Aucune référence historique, présence de hash ou valeur de classement ne devient
une preuve authentifiée, une autorisation ou une condition suffisante de promotion.
Le classeur n'écrit aucun souvenir et ne modifie pas le contrat des gates de preuve.
Les recherches mémoire REST/gRPC/MCP brutes et le runtime Rust ne reçoivent pas
un nouveau contrat de classement dans cette livraison.

## Conséquences

### Positives

- Comparaison explicable de situations proches utilisant des vocabulaires différents.
- Sélection variable selon exploration, diagnostic et vérification.
- Exécution locale bornée, sans dépendance ou inférence supplémentaire.
- Préservation des références et des budgets ; tests unitaires et runtime SQLite.

### Négatives et limites

- Dimensions et poids heuristiques ; traitement incomplet des négations et du contexte.
- Une trace ajoute des tokens et peut réduire le nombre de souvenirs injectés.
- Le service ne récupère pas un souvenir absent de la recherche initiale.
- Le gain sur missions réelles exige une comparaison indépendante sur cas réservés.

## Alternatives

1. Conserver uniquement le score actuel : simple, sans critères structurels explicites.
2. Ajouter un reranker LLM : contexte plus riche, coût et dépendance supplémentaires.
3. Apprendre une projection : envisageable après constitution d'un corpus qualifié.

## Vérification

`npm --prefix backend run test:memory-recall` exécute les cas de transfert,
phase, diversité, bornes et absence d'élévation d'autorité, puis le test SQLite
de recherche, exclusions, compilation, provenance et budget nul.
