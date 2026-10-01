# ADR 0234 — Gates de session Codex via hooks GenOS

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : Codex, MCP, preuve, sessions
- **Décideurs** : Mainteneur, Codex
- **Lié à** : [0233b](0233-profil-developpement-codex-mcp.md)

## Contexte

Une lease MCP autorise des appels mais n'impose pas leur usage avant les outils
natifs. Les skills seuls ne prouvent donc pas l'adoption continue du runtime.

## Décision

Installer des hooks Codex dans le plugin existant, sans contourner la confiance
de l'hôte. Chaque session du workspace configuré reçoit une identité et un journal
ignoré. PreToolUse refuse Bash/apply_patch tant qu'un PostToolUse MCP n'a pas
observé un snapshot réussi dont l'artefact porte cette identité.

Après modification des fichiers Git, Stop exige un résultat de validation explicite
avec code zéro et une expérience MCP réussie sur l'empreinte courante. Les hooks
de reprise et compaction transmettent l'état durable. Aucun transport réussi
sans `success: true` ne satisfait le gate, aucune promotion n'est implicite.

## Conséquences

### Positives

Les éditions couvertes sont rattachées à un checkpoint réel ; les preuves périmées
et sorties inconnues sont refusées. L'installation est reproductible et testable.

### Négatives

La confiance des hooks reste une action humaine imposée par Codex. La session
actuelle ne reçoit pas rétroactivement un catalogue ni des hooks. La couverture
concerne les outils exposés aux hooks et les fichiers Git non ignorés ; ce journal
local n'est pas une frontière de sécurité contre un agent hostile. Le snapshot
ne sauvegarde pas le code. Le profil s'applique au dépôt configuré et les appels
d'une même session doivent être séquentiels. Les tests restent à évaluer sur leur
pertinence, pas seulement leur code de sortie.

## Alternatives

Un lancement GenOS séparé gouvernerait un autre runtime et ne résoudrait pas
l'usage des outils natifs de la session interactive. Un simple rappel de skill
n'apporte aucun blocage observable.
