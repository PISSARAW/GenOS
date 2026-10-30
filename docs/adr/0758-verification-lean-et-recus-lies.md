# ADR 0758 — Vérification Lean commune et reçus liés

- **Date** : 2026-10-30
- **Statut** : Accepté

## Contexte

L'extraction textuelle des déclarations `axiom` ignorait les axiomes transitifs.
Une preuve de `False` utilisant `sorryAx` obtenait `passed` et `axioms: []`.
Omega acceptait `by sorry`, sans liaison obligatoire à une proposition déclarée.
Le rejeu scientifique utilisait le même exécuteur. Le registre mathématique
acceptait un statut et un digest syntaxiquement valides, sans preuve d'émission.

## Décision

- Compiler le candidat en `.olean`, puis inspecter le théorème nommé avec un
  programme Lean élaboré séparément. Collecter ses axiomes transitifs ; ne pas
  interpréter la sortie standard du candidat comme un audit.
- Partager les contrôles de liaison et d'axiomes entre gate et Omega. Interdire
  `sorryAx` même dans une liste d'axiomes autorisés. Un échec de compilation,
  une indisponibilité ou un audit manquant donne un résultat indéterminé.
- Exiger la version complète exacte et mesurer le runtime Lean et ses imports.
  Comparer le manifeste à l'empreinte épinglée lorsqu'elle est fournie.
- Matérialiser les sources des prérequis vérifiés et les importer lors de la
  compilation du descendant. Le graphe ne prouve pas que chacun est indispensable.
- Réserver l'enregistrement aux reçus immuables émis par une gate du processus.
  Recalculer leur digest à la validation et révoquer les descendants après
  invalidation d'un prérequis. Les exécuteurs injectés sont une configuration
  de confiance, notamment dans les tests.
- Dédupliquer l'évidence avant scoring, sans lui conférer d'autorité de vérité.
- Exécuter les tactiques bornées correspondant aux stratégies prises en charge.
  Une stratégie sans producteur reste explicitement indisponible.

## Conséquences

Les anciens digests de reçus et d'environnement doivent être régénérés : `reason`
entre dans le digest du reçu. Omega exige une proposition déclarée. L'inspection
et le manifeste ajoutent un coût d'exécution. Le registre reste un cache local ;
la restauration durable passe par l'autorité scientifique et son rejeu.
Les propositions formelles conservent leurs espaces internes et points de code
Unicode pour ne pas modifier les littéraux Lean pendant leur canonicalisation.

Le répertoire temporaire et le timeout ne remplacent pas une sandbox OS. Le
toolchain doit être protégé contre les mutations pendant l'exécution. Les
dépendances système hors manifeste ne sont pas attestées. L'équivalence entre
énoncé humain et formalisation reste une obligation séparée. Aucun reçu ne
remplace les gates de promotion.

## Alternatives

- Ajouter uniquement `sorryAx` à une regex laisse passer les axiomes importés.
- Lire `#print axioms` dans stdout mélange les sorties du candidat et de l'audit.
- Accepter tout succès de compilation conserve les faux positifs.

## Vérification

`node backend/tests/test_lean_verification_contract.js` vérifie les contrats.
`npm run test:lean` ajoute les régressions avec Lean réel, sans substitution
silencieuse en son absence. Voir le [contrat et ses schémas](../06-qualite-preuves/verification-lean-et-omega.md).
