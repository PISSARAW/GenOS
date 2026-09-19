# ADR 0028 — Autorisation ABAC, mTLS et secrets externes

- **Statut** : accepté
- **Date** : 2026-09-19
- **Contexte** : l’IAM runtime utilisait surtout RBAC, le gRPC avait une TLS serveur facultative et les secrets applicatifs étaient chiffrés dans SQLite.

## Décision

1. Ajouter un moteur de politiques déclaratif, sans exécution de code, qui complète RBAC par des attributs du principal, de la ressource, de la requête et de l’environnement. `deny` l’emporte sur `allow`; pour une action couverte par des règles pertinentes, l’absence de correspondance refuse l’accès. Sans règle pertinente, RBAC conserve le comportement existant.
2. Permettre d’exiger les certificats clients sur les serveurs HTTP et gRPC à l’aide d’une CA configurée. Quand mTLS est activé, la clé et le certificat serveur ainsi que la CA client sont obligatoires. Les credentials applicatifs existants restent requis ; les SAN de certificat ne sont pas encore mappés vers des rôles GenOS.
3. Ajouter HashiCorp Vault KV v2 comme backend externe optionnel des secrets. En mode Vault, SQLite conserve une référence tenant-scoped et aucune copie chiffrée de la valeur. Le coffre SQLite chiffré reste le choix local par défaut.

## Conséquences

- Les politiques sont gérées par les administrateurs sous `/api/iam/policies`, persistées dans `iam_policies` et leurs décisions produisent des événements de télémétrie sans valeurs de secret.
- Les règles ABAC ne s’appliquent qu’aux chemins qui utilisent `requirePermission`; les contrôles tenant et l’autorité des agents restent obligatoires.
- OPA/Rego, la fédération de politiques, le mapping SAN-vers-principal et les fournisseurs KMS autres que Vault restent hors périmètre.
- Les paramètres de transport sont opt-in pour préserver les installations locales et les reverse proxies existants. Une configuration qui demande mTLS mais omet une clé, un certificat ou une CA échoue au démarrage.
- Les valeurs Vault ne sont pas recopiées dans SQLite. L’adresse doit utiliser HTTPS, sauf en loopback de développement, et le jeton provient d’une variable d’environnement ou d’un fichier protégé.
