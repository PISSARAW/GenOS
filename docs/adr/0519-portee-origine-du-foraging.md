# ADR 0519 — Portée d'origine et provenance du foraging

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : foraging web, reçus d'observation
- **Lié à** : ADR 0182, maturité biologique — Foraging web et fovéation

## Contexte

Le foraging pouvait suivre une URL fournie par l'appelant sans exprimer de
portée d'origine. Le reçu contenait un URL et un digest du texte, mais pas une
projection de portée directement exploitable.

## Décision

Une étape `forage_step` peut fournir `navigation_scope`, une liste d'origines
HTTP(S). Si elle est présente, une destination de foraging dont l'origine
n'appartient pas à cette liste est refusée avant l'appel de navigation. Le
reçu conserve la portée normalisée, l'origine et le chemin observés, ainsi que
le digest SHA-256 du texte observé. Les refus remontent comme résultat MCP
`out_of_scope`.

La portée est une contrainte déclarée par l'appelant de l'étape. Elle ne vaut
pas autorisation de mission authentifiée et ne limite pas les redirections ni
les requêtes secondaires dans un navigateur réel. Le test contrôlé prouve le
refus avant l'appel de navigation, sans ouvrir Chromium ni contacter de site.

## Conséquences

### Positives

- Une étape peut borner les départs à une liste explicite d'origines.
- Le reçu expose le lien entre portée demandée, page observée et contenu haché.
- Le refus peut être reproduit localement sans accès réseau externe.

### Négatives

- L'appelant choisit lui-même la portée; elle n'établit aucune identité,
  autorité ou permission de mission.
- Les redirections et sous-requêtes Chromium ne sont pas bornées par cette
  portée; une future protection navigateur doit appliquer la politique à la
  navigation effective et à ses redirections.
- Une suite navigateur réelle reste nécessaire lorsque Chromium est disponible.

## Alternatives

- Conserver seulement le contrôle des hôtes publics de l'adaptateur : ne permet
  pas de borner un parcours à une origine choisie par l'étape.
- Présenter la portée comme politique de mission : rejeté, car aucun contexte
  authentifié de mission n'est actuellement transmis à cette frontière.
