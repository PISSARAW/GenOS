# ADR 0410 — Reprise publique liée à la communauté Biocénose

- **Statut** : accepté
- **Date** : 2026-10-11
- **Domaine** : Biocénose, MCP, identité de session
- **Lié à** : [ADR 0402](0402-execution-publique-explicite-biocenose.md)

## Contexte

Le cycle persistant sait relire ses reçus et reprendre après un refus ou une
interruption. L'opération publique initiale recréait cependant une communauté
à chaque appel. Un simple `communityId` ne prouve ni l'autorité du demandeur
ni l'identité de la constitution à laquelle appartiennent les reçus.

## Décision

La première exécution explicite remet un `resumeToken` aléatoire au demandeur.
Seule son empreinte SHA-256 est enregistrée avec l'identifiant de communauté,
l'identifiant d'orchestrateur, la mission, la question et la constitution.
La reprise exige `community_id`, `resume_token`, `expected_revision` et le même
orchestrateur. Le service relit l'état SQLite et rejette une identité, une
constitution, une question, un variant ou une révision discordants avant
d'invoquer le runtime. La reprise n'appelle pas la formation ni la création
d'une communauté. Le bail runtime et le journal conservent leur contrôle
d'exclusivité et d'intégrité.

Le MCP Node garde son chemin `dispatch_biological` et exécute cette demande
au premier plan afin de retourner le reçu ou le refus. Le jeton est une
capacité sensible : son détenteur peut demander une reprise pour cet
orchestrateur. Le résultat d'échec après une première préparation restitue
le jeton une seule fois et la révision courante, sans annoncer de jugement
validé. L'absence de modèle, d'oracle ou d'autorité humaine reste bloquante.

## Conséquences

- Une révision périmée exige une nouvelle inspection de la communauté ; elle
  ne déclenche aucun nouveau vote.
- Les communautés créées avant cette décision ne disposent pas de jeton et
  ne sont pas reprises par ce contrat public.
- La reprise d'une communauté par un autre orchestrateur et l'injection
  d'oracles ou de validateurs externes exigent des contrats d'autorité séparés.
- Le pont MCP envoie la demande de reprise au CLI par `stdin`, sans placer le
  jeton dans les arguments du processus. Cette protection limite sa visibilité
  dans la liste des processus ; le client MCP détenteur du jeton reste
  responsable de sa confidentialité.
