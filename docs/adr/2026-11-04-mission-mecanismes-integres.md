# Préparation et qualification des mécanismes d'une mission native

- **Statut :** accepté, activation explicite.
- **Date :** 2026-11-04.

## Contexte

La présence de services dans GenOS ne prouve pas leur utilisation par une mission.
Les anciens prévols externes pouvaient contrôler une référence sans que leurs
résultats n'atteignent les workers. Le transport réussi ne certifie ni le texte
produit ni sa promotion.

## Décision

`missionMechanisms`, version 1 et `required: true`, active une préparation native
avant formation A-Team. Elle exige ADN activé, AGOW borné, GQWF, génération par
scènes, handoffs RPE et morphogenèse avec transition requise. L'opérateur doit
avoir inscrit la responsabilité SHEV et sa clé publique ; le secret de signature
est transmis par environnement, jamais par la mission ou le contexte des workers.

La référence est un fichier réel confiné au workspace et lié par SHA-256.
ETT inspecte sa structure avec ses programmes natifs en lecture seule, son oracle
indépendant et sa mémoire durable jusqu'à STOPPED. Les constats alimentent la
curiosité et le phénotype persistants du NCE. Un canal Axolotl transporte exactement
ce contexte ; seul le message effectivement reçu entre dans le brief. L'option
explicite `exerciseContextRecovery` exerce une panne déclarée de ce canal, avec
sondes avant/après et régénération native. Cela ne prouve pas le remplacement
spontané d'un worker LLM. AGOW admet ensuite cette mission dans son cadre réel.

Un reçu HMAC lie identité, tenant, référence, preuves et contenu reçu. Le contrat
et ses références entrent dans la formation canonique et deviennent immuables.
Le temps de préparation est déduit du délai de mission. La reprise réutilise
uniquement un reçu intégralement revalidé de la même mission et du même contenu.

La clôture collective ajoute un invariant obligatoire. Il vérifie les vrais runs
achevés, le contexte scellé et transmis au modèle, la source ADN et son admission
clinique, les reçus GQEL, les chaînes GVX, les dossiers EVIDENCE et les reçus
CONTINUITY, OMEGA, SYNAPSE, ALLOSTASIS et GQWF. Le septième protocole, MORPH,
exige la transition native committée. Les handoffs exigent admission, consommation
et ACK réels. L'artefact final doit correspondre au reçu qualité du membre final.
Un mécanisme manquant bloque la clôture. La publication du fichier reste soumise
à la vérification native existante de ses octets après clôture acceptée.

## Limites et validation

NCE utilise ici curiosité et phénotype ; ses autres moteurs écologiques ne sont
pas exécutés. ETT vérifie la structure, sans certification artistique. Cette
intégration ne démontre pas un gain causal de chaque mécanisme.

`test_mission_mechanisms.cjs` exécute réellement ETT, NCE, Axolotl et AGOW avec
SQLite et des sous-processus bornés. Il refuse les références altérées, les
sorties de workspace, les politiques manquantes et une clôture sans workers.
Les tests ADN/clinique et handoffs RPE couvrent leurs refus propres. La campagne
LLM doit compléter ces vérifications par ses preuves réellement observées.

## Alternatives

Un booléen `allMechanismsUsed` et une simple liste de services sont écartés :
ils ne relient pas les observations au contexte consommé ni aux runs vérifiés.
Les gates existantes restent l'autorité de promotion.
