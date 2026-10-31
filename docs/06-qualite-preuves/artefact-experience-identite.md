# Artefact des expériences d'identité

Les expériences d'identité de type `specialist` conservent une exigence dédiée :
une réponse `success` doit contenir un `artifactText` non vide, avec des balises
d'artefact reconnues. Cette exigence ne doit pas être retirée avec les contraintes
des workers génériques en lecture seule.

Une réponse `unresolved` peut omettre l'artefact afin de ne pas inventer un résultat.
Lorsqu'elle en fournit un, son format doit rester valide. Le test
`test_identity_experiment_prompt_treatment.js` valide ces cas avec AJV au lieu de
supposer l'absence d'une branche conditionnelle dans le schéma.
