# ADR 0464 — Lier la distribution Biocénose au panel représentatif scellé

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : Biocénose, Representative Community, preuve de promotion

## Contexte

La formation représentative échantillonne les candidats, calcule leurs poids et
enregistre ce résultat dans la constitution. À l'agrégation, un
`representativePanel` fourni par l'appelant court-circuitait la reconstruction
locale. Un appelant pouvait alors remplacer les poids scellés par des poids
arbitraires et fournir son propre validateur de sièges. Le test de falsification
obtenait une distribution pondérée 100:1 pour un panel scellé 1:1.

## Décision

Pour `representative_community`, le runtime reconstruit toujours les sièges à
partir de `constitution.representativeSampling.sample` et de ses poids scellés.
Chaque membre échantillonné doit encore être actif dans la session ; les
identifiants doivent être uniques et leurs poids positifs finis. Un échantillon
absent, incomplet ou incohérent produit un panel vide, donc `REVIEW_REQUIRED`
avant toute distribution représentative. Le panel et le validateur fournis par
l'appelant ne peuvent plus autoriser des sièges ou poids de substitution.

## Limites

Ce lien suppose l'intégrité de la constitution persistée et du contrôle
d'identité des membres. Il ne démontre pas la qualité statistique de
l'échantillonnage, l'indépendance des membres ou la vérité de leurs jugements.
Les autres issues de délibération et leurs gates restent applicables.
