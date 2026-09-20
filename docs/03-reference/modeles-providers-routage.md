# Modèles, providers et routage dans GenOS

- **Statut** : Implémenté.
- **Portée** : configuration du provider LLM `nous` (OAuth), modèles disponibles
  (gratuits et payants), routage par contexte (Codex / Hermès / Local), cinq
  méthodes d'utilisation sans modifier le code.
- **Dernière revue** : 2026-09-20.

---

## 1. Occupation

Ce document décrit comment le profil `genos-v3` d'Hermès est configuré pour
utiliser Solar Pro via le provider `nous`, quels autres modèles gratuits sont
disponibles, et comment passer d'un mode à l'autre (Codex, Hermès, Local)
sans toucher au code.

Pour le transport MCP (binaire vs SDK, configuration, vérification), voir
[mcp-transport-config.md](mcp-transport-config.md). Pour le catalogue d'outils
et la gouvernance, voir [outils-mcp.md](outils-mcp.md).

---

## 2. Trois modes d'usage

L'opérateur n'utilise pas un seul modèle. Il change de source selon ce qu'il est
en train de faire.

| Mode | Provider | Modèle par défaut | Où ça se configure |
| --- | --- | --- | --- |
| **Codex** | codex | celui choisi par l'opérateur dans Codex | hors GenOS, propre à Codex |
| **Hermès (moi)** | `nous` (OAuth) | `upstage/solar-pro4:free` | `config.yaml` du profil genos-v3 |
| **Local** | `ollama-launch` | `qwen3.8` (ou autre choisi) | `config.yaml` du profil ou `/model` |

Règle simple :
- Codex pilote quand on lance une mission avec Codex.
- Solar Pro via `nous` quand on parle à l'agent Hermes (cette conversation).
- Ollama quand on demande explicitement du local.

Ce document se concentre sur le mode Hermès/Nous.

---

## 3. Provider LLM : nous (OAuth)

### État de l'authentification

Le profil `genos-v3` a déjà un token OAuth pour le provider `nous`. La commande :

```bash
hermes -p genos-v3 portal info
```

donne :

```
Nous Portal
  Auth:    ✓ logged in
  Portal:  https://portal.nousresearch.com
  API:     https://inference-api.nousresearch.com/v1
  Model:   ✓ using Nous as inference provider
```

Le refresh token est stocké dans le credential store du profil (hors de portée
directe du filesystem, c'est voulu). Il est consommé par les outils internes
d'Hermès.

### Configuration du profil

Après correction, la section `model` du profil est :

```yaml
model:
  default: upstage/solar-pro4:free
  provider: nous
```

Pas de `base_url` explicite : Hermes déduit l'endpoint depuis l'auth OAuth du
provider `nous` (endpoint officiel `https://inference-api.nousresearch.com/v1`).

---

## 4. Modèles disponibles via le provider `nous`

### Gratuits (free tier)

Le cache de découverte du provider `nous` répertorie 7 modèles gratuits :

| Modèle | Source | Contexte |
| --- | --- | --- |
| `upstage/solar-pro4:free` | local | — |
| `meituan/longcat-2.0:free` | local | — |
| `inclusionai/ling-3.0-flash-sante:free` | openrouter | 262 144 |
| `inclusionai/ling-3.0-flash-fin:free` | openrouter | 262 144 |
| `poolside/laguna-s-2.1:free` | openrouter | 262 144 |
| `stepfun/step-3.7-flash:free` | local | — |
| `poolside/laguna-xs-2.1:free` | openrouter | 262 144 |

Chacun est utilisable sans clé API supplémentaire, car l'authentification passe
par le token OAuth du provider `nous`.

Dans la config actuelle, `upstage/solar-pro4:free` est le modèle par défaut.

### Payants (présents dans le catalogue, non libres)

Le même cache liste aussi 16 modèles payants (ex: `z-ai/glm-5.3:US`,
`openai/gpt-6-astra`, `openai/gpt-6-astra-fast`). Ils ne sont pas gratuits et
ne font pas partie du périmètre de ce document. Ils existent dans le catalogue
pour information.

---

## 5. Méthodes d'utilisation — cinq chemins

### Méthode 1 : session courante avec le profil genos-v3

C'est la méthode par défaut :

```bash
hermes -p genos-v3
```

Dans ce mode :
- le transport MCP est le binaire direct `genos-mcp.exe` ;
- le provider LLM est `nous` ;
- le modèle par défaut est `upstage/solar-pro4:free` ;
- les outils MCP GenOS sont disponibles via MCP.

### Méthode 2 : changer de modèle gratuit dans une session

Dans le chat Hermès, la commande :

```
/model meituan/longcat-2.0:free
```

fait basculer le modèle de la session courante sur le modèle spécifié, toujours
via le provider `nous`.

Exemples :
```
/model inclusionai/ling-3.0-flash-sante:free
/model poolside/laguna-s-2.1:free
/model stepfun/step-3.7-flash:free
```

Pour revenir à Solar Pro :
```
/model upstage/solar-pro4:free
```

### Méthode 3 : lancer Hermès sur un modèle spécifique

Au lancement, le flag `-m` sélectionne le modèle :

```bash
hermes -p genos-v3 -m meituan/longcat-2.0:free
hermes -p genos-v3 -m inclusionai/ling-3.0-flash-sante:free
hermes -p genos-v3 -m poolside/laguna-s-2.1:free
```

Cela écrase le default pour la session, sans modifier le fichier de config.
Au prochain redémarrage sans `-m`, c'est `upstage/solar-pro4:free` qui revient.

### Méthode 4 : utiliser le mode local (Ollama)

Quand on veut du local au lieu de Nous :

```bash
hermes -p genos-v3 -m qwen3.8 --provider ollama-launch
```

Ou dans le chat :
```
/model qwen3.8
```

avec le provider ramené sur `ollama-launch`.

Cela utilise `http://127.0.0.1:11434/v1` et les modèles installés localement
dans Ollama. Le MCP GenOS reste le même (binaire local), mais l'inférence n'est
plus routée via le provider `nous`.

### Méthode 5 : utiliser Codex séparément

Codex est un autre outil d'agent. Il ne passe pas par Hermès ni par le profil
`genos-v3`. Dans ce mode, le modèle est contrôlé par Codex lui-même, pas par la
config de ce dépôt.

Le lien entre les deux modes est uniquement l'usage : l'opérateur lance Codex
pour certaines tâches, Hermès pour d'autres, Ollama pour du local. Le dépôt
GenOS ne force pas le choix ; il documente ce qui est actif quand Hermès est
utilisé avec le profil `genos-v3`.

---

## 6. Limitations et garde-fous

- Le provider `nous` gratuit expose 7 modèles à ce stade. Le catalogue peut
  évoluer côté Portal ; si un modèle n'est plus listé, il faut relancer la
  découverte ou passer à un modèle encore présent.
- Solar Pro via `nous` n'est pas un modèle local. Il dépend de l'authentification
  OAuth et de l'endpoint `inference-api.nousresearch.com`. Si l'auth expire, la
  session renvoie une erreur d'authentification, pas une fallback silencieuse
  vers Ollama.
- Le mode local Ollama reste indépendant. Un modèle présent dans Ollama n'est
  pas automatiquement disponible via le provider `nous`. Les deux listes sont
  distinctes.
- Le nombre de méthodes documentées ici est volontaire : il couvre les voies
  réellement utilisables sans modifier le code. Toute autre voie (édition
  manuelle du YAML, variables d'environnement non documentées) est hors périmètre
  jusqu'à ce qu'elle soit vérifiée.

---

## 7. Voir aussi

- [mcp-transport-config.md](mcp-transport-config.md) — transport MCP, binaire,
  config, vérification.
- [outils-mcp.md](outils-mcp.md) — catalogue, leases, validation, transports,
  circuit breaker.
- [modeles-et-providers.md](modeles-et-providers.md) — router backend, URI
  provider, fallbacks, coûts et identité servie.
- [CONVENTIONS.md](../CONVENTIONS.md) — conventions de documentation.
- Skill `mcp-server-troubleshooting` — diagnostic stdio et binaire vs SDK.
