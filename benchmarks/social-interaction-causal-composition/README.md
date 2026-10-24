# Social Interaction Causal Composition

Benchmark déterministe du raccordement des cinq dimensions de décision
sociale : topologie, variant, type d'agent, relation et objectif/checkpoint.

## Exécution

Depuis la racine du dépôt :

```bash
node backend/tests/test_social_interaction_causal_composition.js
```

Le benchmark utilise SQLite en mémoire, des relations synthétiques et le moteur
de communication du backend en mode shadow. Aucun fournisseur de modèle n'est
appelé. Les messages, l'audience candidate et les règles de base restent fixes ;
chaque expérience modifie une dimension puis une combinaison. Le résultat
attendu est explicite : les refus topologiques ou de canal deviennent SILENCE,
la confiance de domaine change l'ordre des destinataires admissibles et un
checkpoint de blocage produit une intention (objectif, risque, action requise)
différente d'un checkpoint de clôture. Les décisions SIGNAL et SILENCE
correspondantes sont aussi couvertes par
`test_communication_checkpoint_live_team.js`.

## Portée de la preuve

| Dimension | Intervention déterministe | Effet attendu |
| --- | --- | --- |
| Topologie | Restreindre les scopes permis | `SIGNAL` devient `SILENCE` |
| Variant | Changer le variant contre le policy variant | Refus avec motif de mismatch |
| Type d'agent | Retirer `SIGNAL` du manifeste | Refus de canal |
| Relation | Modifier la confiance de domaine | Nouvel ordre des destinataires |
| Objectif | `BLOCKER_DETECTED` versus `MISSION_COMPLETED` | Intention et action requise différentes |

La combinaison type + variant vérifie qu'une permission de canal ne contourne
pas un refus topologique.

Un PASS prouve uniquement que les mécanismes testés transmettent les variations
jusqu'aux décisions prévues et que le cas combiné reste bloqué. Il ne mesure ni
la justesse sémantique d'un modèle, ni la durabilité réelle des interactions,
ni la supériorité de GenOS face à AgentSociety, Project Sid ou Concordia. Ces
comparaisons exigent des adaptateurs publiés et des conditions d'expérience
équivalentes.
