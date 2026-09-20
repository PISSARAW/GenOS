# Transport et configuration MCP dans GenOS

- **Statut** : Implémenté.
- **Portée** : serveur MCP stdio, transport binaire Rust vs SDK Node, configuration
  du profil Hermes `genos-v3` et du fichier `.mcp.json` du dépôt, vérification
  directe du serveur.
- **Dernière revue** : 2026-09-20.

---

## 1. Occupation

Ce document décrit comment le serveur MCP de GenOS est transporté et configuré
lorsqu'on utilise le profil `genos-v3` d'Hermès. Il détaille le passage du mode
`cargo run` (instable sur Windows) au binaire précompilé `genos-mcp.exe`, et
donne les commandes pour vérifier que le transport répond.

Pour le catalogue d'outils, les leases et la gouvernance, voir
[outils-mcp.md](outils-mcp.md). Pour les modèles, providers et méthodes
d'utilisation, voir [modeles-providers-routage.md](modeles-providers-routage.md).

---

## 2. Problème initial : `cargo run` + SDK Node

Le profil Hermes utilisait auparavant cette configuration :

```yaml
mcp_servers:
  genos-v3:
    command: cargo
    args:
      - run
      - --quiet
      - --manifest-path
      - C:/Users/Shadow/Documents/GitHub/GenOS/crates/genos-mcp/Cargo.toml
    env:
      GENOS_WORKSPACE_ROOT: C:/Users/Shadow/Documents/GitHub/GenOS
      GENOS_MCP_EXPOSE_ALL: 'true'
```

Ce mode lance `cargo run` à chaque connexion MCP. Sur Windows, combiné au SDK
`@modelcontextprotocol/sdk`, cela produit des hangs stdio : le serveur bloque sur
la lecture de l'entrée standard et ne répond pas, même quand le client a envoyé
un message complet et fermé son côté écriture du pipe.

Ce comportement est documenté dans le skill
[mcp-server-troubleshooting](../skills/infrastructure/mcp-server-troubleshooting/SKILL.md).

---

## 3. Solution : binaire direct

Le fichier binaire existe déjà :

```
target/release/genos-mcp.exe  (605 Ko, compilé)
```

Le profil `genos-v3` pointe maintenant dessus :

```yaml
mcp_servers:
  genos-v3:
    command: C:/Users/Shadow/Documents/GitHub/GenOS/target/release/genos-mcp.exe
    env:
      GENOS_WORKSPACE_ROOT: C:/Users/Shadow/Documents/GitHub/GenOS
      GENOS_MCP_EXPOSE_ALL: 'true'
```

Pas de champs `args`. Le binaire parle JSON-RPC directement sur stdin/stdout.

### Pourquoi le binaire est stable

Le binaire Rust utilise `std::io::stdin()` / `std::io::stdout()` comme
descripteurs bruts. Le wrapper SDK Node (`StdioServerTransport`) utilisait des
flux Node avec tampon interne et backpressure, qui sur Windows ne détectent pas
toujours la fermeture du pipe côté client. En contournant le SDK, on supprime
la couche qui bloquait.

---

## 4. Fichier `.mcp.json` du dépôt

Le dépôt contient aussi sa propre configuration MCP :

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

Ce fichier est la config projet. Le profil Hermes a priorité quand Hermès est
lancé avec `genos-v3`, mais le `.mcp.json` sert de fallback quand un client MCP
lit le dépôt directement.

---

## 5. Vérification directe

Depuis le dépôt :

```bash
cd C:/Users/Shadow/Documents/GitHub/GenOS

# INIT
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | ./target/release/genos-mcp.exe

# tools/list
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | ./target/release/genos-mcp.exe
```

L'INIT doit renvoyer `serverInfo.name = "genos-mcp"` et
`protocolVersion = "2024-11-05"`. `tools/list` expose les 22 outils du serveur
Rust.

Une fois ces deux commandes passées, le transport est considéré comme stable.

---

## 6. Voir aussi

- [outils-mcp.md](outils-mcp.md) — catalogue, leases, validation, transports,
  circuit breaker.
- [modeles-providers-routage.md](modeles-providers-routage.md) — modèles, providers,
  méthodes d'utilisation.
- Skill `mcp-server-troubleshooting` — diagnostic stdio et binaire vs SDK.
