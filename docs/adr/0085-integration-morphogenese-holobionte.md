# ADR 0085 — Intégration de Morphogenèse au Holobionte persistant

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, Morphogenèse, identité, capacités résidentes
- **Décideurs** : GenOS
- **Lié à** : ADR 0078, ADR 0080, ADR 0084

## Contexte

La reconfiguration morphogénétique est pertinente lorsque le Host a une identité
persistante et dispose déjà de capacités résidentes réutilisables entre missions.
Sans cette continuité, activer la morphogenèse Holobionte ne ferait que replanifier
un assemblage ponctuel.

## Décision

Le pont n'active le planner Morphogenèse que si le Host a une portée persistante,
une constitution, au moins deux missions liées et une capacité fournie par un
symbionte résident. Il passe les capacités connues et le budget au planner existant.
Les cas qui ne remplissent pas les conditions retournent une raison d'inéligibilité
sans créer de transition.

## Conséquences

### Positives

- La reconfiguration s'appuie sur l'identité et les capacités réellement conservées.
- Les Hosts mission-scoped ne déclenchent pas le planner persistant.
- Le pont prépare un plan sans appliquer la transition.

### Négatives

- L'historique de missions doit être lié au Host de façon persistante.
- Les capacités déclarées par les symbiontes doivent rester synchronisées avec les contrats.

## Alternatives

- Reconfigurer dès chaque nouvelle mission : rejeté, car cela ne tient pas compte de
  la continuité ni des organes déjà résidents.
