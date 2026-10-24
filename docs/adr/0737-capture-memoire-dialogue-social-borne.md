# ADR 0737 — Capturer en mémoire les dialogues sociaux résolus

- **Statut :** accepté
- **Date :** 24 octobre 2026

## Contexte

Le service de dialogue persiste les tours et exige un artefact structuré pour
clore une session, mais les participants ne retrouvent pas cette expérience lors
d'un rappel autobiographique ultérieur.

## Décision

À la clôture d'un dialogue résolu, le pont dialogue-mémoire enregistre pour
chaque participant un épisode `social_dialogue` avec la question, le résumé de
l'artefact et les références de preuve et des tours. La capture a lieu dans la
même transaction que la clôture. Elle exige une portée organisation/projet et
un résumé avec au moins une référence. Un dialogue `UNRESOLVED` ne devient pas
une expérience réussie et n'est pas capturé par ce pont.

L'épisode décrit un dialogue résolu; il ne certifie ni la vérité de l'artefact,
ni la réussite d'une action convenue. Son état `resolved_dialogue` ne satisfait
pas les règles de consolidation des leçons de succès.

## Conséquences

- Les deux participants peuvent rappeler la décision et ses références depuis
  leur mémoire autobiographique après la clôture.
- Une erreur d'écriture mémoire annule aussi la clôture, afin d'éviter un dialogue
  résolu sans sa trace d'expérience correspondante.
- SocialWorld V2 doit encore prouver livraison, réutilisation comportementale
  et résultat sur une tâche future avec des bras comparatifs.
