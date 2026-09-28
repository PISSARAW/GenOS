# GenOS dans Antigravity

Cette intégration utilise le transport MCP `stdio` officiellement pris en charge
par Antigravity. Elle expose le serveur Node GenOS depuis le dépôt et conserve
le fail-closed de GenOS : le bail par défaut n'autorise que `genos_snapshot`.

Depuis la racine du dépôt, lancer :

```bash
node integrations/antigravity/configure-mcp.cjs
```

Le script fusionne l'entrée `genos` dans `.agents/mcp_config.json` sans retirer
les autres serveurs. Ajouter des outils au bail uniquement après revue de leur
permission et de leurs effets. Pour préparer une configuration sans écrire le
fichier, utiliser `--print`.

La configuration compatible prouve le branchement au protocole MCP, pas une
certification de l'IDE ni la réussite d'une session Antigravity installée. Le
contrat `genos.ide/v1`, l'authentification du compte Google et les fonctionnalités
propres à l'éditeur ne sont pas revendiqués par cette intégration.

Références du protocole : [MCP Antigravity](https://antigravity.google/docs/mcp)
et [plugins Antigravity](https://antigravity.google/docs/plugins).
