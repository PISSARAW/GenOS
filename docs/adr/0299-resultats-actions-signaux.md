# ADR 0299 — Résultats réels des actions de récepteur

- Statut : accepté
- Date : 2026-10-04
- Domaine : Signal Plane, actions déterministes

## Contexte

Une action `update_agent` était marquée exécutée même si l'agent avait disparu.
Une action `change_organization` était également marquée exécutée lorsque la
topologie demandée était déjà active. Ces faux positifs empêchaient l'escalade
cognitive et renforçaient la plasticité à tort. La limite de 120 signaux par
minute ne se réinitialisait pas à la fin de sa fenêtre.

## Décision

Le résultat du `UPDATE` d'agent et le champ `changed` de la transition
d'organisation déterminent désormais `executed`. Une action sans changement
reste observable mais ne constitue pas une action utile. La fenêtre de débit
se réinitialise à son échéance réelle.

## Conséquences

Une action nulle peut faire entrer le signal dans la file cognitive durable.
Le débit est borné par processus, conformément au mécanisme actuel en mémoire.

## Alternatives

Compter l'invocation de la fonction comme exécution aurait masqué les échecs
et les transitions nulles.
