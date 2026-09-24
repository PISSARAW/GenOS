# ADR 0095 — Admission de croissance dans le runtime Rhizome

- **Statut** : Proposé
- **Date** : 2026-09-24
- **Domaine** : Rhizome, croissance, providers, vérification, persistance
- **Décideurs** : GenOS
- **Lié à** : ADR 0051, ADR 0086

## Contexte

Le tick Rhizome peut détecter un gap et sélectionner un candidat de croissance,
mais cette proposition ne modifie pas encore le graphe. Une mutation directe depuis
le candidat contournerait la résolution du provider, l'admission de capacité et la
vérification de confiance.

## Décision proposée

Le runtime doit résoudre le candidat dans un registre de providers de confiance,
faire vérifier la capacité par un verifier autorisé, puis ajouter le nœud, ses
arêtes et son admission dans une mutation persistante unique. Le plan doit être
refusé si la version du graphe a changé depuis son calcul. Après admission, le tick
recalcule la route vers le besoin.

L'implémentation actuelle introduit ces gates pour la croissance enregistrée et
la rend opt-in par configuration runtime. Elle ne prétend pas encore fournir les
adapters concrets de tous les types de providers, ni exécuter automatiquement la
route obtenue.

## Conséquences

### Positives

- Un candidat non vérifié ne crée ni n'active de nœud.
- La version du graphe empêche l'application d'un plan devenu obsolète.
- Nœud, arêtes et admission sont persistés dans une seule mutation de session.

### Négatives

- L'application doit enregistrer des adapters provider et verifier de confiance.
- L'exécution de la route après admission reste un lot distinct.

## Alternatives

- Passer `execute` et `verify` à chaque tick : rejeté comme configuration répétitive
  et trop facile à omettre.
- Activer tout candidat dès sa sélection : rejeté car une proposition de croissance
  ne constitue pas une preuve de capacité.
