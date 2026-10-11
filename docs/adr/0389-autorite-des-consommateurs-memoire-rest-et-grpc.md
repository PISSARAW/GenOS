# ADR 0389 — Autorité des consommateurs mémoire REST et gRPC

- Date : 2026-10-10
- Statut : accepté pour la qualification bornée ; P1 reste ouvert
- Domaine : L02/C591, C613 et C618 ; L22/C562 et C563 ; mémoire d’agent

## Contexte

Le filtrage d’un scope déclaré ne démontre pas le droit du principal à le
lire. REST possède déjà une résolution de clé/session et d’appartenance au
projet. Le service mémoire gRPC utilisait seulement le secret partagé du
transport, stockait sous `grpc-client` sans tenant et passait une chaîne ou
un nombre à la place des options et de la connexion de recherche. Les
erreurs devenaient une réponse réussie contenant une liste vide. Les
résultats perdaient aussi le résumé effectif de la mémoire.

Le fallback mémoire du prompt ne transmettait que l’organisation à la
recherche d’échecs. Une panne contrôlée du corpus primaire permet ainsi
l’injection d’un échec du projet frère dans le prompt.

L’ingestion REST utilisait une autorisation de lecture et attribuait les
écritures à un auteur fixe. Certaines pannes d’ouverture et lectures SQL
étaient aussi remplacées par un corpus vide, puis des seeds génériques.

## Décision

Les appels gRPC de lecture et stockage mémoire exigent un scope
organisation/projet complet et une unique credential individuelle dans
`x-access-key`, en plus du secret de transport. Ils utilisent la résolution
d’identité existante et la même appartenance projet que REST. Une clé
révoquée/expirée et une appartenance retirée refusent la requête suivante.
Les écritures refusent l’appartenance en lecture seule et le projet archivé.
Le secret partagé ne remplace pas cette identité individuelle.

Les champs protobuf de scope sont ajoutés avec de nouveaux numéros. Les
anciens clients restent décodables mais leurs lectures/stockages sans
scope ni credential individuelle sont refusés. Cette incompatibilité
fonctionnelle est voulue ; il n’y a pas de fallback global implicite.

Le service gRPC transmet texte, vecteur et limite dans les options
correctes ; il restitue le résumé et le véritable identifiant. Les erreurs
de lecture et d’écriture sont des erreurs gRPC explicites, sans révéler
les détails privés du backend. Le stockage renvoie l’identifiant persisté.

L’upsert vectoriel applique l’égalité du scope dans la même instruction
SQLite : un identifiant déjà détenu par un autre scope ne peut être
écrasé et ne donne pas lieu à un succès sans mutation. Le fallback du
prompt conserve projet, scope de mission et option globale explicite.

L’ingestion REST applique le contrôle d’écriture existant avant embedding
et persiste le principal résolu. L’ouverture, l’hydratation et le fallback
SQL du corpus propagent leurs erreurs. Les index optionnels vec/FTS
conservent leur dégradation vers SQL ; une base indisponible ne devient
pas une recherche réussie sur les seeds.

## Alternatives et limites

Assimiler le secret de transport à tous les principals aurait laissé
l’usurpation de scope indétectable. Résoudre l’appartenance une seule fois
au début d’une session aurait permis les lectures après révocation.

Cette décision ne crée pas d’identité individuelle pour le MCP stdio
opérateur. Elle ne qualifie pas toute l’API gRPC, la révocation pendant une
opération déjà autorisée, l’isolement OS ou les gains d’une campagne IA.
La requête de recherche conserve les effets historiques de reconsolidation.
Les autres mutations REST, dont cherry-pick, vesicle, sleep et prune, restent
à qualifier ; cette extension ne démontre pas leur confinement.

## Validation

Les contre-épreuves utilisent SQLite, le vrai router REST, la sérialisation
protobuf et un serveur gRPC local. Un endpoint HTTP local indisponible
force le fallback lexical, sans campagne modèle. Les anciennes versions
sont chargées uniquement dans des processus de test pour conserver les
échecs de référence ; le checkout n’est pas réécrit pour ces comparaisons.

Voir [l’audit daté](../06-qualite-preuves/qualification-p1-consommateurs-memoire-2026-10-10.md).
