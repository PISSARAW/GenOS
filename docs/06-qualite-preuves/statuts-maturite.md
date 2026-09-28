# Statuts de maturité des capacités

Référence opposable pour classer chaque entrée examinée (service Node, crate Rust,
outil MCP, route/RPC, intégration). Baseline : `1ebb3589`. Les définitions courtes du
[registre des services](registre-services.md) restent valables ; ce document ajoute les
**critères d'entrée et de sortie** et l'**application initiale** au 2026-09-28.

Règle transversale : un import (statique ou dynamique) n'est jamais un câblage
fonctionnel. Seul un parcours `entrée → sélection → invocation → effet sur la décision
→ action → observation → apprentissage éventuel → persistance → réutilisation` prouvé
fait passer une entrée à `actif`. Chaque étape non applicable doit être signalée comme
telle, pas prétendue satisfaite.

## 1. Définitions et preuves exigées

| Statut | Définition | Preuve minimale d'entrée | Sortie (déclassement) |
|---|---|---|---|
| `actif` | Parcours de production prouvé de l'entrée à une décision ou action observable | Test d'intégration du chemin d'entrée réel + reçu versionné ou persistance + ligne dans la [matrice de câblage](wiring-matrix.md) | Échec du test de parcours ou suppression du chemin → `expérimental` ou `obsolète` |
| `expérimental` | Accessible avec effets limités ou preuves insuffisantes ; ne gouverne aucune décision | Chemin d'accès démontré (route, CLI, lease) + effets bornés documentés | Preuves complétées → `actif` ; effets non bornés → refus de promotion |
| `bibliothèque` | Utilitaire volontairement passif (helpers, stratégies, définitions, schémas) | Aucun effet de bord par construction + consommateurs connus ou explicitement aucun | Un effet de bord ou un appel décisionnel découvert → `à classer` |
| `obsolète` | Candidat à suppression | Preuve d'absence d'usage : zéro import littéral **et** zéro mention nominale en production **et** zéro chargement dynamique connu, sur le checkout de référence | Usage retrouvé → `à classer` ; suppression effective → retrait du registre |
| `à classer` | Défaut tant que l'enquête n'est pas close | Statut initial de toute entrée non encore auditée | Audit clos → l'un des quatre autres statuts |

## 2. Garde-fous de promotion

1. `expérimental → actif` exige : cas nominal, cas de refus (permission/scope/preuve
   absente/capacité indisponible), et persistance ou idempotence si l'action est rejouable.
2. Aucune promotion vers `actif` sans autorisation vérifiée, erreur explicite et preuve
   inspectable sur le chemin.
3. `* → obsolète` exige la triple preuve d'absence ci-dessus ; un `literalInbound === 0`
   seul ne suffit jamais (registres dynamiques, configuration, conventions de nommage).
4. `* → bibliothèque` exige l'absence d'effet de bord constatée, pas supposée.

## 3. Application initiale (2026-09-28)

| Périmètre examiné | Volume | Statut initial | Motif |
|---|---|---|---|
| Services Node `backend/src/services` | 1 819 (dont 309 sans import littéral) | `à classer` | Audit fonctionnel non mené ; inventaire d'atteignabilité seul ([inventaire](inventaire-atteignabilite-services.md)) |
| Catalogues MCP (`shared/` + `mcp/`) | 36 + 36, noms identiques | `à classer` | Définitions alignées, exposition runtime selon lease non prouvée outil par outil (phase 3) |
| Registre backend `MCP_TOOLS_LIST` | 176 | `à classer` | Registre de dispatch, pas preuve d'exposition |
| Crates Rust du workspace | 16 + 2 packages | `à classer` | Inventaire Rust équivalent à produire (phase 1) |
| Routes REST / RPC gRPC | non inventoriées | `à classer` | Matrice route → contrôleur → auth → tests à générer (phase 3) |
| Intégrations (IDE, exemples, `backend/bin`) | ~50 programmes + contrat IDE | `à classer` | Adaptateurs effectifs à inventorier (phase 1) |

Aucune entrée n'est promue dans ce lot : la Phase 0 établit la référence et les règles,
les promotions commencent avec les parcours prouvés des phases suivantes.

## Clôture Phase 0.3

Tout audit ultérieur doit affecter l'un des cinq statuts avec la preuve correspondante ;
`à classer` reste le défaut et ne peut être interprété ni comme `inutile`, ni comme
`bibliothèque`, ni comme `actif`.
