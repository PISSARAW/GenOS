# EPIC 1: Sécurité Zero Trust, Tool Gateway & Taint Tracking

Ce document détaille l'architecture implémentée pour l'EPIC 1 (Zero Trust & Tool Gateway), intégrant également les recommandations issues du rapport de Biomimétisme (Automate Half-Open).

## 1. Vue d'ensemble (Zero Trust)
La sécurité de GenOS repose désormais sur le principe du "Zero Trust". Chaque interaction de l'agent avec le monde extérieur (fichiers, réseau, exécution) est systématiquement interceptée, validée et tracée.

L'architecture est structurée autour des composants suivants :
- **PermissionsManifest** : Définition granulaire des autorisations d'accès.
- **ToolGateway & PolicyPlane** : Intercepteur des appels outils.
- **CircuitBreaker (Half-Open)** : Automate d'isolation des outils défaillants.
- **Taint Tracking (SecureToolOutput)** : Marquage des données externes comme potentiellement compromises.
- **SandboxConfig** : Environnement de montage sécurisé.

## 2. PermissionsManifest (`genos-core`)
Localisation : `crates/genos-core/src/permissions.rs`

Ce composant gère la liste blanche des chemins en lecture/écriture ainsi que les domaines réseau autorisés. L'agent ne possède aucune permission implicite. Toute tentative hors périmètre lève une exception interceptée par la `ToolGateway`.

## 3. ToolGateway & PolicyPlane (`genos-tools`)
Localisation : `crates/genos-tools/src/gateway.rs`

Le trait `PolicyPlane` définit une méthode stricte de validation des appels (max 2 paramètres). 
La `ToolGateway` enveloppe l'exécuteur standard, et pour chaque `execute_intercepted` :
1. Valide l'appel (`PolicyPlane`).
2. Vérifie l'état du **Circuit Breaker**.
3. Exécute l'outil.
4. Met à jour le métabolisme de l'outil et renvoie un `SecureToolOutput`.

## 4. Automate Half-Open (Circuit Breaker)
Localisation : `crates/genos-tools/src/gateway.rs`

Inspiré du **Blueprint 6** du rapport de biomimétisme, l'automate possède 3 états (`CircuitState`) :
- **Closed** : Exécution nominale.
- **Open** : L'outil a échoué consécutivement au-delà du seuil. Les appels sont bloqués pour éviter le gaspillage de tokens (Token Burn).
- **HalfOpen** : Après le `cooldown_ms`, un test unique est autorisé. S'il réussit, le circuit se referme. Sinon, il se rouvre.

## 5. Taint Tracking (SecureToolOutput)
Afin d'éviter les attaques par injection indirecte de prompt via les résultats d'outils, tout output (`ToolResult`) transite par `SecureToolOutput` qui attribue par défaut le flag `is_tainted = true`. Ce flag se propage dans `ToolOutputRecord` et `ToolCallRequest` (`genos-core`), permettant au futur système immunitaire (CRISPR-Cas9) d'isoler ces payloads.

## 6. Intégrité et Règles d'or
- **Complexité Cyclomatique** : Aucune fonction n'excède 3 paramètres.
- **Fichiers courts** : Le code est fragmenté (ex: `gateway.rs` fait moins de 115 lignes).
