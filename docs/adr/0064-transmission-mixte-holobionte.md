# ADR 0064 — Transmission mixte Holobionte

## Statut

Accepté — quinzième lot du plan Holobionte.

## Contexte

Un Host de génération suivante doit conserver ses symbiontes de noyau et
adapter sa périphérie au contexte. La politique `HORIZONTAL_OK` signifie que
le symbionte est recherché dans le contexte cible plutôt que copié depuis le
parent.

## Décision

1. Construire le Host enfant par transmission verticale des contrats
   `VERTICAL_REQUIRED` et `VERTICAL_PREFERRED` autorisés par sa constitution.
2. Exclure de cette copie les contrats `HORIZONTAL_OK` et signaler qu’ils
   doivent être réacquis dans le contexte enfant.
3. Acquérir chaque entrée périphérique via le parcours horizontal : source
   prouvée, quarantaine, AEIS et admission sandbox.
4. Conserver l’identité du nouvel Host et le journal de chaque mode de
   transmission.

## Conséquences

- Le noyau hérité reste candidat jusqu’à sa propre admission.
- La périphérie externe reste propre au contexte et ne récupère pas les
  permissions de l’ancienne génération.
- Une constitution qui impose `VERTICAL_REQUIRED` refuse l’acquisition
  horizontale pour cette génération.

## Alternatives

- Copier tous les résidents puis compléter les lacunes : rejeté, car un
  contrat `HORIZONTAL_OK` ne demande pas l’héritage de son symbionte.
- Construire une transmission mixte sans réutiliser les deux parcours
  existants : rejeté, car cela dupliquerait leurs contrôles d’immunité et
  d’admission.
