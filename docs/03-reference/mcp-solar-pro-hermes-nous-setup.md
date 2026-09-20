# Utilisation de Solar Pro avec MCP, Hermes et le provider Nous

- **Statut** : Implémenté (configuration vérifiée le 2026-09-20).
- **Portée** : profiler Hermes `genos-v3`, config MCP binaire, provider LLM `nous` (OAuth),
  modèles disponibles, méthodes d'usage, vérifications.
- **Dernière revue** : 2026-09-20.

---

## 1. Vue d'ensemble

Ce document décrit comment Solar Pro (modèle `upstage/solar-pro4:free`) est utilisé
dans le contexte GenOS via le protocole MCP, le client Hermes et le provider `nous`
d'Hermes. Il couvre :

- le transport MCP : binaire Rust direct, pas `cargo run` ;
- l'authentification OAuth avec le provider `nous` ;
- les modèles disponibles via ce provider ;
- les trois modes d'usage (Hermes/Solar Pro, local/Ollama, Codex externe) ;
- les commandes de vérification.

Voir aussi :

- [outils-mcp.md](outils-mcp.md) — catalogue MCP, leases, validation, transports, circuit breaker.
- [modeles-providers-routage.md](modeles-providers-routage.md) — routing LLM, providers, méthodes d'usage détaillées.
- [mcp-transport-config.md](mcp-transport-config.md) — transport MCP binaire, config profil, vérification.

---

## 2. Profil Hermes `genos-v3`

### 2.1 Fichier de configuration

Le profil utilisé est :

```
C:\Users\Shadow\AppData\Local\hermes\profiles\genos-v3\config.yaml
```

Les sections pertinentes sont :

```yaml
model:
  default: upstage/solar-pro4:free
  provider: nous

mcp_servers:
  genos-v3:
    command: C:/Users/Shadow/Documents/GitHub/GenOS/target/release/genos-mcp.exe
    env:
      GENOS_WORKSPACE_ROOT: C:/Users/Shadow/Documents/GitHub/GenOS
      GENOS_MCP_EXPOSE_ALL: 'true'
```

Authentification OAuth pour le provider `nous` : stockée dans le credential store du
profil (`auth.json`), consultable via `hermes -p genos-v3 portal info`.

### 2.2 Vérification de l'authentification

```bash
hermes -p genos-v3 portal info
```

Attendu :

```
Nous Portal
  Auth:    ✓ logged in
  Portal:  https://portal.nousresearch.com
  API:     https://inference-api.nousresearch.com/v1
  Model:   ✓ using Nous as inference provider
```

---

## 3. Transport MCP — binaire Rust direct

### 3.1 Problème résolu

Le profil utilisait auparavant `cargo run` via le SDK `@modelcontextprotocol/sdk`,
ce qui produisait des hangs stdio sur Windows (tampon, détection tardive de la
fermeture du pipe client). Voir le skill
[mcp-server-troubleshooting](../skills/infrastructure/mcp-server-troubleshooting/SKILL.md).

### 3.2 Configuration actuelle

Le serveur MCP est maintenant le binaire précompilé :

```
target/release/genos-mcp.exe
```

Pas de `cargo run`, pas de wrapper Node. Le binaire parle JSON-RPC directement
sur stdin/stdout.

### 3.3 Vérification directe

Depuis `C:\Users\Shadow\Documents\GitHub\GenOS` :

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | ./target/release/genos-mcp.exe
```

Réponse attendue :

```json
{"id":1,"jsonrpc":"2.0","result":{"capabilities":{"tools":{"listChanged":false}},"instructions":"GenOS autonomous agent runtime tools.","protocolVersion":"2024-11-05","serverInfo":{"name":"genos-mcp","version":"3.0.0"}}}
```

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | ./target/release/genos-mcp.exe
```

Réponse attendue : liste de 22 outils (genos_orchestrate, genos_snapshot, genos_replay,
genos_trinity_launch, genos_a_team_preview, genos_biological_mode, genos_biomimicry…).

---

## 4. Provider LLM `nous` — Solar Pro

### 4.1 OAuth

Le provider `nous` utilise OAuth (refresh token dans le credential store du profil).
Pas de clé API à mettre dans `.env`.

### 4.2 Modèle par défaut

```
upstage/solar-pro4:free
```

C'est le modèle utilisé quand on lance Hermès avec `hermes -p genos-v3` sans
spécifier de modèle. Il est gratuit et accessible via le provider `nous`.

### 4.3 Endpoint

L'endpoint est dérivé automatiquement depuis l'auth OAuth :

```
https://inference-api.nousresearch.com/v1
```

Pas de `base_url` à configurer manuellement dans `config.yaml`.

---

## 5. Modèles disponibles via le provider `nous`

### 5.1 Gratuits (free tier)

7 modèles gratuits sont listés dans le cache de découverte
(`cache/nous_recommended_cache.json`) :

| Modèle | Source | Contexte |
| --- | --- | --- |
| `upstage/solar-pro4:free` | local | — |
| `meituan/longcat-2.0:free` | local | — |
| `inclusionai/ling-3.0-flash-sante:free` | openrouter | 262 144 |
| `inclusionai/ling-3.0-flash-fin:free` | openrouter | 262 144 |
| `poolside/laguna-s-2.1:free` | openrouter | 262 144 |
| `stepfun/step-3.7-flash:free` | local | — |
| `poolside/laguna-xs-2.1:free` | openrouter | 262 144 |

### 5.2 Payants (informations, hors périmètre gratuit)

16 modèles payants sont aussi listés (ex : `z-ai/glm-5.3:US`, `openai/gpt-6-astra`).
Ils ne sont pas concernés par l'usage gratuit documenté ici.

---

## 6. Méthodes d'usage

### 6.1 Méthode 1 : session Hermès par défaut (Solar Pro)

```bash
hermes -p genos-v3
```

- MCP : binaire `genos-mcp.exe` direct.
- Provider LLM : `nous` (OAuth).
- Modèle : `upstage/solar-pro4:free`.
- Outils MCP GenOS : disponibles via MCP.

C'est la méthode par défaut quand on parle à l'agent via cette conversation.

### 6.2 Méthode 2 : changer de modèle gratuit dans une session

Dans le chat Hermès :

```
/model meituan/longcat-2.0:free
```

ou :

```
/model inclusionai/ling-3.0-flash-sante:free
```

ou :

```
/model poolside/laguna-s-2.1:free
```

ou pour revenir à Solar Pro :

```
/model upstage/solar-pro4:free
```

Cela bascule le modèle de la session courante sans modifier la config.

### 6.3 Méthode 3 : lancer Hermès sur un autre modèle gratuit

Au lancement :

```bash
hermes -p genos-v3 -m meituan/longcat-2.0:free
hermes -p genos-v3 -m inclusionai/ling-3.0-flash-sante:free
hermes -p genos-v3 -m poolside/laguna-s-2.1:free
```

Écrase le default pour la session. Au redémarrage sans `-m`, c'est
`upstage/solar-pro4:free` qui revient.

### 6.4 Méthode 4 : mode local (Ollama)

```bash
hermes -p genos-v3 -m qwen3.8 --provider ollama-launch
```

ou dans le chat :

```
/model qwen3.8
```

avec le provider ramené sur `ollama-launch`.

Cela utilise `http://127.0.0.1:11434/v1` et les modèles installés localement
dans Ollama. Le MCP GenOS reste le même (binaire local), mais l'inférence
n'est plus routée via le provider `nous`.

### 6.5 Méthode 5 : Codex (hors hermès)

Codex est un autre agent, externe à ce profil. Il ne passe pas par Hermès ni
par le profil `genos-v3`. Le modèle Codex est contrôlé par Codex lui-même.

Lien avec GenOS : l'opérateur lance Codex pour certaines tâches, Hermès pour
d'autres, Ollama pour du local. Le dépôt GenOS ne force pas le choix ; il
documente ce qui est actif quand Hermès est utilisé avec le profil `genos-v3`.

---

## 7. Fichier `.mcp.json` du dépôt

Fichier : `C:\Users\Shadow\Documents\GitHub\GenOS\.mcp.json`

```json
{
  "mcpServers": {
    "genos": {
      "command": "target/release/genos-mcp.exe",
      "env": {
        "GENOS_MCP_LEASE": "genos_snapshot,genos_replay,genos_execute_primitive"
      }
    }
  }
}
```

C'est la configuration projet. Le profil Hermes a priorité quand Hermès est lancé
avec `-p genos-v3`. Le `.mcp.json` est la fallback projet quand un client MCP lit
le dépôt directement.

---

## 8. Limitations et garde-fous

- Le provider `nous` gratuit expose 7 modèles à ce stade. Si un modèle n'est plus
  listé côté Portal, il faut relancer la découverte ou passer à un autre modèle
  encore présent.
- Solar Pro via `nous` n'est pas un modèle local. Il dépend de l'auth OAuth et de
  l'endpoint `inference-api.nousresearch.com`. Si l'auth expire, la session renvoie
  une erreur d'authentification, pas une fallback silencieuse vers Ollama.
- Le mode local Ollama est indépendant. Un modèle présent dans Ollama n'est pas
  automatiquement disponible via le provider `nous`. Les deux listes sont distinctes.
- Les méthodes documentées ici couvrent les voies réellement utilisables sans
  modifier le code. Toute autre voie (édition manuelle du YAML, variables non
  documentées) est hors périmètre jusqu'à vérification.

---

## 9. Voir aussi

- [outils-mcp.md](outils-mcp.md) — catalogue, leases, validation, transports, circuit breaker.
- [modeles-providers-routage.md](modeles-providers-routage.md) — providers, modèles, routage codex/hermes/local.
- [mcp-transport-config.md](mcp-transport-config.md) — transport MCP binaire, config, vérification.
- [CONVENTIONS.md](../CONVENTIONS.md) — conventions de documentation.
- Skill `mcp-server-troubleshooting` — diagnostic stdio et binaire vs SDK.
