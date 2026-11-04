# ADR — Génération créative native par scènes et citations bornées

- **Statut :** accepté, raccord Node local implémenté.
- **Date :** 2026-11-04.
- **Portée :** workers créatifs natifs sous contrat GQEL ; aucun gain artistique revendiqué par les tests.

## Contexte

Une mission réelle sur `llama3.1:8b` a fourni une enveloppe JSON valide dont le
candidat n'était qu'un titre. Les contrôles positifs et négatifs des deux lecteurs
ont réussi. La première revue du titre a ensuite inventé des citations, y compris
après deux corrections protocolaires. Le refus `GQEL_REVIEW_UNGROUNDED` est
légitime, mais il intervient avant que l'auteur puisse réparer l'absence de scènes.
Le parcours natif forçait `planScenes: false`, même lorsque l'appelant demandait
la construction par scènes disponible dans le contrôleur GQEL.

## Décision

Les appels structurés de revue, plan et scènes demandent une réponse JSON
complète (`stream: false`). Le générateur natif transmet cette option au routeur.
Une réponse partielle sans compte fournisseur ni fin observée reste refusée ;
les nombres estimés du registre ne deviennent jamais une preuve d'usage.
Cette décision suit une relance où le premier flux de scène s'est achevé sans
métadonnées terminales. Elle ne reconstruit ni scène ni reçu après ce refus.

Lorsque l'enveloppe HTTP JSON est complète mais que son texte ne respecte pas
le schéma demandé, le fournisseur conserve les compteurs et la fin réellement
observés avec `schemaViolation`. Il n'accepte pas ce contenu. Une erreur du JSON
intérieur ne doit pas effacer la métrologie du transport extérieur. Les schémas
personnalisés sont contrôlés explicitement, y compris lorsque leur parsing
échoue, sans réparation générique d'une autre famille de réponses.

Les réponses créatives natives GQEL bornent les métadonnées : quatre affirmations
concises au maximum, listes de contexte et références finies, nombre d'évaluations
lié au contrat réel. La relance a montré une sortie de 7 000 tokens passée à
répéter des affirmations de réussite avant d'atteindre le candidat. Cette borne
ne remplace aucun contrôle qualité et ne limite pas la longueur du candidat.
Un résultat non résolu et les ACK négatifs restent autorisés ; les sources,
identités, digests et évaluations exigés ne sont pas supprimés.

Une structure refusée produit une évaluation runtime non acceptée, sans score
sémantique ni revue. Ses défauts alimentent la réparation bornée suivante. Cette
absence de revue ne crée aucune preuve positive et ne permet aucune promotion.

Pour un contrat de scénario natif, `qualityRuntime.planScenes: true` conserve le
premier candidat natif puis active, lors des réparations, le plan causal et la
rédaction des scènes sous le contrôleur GQEL. Le plan reste évalué ; une permission
de brouillon provisoire conserve sa portée limitée à la rédaction inerte.
Chaque scène est une réponse structurée `sceneText`, puis son en-tête et son
unicité sont vérifiés. Le contrôleur conserve les scènes partielles si un appel
ultérieur échoue. Tous ces appels utilisent l'autorité, le routage, les mesures,
l'annulation et les budgets natifs existants.
Les requêtes de plan et de scène reçoivent aussi le contexte intégral du worker,
y compris ses observations et handoffs, comme données. Ce contexte est ajouté
avant la réservation du contrôleur : un dépassement est refusé explicitement,
sans troncature et sans modification du contrat normatif de qualité.

Le texte assemblé repasse par une génération d'enveloppe native. Le modèle doit
fournir les métadonnées et les véritables évaluations des handoffs. Le schéma
fixe `workerArtifact.content.candidate` au texte exact avec `const` ; le runtime
revérifie également l'égalité après validation de l'enveloppe. Une altération
déclenche une correction protocolaire bornée puis un refus si elle persiste.
Aucune hypothèse, claim, contrainte d'intégration ou valeur d'ACK n'est ajoutée
pour rendre la réponse acceptable. Le schéma et son candidat fixé sont inclus
dans la réservation conservatrice de contexte. Le reçu final lie toujours les
octets réellement examinés à l'artefact typé réellement livré.

Les schémas des revues et des comparaisons proposent une énumération de fragments
exacts du texte concerné. Les fragments couvrent les lignes par fenêtres bornées
avec chevauchement ; aucun fragment d'une consigne ou de l'autre candidat n'est
autorisé comme citation de cet artefact. La recherche de sous-chaîne complète et
ses offsets restent obligatoires. Une citation admissible n'établit pas à elle
seule la vérité du verdict. `unknown` reste possible et empêche l'acceptation du
critère. Les comparaisons dans les deux ordres restent requises ; lorsqu'un
ancien brouillon n'a aucune continuité en scènes, son texte réel sert de portée
de citation au lieu d'une chaîne vide.

## Conséquences

Le petit modèle peut concentrer une génération sur une scène puis une autre sur
l'enveloppe, sans remplir le scénario au moyen d'un titre ou d'une promesse.
Le coût et le nombre d'appels augmentent explicitement. Les limites du contrat
et du parent restent contraignantes ; une construction trop coûteuse est refusée.
La calibration des lecteurs, les critères durs, les comparaisons, l'autorité,
les reçus durables et les gates collectives ne sont pas abaissés.

`test_gqel_native_narrative.cjs` vérifie la réparation d'un titre, les opérations
plan/scène/enveloppe mesurées, les deux ordres de comparaison, le refus d'un
candidat substitué et la réservation du schéma. Les réponses LLM de ce test sont
synthétiques et les signatures d'acceptation sont explicitement simulées.
`test_gqel_grounded_quotes.cjs` vérifie les énumérations, les emplacements exacts,
le refus des citations inventées et le confinement des citations par candidat.
Les suites GQEL historiques restent applicables. Une qualification sur modèle
réel, avec reçus natifs et scénario livré, demeure nécessaire avant de revendiquer
un résultat rédactionnel ou une intégration complète.

## Alternatives

- Accepter le titre ou inventer ses évaluations : rejeté, car aucun scénario n'est livré.
- Désactiver la calibration ou l'ancrage des citations : rejeté, car les preuves seraient affaiblies.
- Réessayer indéfiniment la même grosse enveloppe : rejeté, car les appels doivent rester bornés.
- Préremplir des ACK positifs pendant l'assemblage : rejeté, car seul le destinataire peut évaluer ses handoffs.
