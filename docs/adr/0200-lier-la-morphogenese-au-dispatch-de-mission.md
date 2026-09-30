# ADR 0200 — Lier Morphogenèse au dispatch réel d’une mission

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Orchestration, Morphogenèse, exécution des workers
- **Lié à** : ADR 0076, ADR 0101, ADR 0108

## Contexte

Le plan Morphogenèse de mission était calculé à partir d’un état d’agents vide,
de l’organisation (qui n’est pas une topologie), d’un budget aplati et d’une
pression constante. Le graphe proposé n’était ensuite pas lié aux affectations
que le dispatcher envoyait réellement.

## Décision

- Le plan Morphogenèse reçoit l’identifiant et le texte de la mission, son profil
  stratégique, les affectations retenues, le budget de tokens et les informations
  de topologie fournies par la mission. L’organisation reste un champ distinct.
- Le planner inscrit les affectations réelles dans la racine du graphe de mission.
  Au dispatch, les affectations sont d’abord bornées par la politique de fan-out,
  puis le dispatcher prend sa liste depuis cette racine et enregistre un reçu de
  liaison avec la version du graphe.
- Un graphe sans racine valide bloque le dispatch. Si le planner échoue avant de
  produire un graphe, le runtime émet un événement d’échec et garde le chemin
  d’affectations déjà validé par le plan d’autonomie.
- Le graphe reste une proposition de planification. Cette liaison n’exécute pas
  une transition de topologie, ne contourne pas les contrats Trinity/A-Team et
  ne remplace pas les autorisations du noyau Rust ou de la gouvernance.

## Conséquences

- Le graphe et le dispatch portent les mêmes affectations après application des
  limites opérationnelles de la mission.
- Le reçu de liaison permet de rapprocher la mission, le graphe, sa version et les
  workers effectivement prévus.
- La sélection et l’exécution de nouvelles topologies restent limitées aux
  adaptateurs et gates déjà disponibles.
