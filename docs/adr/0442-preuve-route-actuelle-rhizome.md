# ADR 0442 — Lier la complétion Rhizome au chemin actuellement autorisé

- **Statut** : Accepté
- **Date** : 2026-10-12
- **Domaine** : Rhizome, variants, preuves de route

## Contexte

Les métriques validaient la signature et l'intégrité du chemin enregistré dans
un reçu, puis vérifiaient séparément qu'une route quelconque restait disponible
pour le besoin. Dans le variant `private`, un chemin devenu public pouvait ainsi
continuer à compter si un second chemin privé était disponible. Un test de
falsification a obtenu `canMerge: true` dans cet état.

## Décision

Pour compter une exécution dans la couverture et la convergence, le chemin
complet du reçu signé doit appartenir aux alternatives produites maintenant par
le planificateur avec la politique du variant courant. L'identifiant, les nœuds
et les arêtes doivent correspondre exactement. Signature, disponibilité et
exigences de preuve restent aussi obligatoires.

## Conséquences

Une autre route disponible ne suffit plus à promouvoir une preuve périmée.
La sélection et sa limite d'alternatives peuvent rejeter prudemment un ancien
chemin pourtant structurellement valide ; une nouvelle exécution vérifiée est
alors nécessaire. Le graphe et les reçus ne sont pas réécrits par ce contrôle.
