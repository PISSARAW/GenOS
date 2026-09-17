# ADR 0019 — Socle épistémique du savoir

- **Statut** : Accepté
- **Date** : 2026-09-17
- **Domaine** : Philosophie, épistémologie, preuves, inférence
- **Décideurs** : Équipe GenOS
- **Lié à** : [épistémologie et evidence](../01-concepts/epistemologie-et-evidence.md), [savoir et épistémologie](../01-concepts/savoir-et-epistemologie.md), [gouvernance du registre philosophique](0018-gouvernance-registre-philosophique.md)

## Contexte

Le registre philosophique couvre désormais la croyance, la justification, la vérité,
Gettier, les inférences, le probabilisme, les méthodes scientifiques et les formes
sociales ou situées du savoir. Ces notions ne doivent pas être fondues dans un score
unique ni présentées comme des garanties de vérité.

Le runtime possède déjà des claims typés, des preuves, de la provenance, de la dette
épistémique, des phases d’exploration et de commitment, ainsi que des barrières de
promotion. Il faut relier les analyses philosophiques à ces primitives sans créer un
second système d’autorité.

## Décision

Le socle épistémique adopte les règles suivantes :

1. **Le claim reste l’unité d’analyse.** Une croyance, une inférence ou un témoignage
   doit être représenté comme une position inspectable, avec type, contenu et preuves.
2. **La vérité n’est jamais inférée implicitement.** Une valeur de vérité fournie par
   un appelant est marquée déclarée et non vérifiée.
3. **La justification est distincte de la confiance.** La qualité des preuves, la
   calibration, la provenance et la dette sont retournées séparément.
4. **Les inférences sont bornées.** Déduction, induction, abduction, Bayes,
   confirmation et falsification produisent des candidats ou des diagnostics, jamais
   une promotion automatique.
5. **Les contre-exemples sont conservés.** Les cas Gettier, les réfutations, les
   désaccords et les voix absentes ne sont pas écrasés par la synthèse finale.
6. **Le contexte social est une donnée épistémique.** Témoignage, standpoint, savoir
   situé et division du travail cognitif enrichissent la provenance sans remplacer les
   preuves indépendantes.
7. **Le registre et le runtime sont séparés.** Un concept `planned` reste déclaratif ;
   un concept `partial` peut exposer une analyse bornée, avec ses limitations.

Les adaptateurs passent par le routeur philosophique. Les services spécialisés sont
notamment `knowledgeService`, `inferenceService`, `probabilityService`,
`scientificMethodService`, `truthSkepticismService` et
`socialEpistemologyService`.

## Conséquences

### Positives

- les résultats philosophiques sont auditables et reliés aux contrats de preuve ;
- les sorties distinguent clairement vérité, justification, plausibilité et désaccord ;
- les théories concurrentes peuvent être comparées sans imposer une métaphysique unique ;
- les concepts peuvent évoluer de `planned` à `partial` puis `implemented` sans
  réécrire leur identité déclarative ;
- les tests peuvent vérifier les limites et les contre-exemples, pas seulement les cas
  de succès.

### Négatives

- une analyse peut rester indéterminée même avec des données ;
- les services ne constituent pas un prouveur logique, un vérificateur du monde réel
  ou une théorie complète de la connaissance ;
- les adaptateurs et le registre doivent évoluer ensemble ;
- les scores probabilistes et de crédibilité peuvent donner une fausse impression de
  précision s’ils sont sortis de leur contexte.

## Alternatives écartées

- traiter `success` comme une preuve de vérité ;
- fusionner probabilité, confiance, justification et vérité dans un score unique ;
- promouvoir automatiquement une croyance vraie et justifiée comme connaissance ;
- donner au modèle le pouvoir de déclarer une réfutation sans conserver les prémisses,
  hypothèses auxiliaires et observations ;
- utiliser l’identité sociale d’une source comme substitut à l’examen de sa provenance.

## Validation

La décision est vérifiée par les tests du registre, du routeur et des services
épistémiques, notamment les cas Gettier, les mises à jour bayésiennes, les inférences,
les tests scientifiques et les analyses sociales ou situées.
