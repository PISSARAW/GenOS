# 0100 — Contrôle écologique de Biocénose

- **Statut** : Accepté
- **Date** : 2026-09-25
- **Domaine** : Biocénose, runtime, observabilité, Morphogenèse
- **Décideurs** : GenOS
- **Lié à** : [ADR 0089](0089-gates-decision-biocenose.md), [ADR 0090](0090-variants-executables-biocenose.md), [topologie Biocénose](../02-orchestration/topologies/biocenose.md)

## Contexte

Le runtime exécute les étapes de délibération et mesure déjà l'indépendance, les claims,
le dissent, la vérification et le jugement. Ces résultats n'étaient pas réunis dans une
observation écologique unique après le tour. L'adaptateur Morphogenèse, lui, ne reçoit
que des signaux de jugement explicitement fournis.

## Décision

- Après un tour terminé ou arrêté à la limite constitutionnelle, le runtime construit
  une observation à partir des reçus des étapes et du jugement persisté.
- Le contrôleur classe le prochain pas parmi les handoffs déjà connus, la préservation
  du dissent, la poursuite de la vérification, la demande d'avis indépendants, la collecte
  de données d'indépendance, l'escalade de limite ou l'absence d'action.
- Une recommandation de transition existante est jointe à l'observation. Elle reste une
  recommandation ; le contrôleur ne modifie ni la constitution, ni le variant, ni la
  composition de la communauté.
- Chaque décision est enregistrée dans le journal append-only sous
  `ECOLOGICAL_CONTROL_DECISION`.
- Une indépendance non mesurée reste distincte d'une indépendance faible. Sans historiques
  d'erreurs alignés, le contrôleur demande des données au lieu d'inférer une monoculture.

## Conséquences

### Positives

- Les indicateurs du tour deviennent un résultat structuré et auditable.
- Les limites des capacités présentes sont visibles dans l'action proposée.
- Morphogenèse reçoit le signal déjà supporté par son adaptateur sans changement implicite
  de topologie.

### Négatives

- Le contrôleur n'exécute pas encore le recrutement adaptatif, le reblind, le split/merge
  ou le changement de variant.
- Les actions autres que les handoffs Morphogenèse restent des recommandations à traiter
  par l'intégration appelante.

## Alternatives

- Automatiser le recrutement ou le changement de variant dans ce lot : rejeté, car aucune
  transaction ne liait encore ces mutations aux preuves du tour et à la constitution active.
- Ne rien persister : rejeté, car les décisions écologiques doivent être vérifiables et
  reproductibles à partir de l'historique de la session.
