# Exécution cognitive via le client MCP

## Résumé

Lorsqu'une mission est lancée par `genos-mcp`, GenOS reste propriétaire de
l'orchestrateur et des workers. Le client MCP connecté fournit le LLM via MCP
Sampling. GenOS gouverne l'identité, le contrat, la stratégie, les budgets, les
capsules, les leases, les appels d'outils, la mémoire, les preuves et la
promotion.

```text
Client MCP (Codex, Gemini, Claude, ...)
              │ sampling
              ▼
      Orchestrateur GenOS
              │ workers contrôlés
              ▼
          Workers GenOS
              │ tools vérifiés
              ▼
          Backend GenOS
```

Le LLM externe n'est pas l'identité de l'agent. Il exécute une unité cognitive
au nom d'un agent GenOS.

## Utilisation

Un appel normal suffit :

```json
{
  "mission": "Écris une courte histoire...",
  "background": false
}
```

Le serveur MCP force alors `executor: caller_mcp`. Le provider peut être
indiqué pour la provenance avec `GENOS_MCP_PROVIDER` ou dans le champ
`provider`; il ne modifie pas les permissions.

Le client doit accepter les requêtes MCP `sampling/createMessage`. Si cette
capacité n'est pas disponible, GenOS bloque la mission avec
`MCP_SAMPLING_UNAVAILABLE`. Il n'y a pas de remplacement silencieux par Codex
ou Ollama.

## Boucle d'exécution

1. Le serveur MCP ouvre un broker local lié à `127.0.0.1`.
2. GenOS crée l'orchestrateur et son contrat.
3. Le runtime `caller_mcp` demande une génération au client hôte.
4. Si le LLM demande un outil, la demande revient au broker puis traverse le
   handler MCP normal : lease, permissions, validation des arguments, circuit
   breaker et audit.
5. Le résultat de l'outil est renvoyé au LLM dans la même boucle, limitée à 12
   tours.
6. Les workers héritent de `caller_mcp`, mais gardent chacun leur identité,
   budget, capsule, rôle et lease.
7. La barrière de preuves et la supervision GenOS décident du statut final.

## Sécurité et limites

- Le broker utilise un jeton aléatoire et écoute uniquement en boucle locale.
- Un worker ne peut pas appeler `genos_orchestrate`.
- Le client ne peut pas élargir une lease ni promouvoir directement un résultat.
- Les appels d'outils sont traités par le handler MCP GenOS, pas directement par
  le modèle.
- Une réponse du LLM ne constitue pas à elle seule une preuve valide.
- Le client doit autoriser Sampling ; MCP ne fournit pas cette capacité à tous
  les hôtes.
- Le provider appelant est tracé comme provenance, sans devenir une autorité
  GenOS.

## Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `MCP_SAMPLING_UNAVAILABLE` | Le runtime GenOS n'a pas reçu de broker | Vérifier que la mission vient de `genos-mcp` |
| Sampling refusé | Le client ne supporte pas ou n'autorise pas Sampling | Activer la capacité côté client |
| `MCP tool bridge failed` | Outil refusé ou erreur de transport | Lire l'audit et la lease de l'agent |
| Boucle limitée à 12 tours | Le modèle répète des appels d'outils | Examiner la stratégie et les preuves |

## Compatibilité

Les exécutions backend directes conservent les modes historiques `codex` et
`local`. Le mode automatique décrit ici concerne le chemin du serveur
`genos-mcp`, qui force `caller_mcp` pour que le modèle appelant soit le moteur
cognitif de la mission.
