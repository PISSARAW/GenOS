# ADR 0750 — Identité persistante du client MCP Codex

- **Statut** : accepté.
- **Date** : 2026-10-28.

## Contexte

Le hook Codex calcule un identifiant de session local pour les checkpoints, mais
ne crée pas de ligne dans `agents` et ne peut pas modifier l'environnement du
processus MCP déjà lancé. Les appels directs à l'organisation exigent pourtant
`GENOS_AGENT_ID` attesté par le processus. Seuls les runtimes d'orchestration et
de worker injectaient auparavant cette variable.

## Décision

Le profil Codex local active un bootstrap différé à la première requête d'outil.
Si une identité est déjà configurée, le MCP vérifie qu'elle existe dans `agents`
et reprend son parent autorisé. Sinon, le MCP crée par insertion idempotente un
agent GenOS dans le workspace configuré : un orchestrateur racine si aucun parent
de confiance n'est fourni, ou un worker enfant de `GENOS_ORCHESTRATOR_AGENT_ID`
si le runtime l'a fourni. L'identifiant est déterministe par workspace et parent,
et les métadonnées marquent son propriétaire `codex-mcp`. Une collision avec un
agent non géré est refusée.

Le bootstrap ne s'exécute pas au chargement du catalogue. Le parent n'est jamais
pris dans les arguments d'un tool call. Les actions d'organisation sans parent
explicite utilisent l'identité d'orchestrateur configurée ou créée ; une demande
explicite vers un autre périmètre reste soumise aux contrôles d'appartenance
existants. Un runtime en mode worker sans parent échoue fermé.

## Cycle de vie et portée

- **Pour qui** : le client Codex du workspace comme principal de service, partagé
  par les processus MCP utilisant la même base, le même workspace et le même parent.
- **Pourquoi** : lier les appels directs à un agent réellement enregistré et à
  un périmètre vérifiable.
- **Où** : la base GenOS configurée, dans le workspace local, ou sous le workspace
  du parent de confiance.
- **Quand et combien de fois** : au premier tool call de chaque processus ; une
  seule ligne durable par couple base/workspace/parent, réutilisée après redémarrage.
- **Durée** : sans TTL, jusqu'à révocation opérateur. Retirer le profil ne supprime
  pas la ligne. Il faut désactiver le bootstrap ou le bail avant de supprimer la ligne,
  sinon elle sera recréée au prochain appel.
- **Autorité** : un agent racine ne peut consulter que sa propre organisation ; un
  worker est limité par `parent_agent_id` et les règles d'appartenance métier.

L'ID de session du hook reste distinct : il sert aux checkpoints et aux preuves,
pas à l'authentification organisationnelle. Le bail MCP ne confère pas à lui seul
un accès à un autre orchestrateur.
