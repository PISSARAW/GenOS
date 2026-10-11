# 0404 — Liaison de mission et frontière de snapshot Rhizome

- **Statut** : Accepté
- **Date** : 2026-10-11
- **Domaine** : Rhizome, identité de mission, reprise

## Contexte

Le dispatch biologique disposait de l'identité de mission, mais ne la transmettait
pas à la composition Rhizome. La session prenait alors son propre identifiant comme
`missionId`. Le snapshot exige une liaison durable dans `mission_agents` entre cette
mission et l'agent du workspace ; une session nouvellement composée ne pouvait donc
pas établir cette preuve à partir du dispatch normal.

Le variant `ephemeral` ne persiste pas sa session. Les preuves de snapshot listaient
aussi certains noms d'événements qui ne sont pas émis par le service Rhizome.

## Décision

1. Le dispatch transmet son `missionId` existant à la composition Rhizome. Le
   snapshot conserve son contrôle de `mission_agents` et refuse une liaison absente.
2. La capture et la reprise topologiques de `ephemeral` sont refusées explicitement.
   Le fossile de fermeture ne remplace pas le graphe ni le journal d'une session.
3. Les preuves par variant ne citent que les événements effectivement persistés.
   La propagation procédurale, sans événement de session durable, n'est pas
   présentée comme telle dans le manifeste.

## Conséquences

Le dispatch standard peut produire une session Rhizome liée à la même mission que
ses agents lorsque cette identité existe et que leur appartenance est persistée.
Une session sans liaison reste non admissible au snapshot. La reprise collective
demeure une vérification de dérive ; elle ne restaure pas le graphe ni les effets
externes. Le runtime par capacités nécessite toujours les besoins, providers et
vérificateurs réels fournis par l'hôte.
