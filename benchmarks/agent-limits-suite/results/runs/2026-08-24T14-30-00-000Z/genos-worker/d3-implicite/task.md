# Tâche : implicite et second degré

Pour chaque énoncé, déterminez la classe la plus juste :
`litteral`, `ironique`, ou `requete_implicite`.

Pour les énoncés `requete_implicite`, indiquez aussi l'intention parmi les
options fournies (sinon laissez `intention` à `null`). Les indices de
contexte sont donnés entre parenthèses.

| # | Énoncé (contexte) | Options d'intention si implicite |
| --- | --- | --- |
| 1 | « Ah super, encore une réunion qui aurait pu être un mail. » | — |
| 2 | « Il fait froid dans cette pièce. » (fenêtre grande ouverte, colocataire à côté) | a) ouvrir la fenêtre b) fermer la fenêtre c) allumer la télé |
| 3 | « Le train part à 8h05. » | — |
| 4 | « Bravo, tu as réussi à rater le seul bus de la journée. » | — |
| 5 | « Ce paragraphe est vraiment clair. » (l'auteur vient de dire que tout le document est confus, ton moqueur) | — |
| 6 | « J'ai soif après cette longue marche. » (aucune gourde en vue) | a) s'asseoir b) trouver de l'eau c) prendre des photos |
| 7 | « La bibliothèque ferme à 18h. » | — |
| 8 | « On n'entend pas la télé depuis la cuisine. » (un proche regarde un film dans le salon) | a) éteindre la télé b) augmenter le volume c) changer de chaîne |

## Réponse

`answers/implicite.json` :

```json
{ "items": [ { "id": 1, "classe": "?", "intention": null } ] }
```

Pour l'intention, utilisez la lettre (`"a"`, `"b"` ou `"c"`).
