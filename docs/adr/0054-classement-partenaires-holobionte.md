# ADR 0054 — Classement des partenaires Holobionte

## Statut

Accepté — cinquième tranche de fondation Holobionte.

## Contexte

Après la découverte et l'admission, le Host doit pouvoir comparer plusieurs
candidats en fonction de son besoin réel. Un classement global fixe ignorerait
les objectifs, les tolérances et les dépendances propres à chaque Host.

## Décision

1. Calculer l'adéquation aux capacités manquantes pour chaque candidat, puis
   conserver le vecteur de critères qui explique son rang.
2. Combiner adéquation, fiabilité, qualité des preuves, compatibilité
   historique, remplaçabilité, coût, risque et risque de dépendance avec des
   poids explicites.
3. Appliquer les plafonds de risque et de dépendance de la constitution avant
   le classement ; un candidat inéligible reste visible avec ses motifs.
4. Stabiliser l'ordre à égalité par identifiant pour rendre les résultats
   déterministes.

## Conséquences

- Le même ensemble de candidats peut produire des rangs différents selon le
  manque de capacité du Host.
- Les critères sont des mesures fournies au service ; la collecte de preuves
  longitudinales et l'apprentissage des poids restent des tranches ultérieures.
- Le classement ne constitue pas à lui seul une admission ou une autorisation
  d'exécution.

## Alternatives

- Utiliser un ordre fixe de candidats : rejeté, car il n'est pas lié au besoin
  du Host.
- Masquer les candidats rejetés : rejeté, car les raisons d'inéligibilité
  doivent rester auditables et explicables.
