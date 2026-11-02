# ADR 0772 — Exécution native de GQEL dans les workers

Date : 2026-11-02. Statut : accepté dans la portée Node.js décrite.

## Décision

Un worker portant un contrat `qualityElevation` exécute la boucle GQEL après
construction de son premier artefact, avant publication de sa réussite. Les
révisions utilisent le même parcours de production et la même validation
structurelle que le premier candidat. Les lectures passent par le routeur de
modèles GenOS, le run du worker et la réservation budgétaire parentale. Les
modèles configurés ne peuvent être substitués silencieusement.

Le parcours des rapports workers utilise la réparation du candidat complet
(`planScenes: false`) afin de conserver le schéma d'artefact et ses preuves.
Le moteur natif peut aussi être appelé avec le parcours narratif scène par scène
pour un livrable textuel directement géré par son appelant.

Les checkpoints complets sont transmis au journal d'exécution. Les compteurs
incluent le premier jet, les révisions et les lectures ; ils ne remplacent pas
la réservation du budget partagé. Une limite atteinte, un lecteur manquant ou une
autorité invalide ne peut devenir une réussite. Le diagnostic terminal revient
explicitement à l'orchestrateur, sans relance implicite d'une boucle épuisée.

## Code et preuves

Pour le code, la critique porte sur un bundle des sources réellement écrites,
avec leurs chemins et empreintes. Les tests protégés existants sont exécutés par
le runtime avant l'examen du candidat. L'adaptateur vérificateur exige les mêmes
sources et les preuves d'exécution ; une ancienne meilleure version sélectionnée
doit être restaurée par le parcours de patch autorisé et retestée. La conformité
GQEL reste distincte de la validation finale et de la promotion GenOS.

## Validation

`node backend/tests/test_gqel_native_runtime.cjs` couvre la réparation native,
les budgets partagés, les identités de route, les checkpoints et les refus.
Les réponses des modèles dans cette suite sont synthétiques : ces tests ne
démontrent aucun bénéfice artistique ou généralisation avec un modèle réel.
