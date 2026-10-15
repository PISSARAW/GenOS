# ADR 0525 — Authentifier la provenance du foraging

- **Statut** : Accepté pour les reçus Foraging MCP
- **Date** : 2026-10-15
- **Domaine** : foraging web, provenance des observations
- **Lié à** : ADR 0182, ADR 0519, maturité biologique — Foraging web et fovéation

## Contexte

Le reçu Foraging liait le texte observé à un digest et enregistrait la portée
de navigation, mais n'authentifiait pas le producteur qui revendiquait cette
observation. Le chemin MCP reçoit les arguments de l'appelant sans contexte de
mission authentifié transmis par le dispatcher.

## Décision

L'action `forage_step` exige un `source_attestation` Ed25519 et un `mission_id`.
L'hôte épingle les clés publiques des producteurs dans
`GENOS_FORAGING_TRUST_JSON`; les arguments d'appel ne peuvent pas ajouter une
clé à cette confiance. Les claims versionnés lient l'identité du producteur,
la mission, les origines normalisées autorisées, l'origine et le chemin
observés, le digest du texte, ainsi que le digest du HTML fourni quand il est
présent. La signature est vérifiée avant navigation et le texte final est
comparé après extraction. Une observation dont le digest ne correspond pas
n'est pas retournée. Le reçu conserve la preuve signée et lie son digest dans
`evidenceRef`.

Une source inconnue, une altération du payload, une signature incorrecte, une
portée différente ou une preuve signée pour une autre mission est refusée.
Les observations de foraging non authentifiées ne sont pas acceptées par le
handler MCP.

## Conséquences

### Positives

- Le contenu exposé par cette action MCP peut être retracé à une clé publique
  de producteur configurée par l'hôte.
- La preuve lie le producteur, la mission revendiquée, la portée et le digest
  du texte observé; un rejeu vers une mission différente échoue.
- Les fixtures synthétiques peuvent exercer le contrat sans site externe.

### Négatives

- `mission_id` vient actuellement des arguments MCP. Sa signature prouve que le
  producteur l'a revendiqué, mais pas que le dispatcher l'a autorisé comme
  mission active. Le raccordement à une identité de mission authentifiée reste
  nécessaire avant toute promotion de cette autorité.
- Une clé publique dans l'environnement n'est fiable que si le déploiement la
  protège. La configuration ne prouve pas l'attestation matérielle du
  navigateur ni la vérité d'une page Web.
- Le chemin navigateur réel n'a pas été exécuté dans cet environnement,
  Chromium étant indisponible. Les tests utilisent seulement du HTML synthétique
  et rapportent le résultat comme simulé.

## Vérification

- `backend/src/services/foragingSourceAttestation.js`
- `backend/src/services/mcpBioTools/handlers/optimalForaging.js`
- `backend/tests/test_foraging_source_attestation.js`
- `backend/tests/test_foraging_scope.js`

## Alternatives

- Considérer le digest calculé localement comme une preuve d'origine : rejeté,
  car un digest ne révèle pas qui a produit le contenu.
- Accepter une clé publique fournie avec l'observation : rejeté, car
  l'appelant pourrait alors authentifier sa propre source sans confiance
  préalable de l'hôte.
