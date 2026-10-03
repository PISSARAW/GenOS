# ADR 0278 — Mode de lecture seule pour le pilote mathématique formel

## Contexte

Le pilote de mathématiques formelles reçoit des énoncés Lean figés. Le plan
d'autonomie général réclame des phases de mutation de code inadaptées à cette
mission et peut bloquer l'exécution avant toute preuve. Le mode factuel existant
évite cette mutation mais décrit une recherche de sources, pas une preuve.

## Décision

Ajouter `formal_read_only` au contrat de stratégie et un socle d'autonomie
`formal_problem_baseline`. Il conserve l'énoncé et recherche les échecs connus,
sans autoriser l'édition de fichiers. Le mode n'est accepté que si la politique
d'exécution interdit déjà les modifications. La preuve reste soumise à un
oracle Lean indépendant, qui reconstruit l'en-tête du théorème depuis le corpus
figé et refuse les preuves incomplètes.

## Conséquences

Le pilote peut mesurer une mission GenOS réelle sans prétendre que son verdict
interne vaut certification mathématique. Le reçu Lean et l'identité du modèle
servi restent des conditions distinctes pour compter la réussite. Ce mode ne
constitue pas une campagne appariée confirmatoire.

