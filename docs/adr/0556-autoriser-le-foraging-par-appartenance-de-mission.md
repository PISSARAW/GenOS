# ADR 0556 — Autoriser le foraging par appartenance à la mission

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Domaine** : MCP, biomimétisme, navigateur, autorité, provenance
- **Décideurs** : GenOS
- **Lié à** : ADR 0182, 0531

## Contexte

`forage_step` exige une attestation Ed25519 qui lie la source à un `mission_id`.
Cette signature authentifie le producteur et ses claims, mais le champ de mission
était auparavant seulement fourni par l'appelant. Un agent pouvait donc présenter
une attestation valide sans démontrer qu'il était autorisé à agir dans cette
mission. La vérification doit précéder toute navigation.

## Décision

Le handler transmet le principal authentifié jusqu'à l'outil bio, y compris sur
la voie de transport locale MCP. Avant de vérifier l'attestation et avant tout
appel de navigation, le service exige un `agentId`, une mission active et une
affectation persistée de cet agent à cette mission. Si le contexte authentifié
contient des identifiants d'organisation ou de projet, ils doivent correspondre
à l'espace de travail de l'agent affecté. L'absence de principal, d'identifiant
de mission ou d'affectation entraîne un refus fermé.

La signature Ed25519 doit toujours lier exactement le même identifiant de mission.
L'appartenance autorise l'agent à participer à la mission; elle ne certifie ni la
vérité de la page, ni la qualité du navigateur, ni la sûreté de la destination,
qui restent contrôlées par les validations et preuves distinctes.

## Conséquences

### Positives

- Un `mission_id` fourni par l'appelant ne suffit plus à autoriser le foraging.
- Le contrôle d'appartenance et de tenant intervient avant tout effet navigateur.
- Le principal est conservé dans les routes MCP bio au lieu d'être perdu lors du
  dispatch local.

### Négatives

- Les tests et les appels locaux de `forage_step` doivent fournir un principal
  authentifié et une affectation de mission active.
- La consultation de l'autorité dépend de la disponibilité du store SQLite.

## Alternatives

- Faire confiance au `mission_id` signé seulement : rejeté, car une signature de
  producteur ne prouve pas l'autorisation du demandeur.
- Comparer uniquement le tenant : rejeté, car plusieurs agents peuvent partager
  un espace de travail sans être affectés à la mission concernée.
- Autoriser le foraging si la base est indisponible : rejeté, car une erreur de
  persistance ne constitue pas une preuve d'appartenance.
