# ADR 0180 — Consommer le workspace global dans le chemin de mission

- **Statut** : Accepté
- **Date** : 2026-09-30
- **Domaine** : Runtime Node, planification de mission
- **Décideurs** : GenOS maintainers
- **Lié à** : `docs/01-concepts/indicateurs-fonctionnels.md`, `docs/06-qualite-preuves/plan-validation-indicateurs.md`

## Contexte

Le helper `globalWorkspaceService` sélectionne et diffuse des contenus, mais le
chemin de production de mission ne le consommait pas. Des tests unitaires de ce
helper n'établissaient donc ni sa disponibilité dans le runtime ni son usage par
le planificateur.

## Décision

Le démarrage d'une mission soumet son texte au workspace global avec les
récepteurs `planning`, `execution` et `reporting`. Les reçus indiquent
l'admission, l'ignition, la disponibilité et la consommation sans recopier le
contenu utilisateur dans la télémétrie. La planification lit le contenu livré
par le récepteur autorisé et retombe sur le texte de mission si le signal est
indisponible.

## Conséquences

### Positives

- Le service de workspace est appelé dans le chemin `planMission` de production.
- L'usage par le planificateur et les autres récepteurs est observable dans le
  contexte et dans un reçu sans texte sensible.
- L'indisponibilité ne bloque pas la mission et ne se transforme pas en succès.

### Négatives

- Cette intégration ne démontre pas un bénéfice causal sur les résultats de
  mission ; il faut encore un protocole comparatif avec diffusion ablatée.
- Les récepteurs `execution` et `reporting` attestent ici leur consommation du
  même contenu de mission ; leur influence comportementale doit être mesurée
  dans les lots expérimentaux suivants.

## Alternatives

- Laisser le workspace comme helper expérimental : rejeté, car cela ne satisfait
  pas l'exigence de raccordement à la production.
- Modifier les permissions ou les leases pour élargir la diffusion : rejeté,
  car le workspace ne doit pas changer l'autorité des outils.
