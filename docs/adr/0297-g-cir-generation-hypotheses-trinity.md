# ADR 0297 - G-CIR pour la generation d'hypotheses Trinity

- **Statut** : Accepte
- **Date** : 2026-10-04
- **Domaine** : Trinity, cognition, preuve
- **Decideurs** : equipe GenOS
- **Lie a** : [ADR 0294](0294-contrat-residuel-cognitif-signal-plane.md), [G-CIR](../02-orchestration/g-cir.md)

## Contexte

La generation optionnelle d'hypotheses Trinity construisait directement une
consigne en prose et appelait le modele apres controle du budget. La sortie
JSON etait analysee puis soumise au selecteur de triplet, mais aucun recu ne
liait le rendu exact, son destinataire et la reponse reutilisee. Le statut
`generated` pouvait etre lu a tort comme une verification.

## Decision

Le compilateur G-CIR produit aussi un contrat `INFER` pour cette entree. Il
exige une mission, un agent et `generateHypotheses === true`, projette la
mission et les candidats fournis, consigne les autres champs omis, refuse les
projections de plus de 16 Kio et calcule le digest du prompt exact. Le budget
et la condition de plan fixe restent controles par Trinity avant compilation.

Le service de recu existant conserve le prompt, le contrat, les omissions et
la reponse. Une invocation terminee identique est reutilisee ; une invocation
en cours ou echouee n'est pas relancee implicitement. Le champ historique
`signal_id` de la table sert ici de cle de source avec un prefixe distinct
`trinity_mission:` ; son renommage attend une migration explicite.

La sortie du modele reste `unverified`, meme si ses hypotheses sont retenues
par le selecteur. Une erreur de compilation, d'inference, de parsing ou de recu
ramene au design fixe existant. Aucun resultat n'est promu en preuve ou en
effet par ce contrat.

## Consequences

### Positives

- La meme mission et le meme rendu ne consomment pas deux appels de modele
  apres un premier resultat termine.
- L'audit permet de relier le candidat au prompt exact et aux champs omis.
- La limite de taille et le repli fixe sont explicites et testes.

### Negatives

- Le recu n'atteste ni comprehension du modele ni validite experimentale.
- Le schema SQLite porte encore un nom de colonne issu du Signal Plane.
- Une invocation echouee ne se retente pas sans nouvelle politique de reprise.

## Alternatives

- Continuer avec un prompt direct : ecarte pour l'absence de visibilite et
  de deduplication auditable.
- Promouvoir les hypotheses selectionnees en faits : ecarte ; seul un test
  independant peut etayer une conclusion.
- Migrer immediatement tous les points d'entree modele : ecarte ; leurs
  permissions, sorties et verificateurs different.
