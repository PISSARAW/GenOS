# ADR 0381 — Autorité des reçus scientifiques restaurable par rejeu Lean

Statut : accepté le 2026-10-10.

## Contexte

Le registre `VerificationRegistry` ne vit que dans le processus Node. Après un
redémarrage, une référence scientifique publiée reste dans SQLite, mais son
reçu Lean n'a plus d'autorité vérifiable. Réinscrire simplement le digest du
reçu dans ce registre transformerait une ligne de base de données en preuve.

## Décision

`scientificReceiptAuthority` conserve dans SQLite le reçu complet, la source
Lean exacte, l'énoncé formel direct et l'identité de version de la référence.
À l'entrée, puis à la première lecture dans chaque nouvelle instance, elle
réexécute Lean sur cette source avec une version d'outil et une empreinte
d'environnement fixées par la configuration du service. Elle compare le statut,
les empreintes, la liaison de l'énoncé, les dépendances et les axiomes déclarés.
Un échec ferme l'accès à la référence. Une instance ne réutilise son contrôle
que si l'enregistrement relu garde exactement la même empreinte.

Le magasin des références accepte un résultat de cette autorité seulement
après le rejeu réussi. Les autres résolveurs continuent à dépendre du registre
Lean vivant. La publication reste liée à la référence et à son reçu exact ;
la rétractation et les contrôles de portée du magasin restent applicables.

## Limites et conséquences

- Le premier accès après redémarrage paie un rejeu Lean par reçu actif. Les
  accès suivants dans la même instance utilisent un cache contrôlé par
  l'empreinte de l'enregistrement. Le cache disparaît au redémarrage.
- L'installation Lean et son environnement doivent correspondre aux valeurs
  épinglées. Si Lean est absent ou si le rejeu échoue, la référence n'est pas
  résolue. La disponibilité dépend de ce compilateur.
- L'empreinte d'environnement reste une entrée de configuration. Le rejeu
  vérifie la version Lean et la compilation effective, mais le service ne
  recalcule pas encore cette empreinte à partir des imports installés. De même,
  la liste d'axiomes suit celle renvoyée par l'exécuteur Lean existant ; elle
  ne constitue pas, à elle seule, un audit transitif de toutes les dépendances
  du noyau.
- Seuls les énoncés formels directs sont admis. Une équivalence entre texte
  naturel et formule Lean exige une autorité distincte.

## Vérification

`node backend/tests/test_scientific_receipt_authority.js` couvre le rejeu après
fermeture et réouverture de SQLite, le registre vidé, l'échec fermé quand Lean
échoue et la détection d'une altération du contenu persistant.
