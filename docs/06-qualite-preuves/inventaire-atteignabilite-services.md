# Inventaire d'atteignabilité des services

L'inventaire couvre chaque fichier JavaScript de `backend/src/services`. Exécuter
`node scripts/ci/audit_service_reachability.js --json` pour obtenir une ligne
par service avec son chemin, `staticReachable` et `literalInbound`. La commande sans `--json`
résume les résultats et affiche les premiers services à examiner.

Au 28 septembre 2026 (baseline `1ebb3589`, HEAD `2321a946`), la passe courante trouve
**1 819 services**, dont **1 313** atteignables par des imports relatifs littéraux
depuis `backend/server.js`, `mcp/index.js` ou les programmes de `backend/bin`. **506**
nécessitent une revue supplémentaire, dont **309 sans aucun import littéral de production**
(`literalInbound === 0`). Relevé précédent au 27 septembre 2026 : 1 814 / 1 310 / 504 / 308
(+5 / +3 / +2 / +1 : cinq services ajoutés, trois devenus atteignables). Le chiffre change
avec les fichiers du dépôt; la commande est la source de vérité pour le checkout courant.

`literalInbound` compte les fichiers de production qui importent directement le
service par un chemin relatif littéral, même quand ces fichiers ne sont pas
eux-mêmes atteignables depuis une entrée. La valeur zéro isole les candidats
sans import littéral à examiner en priorité ; elle ne prouve pas une absence
d'utilisation dynamique. La commande fournit aussi `withoutLiteralInbound` dans
son résumé JSON. Cette mesure rend explicite le stock de services orphelins
potentiels sans les connecter artificiellement pour satisfaire un compteur.

`staticReachable` signifie seulement qu'une chaîne d'imports existe. Elle ne
prouve ni sélection pendant une mission, ni effet sur une décision, ni action,
ni preuve, ni apprentissage. Un service marqué `false` peut être chargé par un
import dynamique ou un registre (voir [registres dynamiques](registres-dynamiques.md)). L'étape suivante est donc la vérification
fonctionnelle par le parcours `Sense → Select → Invoke → Affect decision → Act
→ Observe → Learn → Persist → Reuse` de la [matrice de câblage](wiring-matrix.md).

Ce relevé rend visibles les services isolés au lieu de les déclarer connectés
sur la seule base de leur existence. Les familles Rust, les outils et les
intégrations externes demandent des inventaires équivalents et une preuve de
pont typé vers le contrôle Node.
