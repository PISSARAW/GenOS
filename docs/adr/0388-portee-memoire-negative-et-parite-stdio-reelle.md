# ADR 0388 — Portée de la mémoire négative et parité stdio réelle

- Date : 2026-10-10
- Statut : accepté ; qualification bornée de L02 et L22
- Domaine : mémoire négative, scopes déclarés et consommateurs MCP

## Contexte

Les comparaisons de catalogues MCP ne démontrent pas que les deux serveurs
exécutent la même décision. Une contre-épreuve SQLite révèle que la recherche
d’échecs ignore le projet déclaré, inclut automatiquement les décisions globales
et récupère les trajectoires rejetées des projets frères de l’organisation.
Le premier essai stdio révèle aussi que Node accepte une limite de 100 alors
que le backend appelé par Rust applique le maximum canonique de 50.
Un appel valide par Rust révèle ensuite une seconde enveloppe MCP imbriquée
à la place du résultat métier. Une contre-épreuve HTTP observe également
des requêtes d’embedding avant le refus d’un scope incomplet.
La reproduction indépendante montre enfin que Rust transforme les arguments
explicitement `null` en objet vide, donnant accès à la lecture non scopée.

## Décision

Un prédicat SQL commun filtre les décisions et les workspaces des trajectoires
par organisation et, lorsqu’il est déclaré, par projet. Un projet seul et les
scopes mal formés sont refusés. Les mémoires globales ne rejoignent une recherche
scopée que sous `includeGlobal: true`, avec organisation et projet tous deux
absents sur la source. Une trajectoire sans workspace résolu n’est pas classée
comme globale. Les valeurs de scope sont des paramètres SQL.
Le conteneur du contexte doit être un objet ; tableaux, primitives et `null`
sont refusés. La validation précède toute requête d’embedding ou ouverture
de base dans les deux primitives de recherche.

La lecture historique sans organisation ni projet reste une lecture opérateur
non scopée. Le prédicat ne transforme pas une identité déclarée par le client
en identité authentifiée et ne crée pas de permission de lecture.

Une commande distincte doit lancer réellement Node et le binaire Rust construit,
sur une base temporaire commune. Elle vérifie le résultat métier, les refus,
les leases absents, désactivés et expirés, et les octets JSON-RPC sur stdout.
Le binaire Rust est exigé explicitement ; une absence n’est pas un test réussi.
Node utilise la validation canonique des arguments. Le dispatcher backend
appelé par Rust exécute directement les outils de développement, avec leurs
contrôles de lease et de circuit, sans réintroduire une enveloppe stdio.
Seule l’absence d’arguments prend la valeur par défaut : un `null` explicite
est conservé puis refusé par la validation d’objet, y compris à l’entrée Rust.

## Conséquences et alternatives

Les scopes déclarés deviennent effectifs sur ces recherches sans changer le
stockage ni prétendre confiner les processus au niveau OS. Les appelants qui
désirent les mémoires globales doivent le déclarer. L’authentification du
principal et la totalité des parcours L22 restent à qualifier.

Conserver une fuite pour préserver le comportement historique d’une recherche
scopée ou fermer L22 sur des comparaisons textuelles aurait contredit les
obligations P1. Les preuves d’échec initial restent archivées hors Git.

## Validation

`test_failure_memory_scope.js` confronte les décisions et les trajectoires
réelles en SQLite, les projets frères, tenants étrangers, globales ambiguës,
workspaces orphelins, scopes mal formés et valeurs de type injection SQL.
`test_failure_memory_effect_order.js` exige zéro requête HTTP avant le refus.
`npm run qualify:p1-stdio` confronte quatorze processus Node/Rust et vingt-huit
appels métier : lectures, retrait/restauration, arguments et leases, dont
expiration pendant une session. Le circuit reste actif ; son accumulation
entre plusieurs appels et entre les deux implémentations reste à qualifier.
Les résultats, contre-épreuves et limites sont consignés dans
[l’audit daté](../06-qualite-preuves/qualification-p1-l22-2026-10-10.md).
