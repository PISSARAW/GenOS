# Matrice opérationnelle des 375 concepts

- **Statut** : Audits bornés exécutables ; validation des concepts sur missions réelles non établie
- **Portée** : projection exhaustive des profils du dépôt, pas corpus de vérités philosophiques
- **Dernière revue** : 2026-10-06

Cette matrice identifie, pour chaque entrée, la primitive partagée, la variable
observée et la condition effectivement calculée. Le profil canonique et son
interprétation détaillée restent dans
[operationalProfiles.js](../../backend/src/philosophy/operationalProfiles.js).
Les cibles, invariants, responsabilités, limites et mécanismes sont accessibles
par `getImplementationContract`.

## Lecture et preuve

Une variable absente produit `unobserved` ; une condition fausse produit
`violated`. Ces deux cas ajoutent une tâche de vérification et une réserve
de réponse à l’état retourné. Le cas satisfaisant est enregistré, sans acquérir
de permission ni démontrer la vérité externe de l’observation.

Le protocole commun compare cas satisfaisant, contre-exemple et donnée absente,
avec activation, ablation et répétition. Il simule quatre graphes et trois graines :
36 observations par contrat, 13 500 pour 375 contrats. Une simulation n’est
pas une mission multi-agents réellement lancée.

Les dix prédicats, les onze primitives, les refus, la liaison aux sources JSON
et la barrière de maturité sont décrits dans
[le contrat d’exécution et de preuve](contrats-philosophiques-ontogenese.md).
Les tests opposables sont
[test_philosophy_executable_contracts.js](../../backend/tests/test_philosophy_executable_contracts.js)
et [test_philosophy_observation_binding.js](../../backend/tests/test_philosophy_observation_binding.js).

**Limite commune à toutes les lignes** : un critère simple peut être nécessaire
sans suffire à l’invariant philosophique complet. Une chaîne non vide n’est pas
une preuve valide ; plusieurs valeurs ne prouvent pas l’indépendance de leurs
sources. Le niveau `validated` ne se déduit donc pas de cette couverture.

## Catalogue exhaustif

| Identifiant stable | Primitive | Variable d’observation | Prédicat calculé |
| --- | --- | --- | --- |
| `aesthetics.aesthetic-experience` | `creative` | `experience.audience` | `present` |
| `aesthetics.aesthetic-judgment` | `creative` | `judgment.reasons` | `recorded` |
| `aesthetics.beauty` | `creative` | `beauty.criteria` | `recorded` |
| `aesthetics.disinterested-pleasure` | `creative` | `judgment.instrumentalSeparation` | `explicit` |
| `aesthetics.dynamical-sublime` | `creative` | `force.safetyDistance` | `positive` |
| `aesthetics.mathematical-sublime` | `creative` | `scale.representationLimit` | `present` |
| `aesthetics.postmodern-sublime` | `creative` | `representation.unpresentableLimit` | `present` |
| `aesthetics.purposiveness-without-purpose` | `creative` | `form.goalSeparation` | `explicit` |
| `aesthetics.sublime` | `creative` | `sublime.capacityLimit` | `present` |
| `aesthetics.taste` | `creative` | `taste.preferences` | `recorded` |
| `aesthetics.universal-subjectivity` | `creative` | `taste.universalityUnverified` | `explicit` |
| `architecture.philosophy` | `creative` | `architecture.useConstraints` | `recorded` |
| `art.art-for-art` | `creative` | `art.instrumentalDemand` | `zero` |
| `art.catharsis` | `creative` | `reception.emotionChange` | `different` |
| `art.cluster-theory` | `creative` | `art.criteriaCluster` | `multiple` |
| `art.definition` | `creative` | `art.definitionCriteria` | `recorded` |
| `art.definition-enigma` | `creative` | `art.competingDefinitions` | `multiple` |
| `art.expressionism` | `creative` | `expression.attributedEmotion` | `present` |
| `art.fictional-reference` | `interpretation` | `fiction.referenceDomain` | `present` |
| `art.fictionalism` | `interpretation` | `fiction.literalSeparation` | `explicit` |
| `art.formalism` | `creative` | `art.formalCriteria` | `recorded` |
| `art.institutional-theory` | `creative` | `art.institutionalContext` | `present` |
| `art.mimesis` | `creative` | `representation.referenceObject` | `present` |
| `art.open-concept` | `creative` | `art.revisableCriteria` | `explicit` |
| `art.representation` | `creative` | `representation.symbolObject` | `present` |
| `art.significant-form` | `creative` | `form.relations` | `recorded` |
| `art.symbol-systems` | `creative` | `symbol.conventions` | `recorded` |
| `biomimetic.affinity-maturation` | `causal` | `selection.specificityGain` | `positive` |
| `biomimetic.chemotaxis` | `causal` | `gradient.improvement` | `positive` |
| `biomimetic.cultural-transmission` | `relations` | `transfer.provenance` | `present` |
| `biomimetic.exaptation` | `causal` | `reuse.originalNewPurpose` | `different` |
| `biomimetic.phenotypic-plasticity` | `self` | `plasticity.genomeComparison` | `equal` |
| `biomimetic.stress-mutagenesis` | `causal` | `stress.candidateDiversity` | `multiple` |
| `causality.counterfactuals` | `causal` | `counterfactual.outcomes` | `different` |
| `causality.determination` | `causal` | `cause.dependencies` | `recorded` |
| `causality.determinism-indeterminism` | `causal` | `replay.sameConditions` | `equal` |
| `causality.fatalism` | `interpretation` | `fatalism.interventionTest` | `present` |
| `causality.free-will` | `self` | `agency.availableActions` | `multiple` |
| `causality.hume-regularity` | `causal` | `regularity.causalSeparation` | `explicit` |
| `cinema.aura` | `creative` | `work.situatedProvenance` | `present` |
| `cinema.cinematic-signification` | `creative` | `cinema.signConventions` | `recorded` |
| `cinema.cognitive-theory` | `creative` | `reception.hypotheses` | `multiple` |
| `cinema.crystal-image` | `creative` | `cinema.actualVirtualSeparation` | `explicit` |
| `cinema.film-narration` | `creative` | `film.narrativeSequence` | `ordered` |
| `cinema.mechanical-reproduction` | `creative` | `reproduction.originalCopy` | `equal` |
| `cinema.movement-image` | `creative` | `cinema.actionTransitions` | `recorded` |
| `cinema.ordinary-language` | `interpretation` | `film.usageContext` | `present` |
| `cinema.time-image` | `creative` | `cinema.temporalRelations` | `recorded` |
| `core.agent` | `self` | `agent.genome` | `present` |
| `core.biomimetic-experimental` | `causal` | `biomimetic.controlResults` | `different` |
| `core.claim-not-evidence` | `evidence` | `claim.verifiedSource` | `explicit` |
| `core.environment` | `world` | `environment.observations` | `recorded` |
| `core.genome` | `self` | `genome.specification` | `present` |
| `core.history` | `self` | `history.events` | `recorded` |
| `core.intervention-not-metaphor` | `causal` | `intervention.measuredEffect` | `different` |
| `core.lineage` | `self` | `lineage.parents` | `recorded` |
| `core.self` | `self` | `self.identity` | `present` |
| `core.success-not-truth` | `evidence` | `transport.independentProof` | `explicit` |
| `core.trait` | `self` | `trait.expression` | `present` |
| `design.philosophy` | `creative` | `design.audienceNeeds` | `recorded` |
| `digital-art.philosophy` | `creative` | `digital.mediumConstraints` | `recorded` |
| `epistemology.acquaintance` | `belief` | `acquaintance.directObservation` | `present` |
| `epistemology.belief` | `belief` | `belief.confidence` | `probability` |
| `epistemology.cartesian-doubt` | `belief` | `doubt.stoppingRule` | `present` |
| `epistemology.causal-theory-knowledge` | `causal` | `knowledge.causalChain` | `recorded` |
| `epistemology.certainty-doubt` | `belief` | `doubt.verificationScheduled` | `explicit` |
| `epistemology.context-discovery-justification` | `belief` | `discovery.justificationSeparation` | `explicit` |
| `epistemology.doxa` | `belief` | `opinion.evidenceSeparation` | `explicit` |
| `epistemology.evidence-algebra` | `evidence` | `evidence.typedLevels` | `multiple` |
| `epistemology.falsification` | `belief` | `hypothesis.counterexample` | `present` |
| `epistemology.gettier-problem` | `belief` | `knowledge.luckExcluded` | `explicit` |
| `epistemology.gettierized-knowledge` | `belief` | `belief.nonAccidentalSupport` | `explicit` |
| `epistemology.indicator-reliabilism` | `belief` | `indicator.calibration` | `probability` |
| `epistemology.intellectual-virtue-vice` | `belief` | `inquiry.biasAudit` | `present` |
| `epistemology.justification` | `belief` | `justification.sources` | `recorded` |
| `epistemology.know-how` | `self` | `skill.executionTrace` | `recorded` |
| `epistemology.knowledge` | `belief` | `knowledge.layerSeparation` | `explicit` |
| `epistemology.knowledge-assertion` | `belief` | `assertion.knowledgeSupport` | `explicit` |
| `epistemology.knowledge-first` | `interpretation` | `knowledge.primitiveAssumption` | `present` |
| `epistemology.knowledge-wh` | `belief` | `question.resolvedVariable` | `present` |
| `epistemology.plausibility` | `belief` | `plausibility.score` | `probability` |
| `epistemology.post-gettier-defenses` | `belief` | `knowledge.antiLuckConditions` | `recorded` |
| `epistemology.process-reliabilism` | `belief` | `process.validationRuns` | `recorded` |
| `epistemology.propositional-knowledge` | `belief` | `knowledge.proposition` | `present` |
| `epistemology.radical-skepticism` | `interpretation` | `skepticism.actionBoundary` | `present` |
| `epistemology.rationality-norms` | `belief` | `reasoning.norms` | `recorded` |
| `epistemology.relativism` | `interpretation` | `judgment.referenceFrame` | `present` |
| `epistemology.reliabilism` | `belief` | `source.reliability` | `probability` |
| `epistemology.revisability` | `belief` | `belief.revisionTrigger` | `present` |
| `epistemology.skepticism` | `belief` | `skepticism.testableChallenge` | `present` |
| `epistemology.tripartite-definition` | `belief` | `knowledge.components` | `recorded` |
| `epistemology.truth` | `belief` | `truth.externalCheck` | `explicit` |
| `epistemology.virtue-epistemology` | `belief` | `inquiry.virtueCriteria` | `recorded` |
| `ethics.act-utilitarianism` | `policy` | `action.utilityComparison` | `different` |
| `ethics.animal-rights` | `policy` | `animals.interests` | `recorded` |
| `ethics.care-deontology` | `policy` | `care.duties` | `recorded` |
| `ethics.care-ethics` | `relations` | `care.dependencies` | `recorded` |
| `ethics.categorical-imperative` | `policy` | `maxim.universalizationTest` | `explicit` |
| `ethics.commons` | `relations` | `commons.accessRules` | `recorded` |
| `ethics.consequentialism` | `policy` | `action.consequences` | `recorded` |
| `ethics.contractarianism` | `relations` | `agreement.parties` | `multiple` |
| `ethics.deontology` | `policy` | `action.duties` | `recorded` |
| `ethics.distributive-justice` | `policy` | `allocation.criteria` | `recorded` |
| `ethics.double-effect` | `policy` | `harm.intentionSeparation` | `explicit` |
| `ethics.environmental-ethics` | `policy` | `ecology.affectedSystems` | `recorded` |
| `ethics.equality-of-opportunity` | `policy` | `access.barrierAudit` | `present` |
| `ethics.externalities` | `policy` | `costs.thirdParties` | `recorded` |
| `ethics.hedonism` | `policy` | `wellbeing.pleasureCosts` | `recorded` |
| `ethics.libertarianism` | `policy` | `entitlement.transferHistory` | `recorded` |
| `ethics.natural-rights` | `policy` | `rights.holders` | `recorded` |
| `ethics.precautionary-principle` | `policy` | `risk.irreversibilityVisible` | `explicit` |
| `ethics.rawlsian-justice` | `policy` | `allocation.leastAdvantaged` | `present` |
| `ethics.responsibility-other` | `relations` | `decision.attributionChain` | `recorded` |
| `ethics.retributive-restorative-justice` | `policy` | `justice.remedyAlternatives` | `multiple` |
| `ethics.rule-utilitarianism` | `policy` | `rule.longTermOutcomes` | `recorded` |
| `ethics.social-contract` | `relations` | `contract.obligations` | `recorded` |
| `ethics.sustainability` | `policy` | `resources.renewalBalance` | `positive` |
| `ethics.utilitarianism` | `policy` | `utility.aggregationRule` | `present` |
| `ethics.virtue-ethics` | `policy` | `decision.characterCriteria` | `recorded` |
| `interpretation.artistic` | `interpretation` | `interpretation.alternatives` | `multiple` |
| `interpretation.author` | `interpretation` | `author.attributionSource` | `present` |
| `interpretation.construction` | `interpretation` | `meaning.rawObservationPreserved` | `explicit` |
| `interpretation.death-of-author` | `interpretation` | `meaning.authorNotExclusive` | `explicit` |
| `interpretation.embodied-meaning` | `interpretation` | `meaning.sensorimotorContext` | `present` |
| `interpretation.esthetic-experience` | `creative` | `interpretation.receptionContext` | `present` |
| `interpretation.indeterminacy` | `interpretation` | `meaning.unresolvedAlternatives` | `multiple` |
| `interpretation.intertextuality` | `interpretation` | `text.references` | `recorded` |
| `interpretation.intra-extra-artistic` | `interpretation` | `evidence.artContextSeparation` | `explicit` |
| `interpretation.reference` | `interpretation` | `utterance.referenceContext` | `present` |
| `lens.deleuze` | `interpretation` | `lens.nonHierarchicalPaths` | `recorded` |
| `lens.epicureanism` | `interpretation` | `lens.preferenceHorizon` | `present` |
| `lens.stoicism` | `interpretation` | `lens.controlPartition` | `present` |
| `lens.utilitarianism` | `interpretation` | `lens.utilityWeights` | `recorded` |
| `lens.virtue-ethics` | `interpretation` | `lens.virtueCriteria` | `recorded` |
| `lens.whitehead` | `interpretation` | `lens.eventRelations` | `recorded` |
| `logic.biconditional` | `logic` | `biconditional.truthPair` | `equal` |
| `logic.conjunction` | `logic` | `conjunction.bothSupported` | `explicit` |
| `logic.contradiction` | `logic` | `contradiction.trueValuations` | `zero` |
| `logic.deontic` | `logic` | `deontic.dutyScope` | `present` |
| `logic.disjunction` | `logic` | `disjunction.witness` | `present` |
| `logic.dynamic` | `logic` | `announcement.beforeAfter` | `different` |
| `logic.epistemic` | `logic` | `epistemic.agentInformation` | `recorded` |
| `logic.equivalence` | `logic` | `equivalence.outputPair` | `equal` |
| `logic.first-order` | `logic` | `firstOrder.domain` | `recorded` |
| `logic.higher-order` | `logic` | `higherOrder.typeUniverse` | `present` |
| `logic.intuitionistic` | `logic` | `proof.constructiveWitness` | `present` |
| `logic.kripke-frame` | `logic` | `frame.relationProperties` | `recorded` |
| `logic.linear` | `logic` | `resource.duplicateConsumption` | `zero` |
| `logic.many-valued` | `logic` | `logic.valueVocabulary` | `multiple` |
| `logic.material-conditional` | `logic` | `conditional.counterexamples` | `zero` |
| `logic.modal` | `logic` | `modal.accessibility` | `recorded` |
| `logic.negation` | `logic` | `negation.truthPair` | `different` |
| `logic.paracomplete` | `logic` | `unknown.forcedTruth` | `zero` |
| `logic.paraconsistent` | `logic` | `contradiction.arbitraryConclusions` | `zero` |
| `logic.possible-worlds` | `logic` | `modal.worldValuations` | `recorded` |
| `logic.propositional` | `logic` | `formula.valuation` | `present` |
| `logic.quantifier` | `logic` | `quantifier.scope` | `present` |
| `logic.quantum` | `logic` | `quantum.latticeContext` | `present` |
| `logic.satisfiability` | `logic` | `satisfiability.witness` | `present` |
| `logic.tautology` | `logic` | `tautology.falseValuations` | `zero` |
| `logic.temporal` | `logic` | `temporal.trace` | `ordered` |
| `logic.truth-table` | `logic` | `table.valuations` | `recorded` |
| `mathematics.ante-rem-structuralism` | `interpretation` | `structure.independenceUnverified` | `explicit` |
| `mathematics.category-theory` | `logic` | `category.morphismRelations` | `recorded` |
| `mathematics.conceptualism` | `interpretation` | `concept.constructionContext` | `present` |
| `mathematics.continuum` | `logic` | `continuum.discretization` | `present` |
| `mathematics.continuum-hypothesis` | `interpretation` | `hypothesis.axiomDependence` | `present` |
| `mathematics.fictionalism` | `interpretation` | `mathematics.fictionMarker` | `explicit` |
| `mathematics.formalism` | `logic` | `formal.syntaxRules` | `recorded` |
| `mathematics.foundations-crisis` | `logic` | `foundation.competingSystems` | `multiple` |
| `mathematics.hilbert-problems` | `logic` | `problem.openStatus` | `present` |
| `mathematics.homotopy-type-theory` | `logic` | `equality.typeContext` | `present` |
| `mathematics.in-re-structuralism` | `interpretation` | `structure.instances` | `recorded` |
| `mathematics.indispensability-argument` | `interpretation` | `theory.indispensabilityComparison` | `different` |
| `mathematics.infinite` | `logic` | `infinity.finiteExecutionBound` | `positive` |
| `mathematics.infinitesimal` | `logic` | `infinitesimal.numberSystem` | `present` |
| `mathematics.intuitionism` | `logic` | `construction.witness` | `present` |
| `mathematics.logicism` | `logic` | `reduction.logicalAxioms` | `recorded` |
| `mathematics.mathematical-beauty` | `creative` | `mathematics.aestheticCriteria` | `recorded` |
| `mathematics.mathematical-intuition` | `interpretation` | `intuition.proofSeparation` | `explicit` |
| `mathematics.nominalism` | `interpretation` | `theory.nominalization` | `present` |
| `mathematics.nonstandard-analysis` | `logic` | `transfer.hypotheses` | `recorded` |
| `mathematics.number` | `logic` | `number.structuralRole` | `present` |
| `mathematics.platonism` | `interpretation` | `abstract.existenceUnverified` | `explicit` |
| `mathematics.post-rem-structuralism` | `interpretation` | `structure.abstractionSources` | `recorded` |
| `mathematics.potential-actual-infinity` | `interpretation` | `infinity.processTotalitySeparation` | `explicit` |
| `mathematics.proof` | `logic` | `proof.verificationProcedure` | `present` |
| `mathematics.proof-theory` | `logic` | `derivation.inferenceRules` | `recorded` |
| `mathematics.psychologism` | `interpretation` | `logic.psychologySeparation` | `explicit` |
| `mathematics.set-theory` | `logic` | `set.membershipRules` | `recorded` |
| `mathematics.structuralism` | `interpretation` | `structure.positions` | `recorded` |
| `mathematics.transfinite` | `logic` | `ordinal.cardinalSeparation` | `explicit` |
| `mathematics.type-theory` | `logic` | `type.assignment` | `present` |
| `mathematics.zfc` | `logic` | `foundation.axiomSet` | `recorded` |
| `metalogic.completeness` | `logic` | `system.unprovedValidCases` | `zero` |
| `metalogic.decidability` | `logic` | `decision.boundedProcedure` | `present` |
| `metalogic.godel-first-incompleteness` | `logic` | `incompleteness.systemAssumptions` | `recorded` |
| `metalogic.godel-second-incompleteness` | `logic` | `consistency.externalBasis` | `present` |
| `metalogic.soundness` | `logic` | `system.unsoundDerivations` | `zero` |
| `metaphysics.cartesian-pineal` | `interpretation` | `pineal.historicalOnly` | `explicit` |
| `metaphysics.dualism` | `interpretation` | `dualism.levels` | `multiple` |
| `metaphysics.eliminativism` | `interpretation` | `vocabulary.replacements` | `recorded` |
| `metaphysics.emergence` | `world` | `emergence.levelComparison` | `different` |
| `metaphysics.material-monism` | `interpretation` | `material.physicalBasis` | `present` |
| `metaphysics.mind-body` | `self` | `functional.physicalTrace` | `present` |
| `metaphysics.monism-idealism` | `interpretation` | `idealism.assumptions` | `recorded` |
| `metaphysics.panpsychism` | `interpretation` | `panpsychism.unverified` | `explicit` |
| `metaphysics.qualia` | `self` | `report.functionalOnly` | `explicit` |
| `metaphysics.reductionism` | `world` | `reduction.residualError` | `zero` |
| `metaphysics.reference-intentionality` | `self` | `intent.context` | `present` |
| `metaphysics.second-order-properties` | `world` | `property.reference` | `present` |
| `metaphysics.supervenience` | `world` | `supervenience.baseComparison` | `equal` |
| `method.abduction` | `belief` | `hypothesis.alternatives` | `multiple` |
| `method.bayesian-confirmation` | `belief` | `confirmation.priorPosterior` | `different` |
| `method.bayesianism` | `belief` | `posterior.value` | `probability` |
| `method.deduction` | `belief` | `deduction.validPremises` | `explicit` |
| `method.dutch-book` | `belief` | `probabilities.incoherence` | `zero` |
| `method.hypothetico-deductive` | `belief` | `hypothesis.prediction` | `present` |
| `method.induction` | `belief` | `induction.sample` | `recorded` |
| `method.induction-problem` | `belief` | `induction.extrapolationLimit` | `present` |
| `method.inference-best-explanation` | `belief` | `explanation.comparisonCriteria` | `recorded` |
| `method.intervention-replay` | `causal` | `replay.conditions` | `equal` |
| `method.objective-subjective-probability` | `belief` | `probability.interpretation` | `present` |
| `method.surprise-predictivism` | `belief` | `prediction.preregistered` | `explicit` |
| `music.autonomous-art` | `creative` | `music.externalUtilityRequirement` | `zero` |
| `music.culture-industry` | `creative` | `music.productionContext` | `present` |
| `music.emotion` | `creative` | `music.listenerReports` | `recorded` |
| `music.expression` | `creative` | `music.expressiveAttribution` | `present` |
| `music.formalism` | `creative` | `music.structuralCriteria` | `recorded` |
| `music.musically-beautiful` | `creative` | `music.formRelations` | `recorded` |
| `music.tension-expectation` | `creative` | `music.expectationOutcome` | `different` |
| `narrative.fictional-discourse` | `interpretation` | `discourse.fictionMarker` | `explicit` |
| `narrative.fictionality` | `interpretation` | `narrative.factSeparation` | `explicit` |
| `narrative.literature` | `creative` | `literature.readingContext` | `present` |
| `narrative.make-believe` | `creative` | `imagination.sharedRules` | `recorded` |
| `narrative.narration` | `creative` | `narration.eventOrder` | `ordered` |
| `narrative.novel` | `creative` | `novel.perspectives` | `multiple` |
| `narrative.props` | `creative` | `fiction.supportObjects` | `recorded` |
| `narrative.truth-in-fiction` | `interpretation` | `fiction.worldRules` | `recorded` |
| `ontology.attribute` | `world` | `attribute.owner` | `present` |
| `ontology.being` | `world` | `entity.identifier` | `present` |
| `ontology.contingency-necessity` | `world` | `necessity.assumptions` | `recorded` |
| `ontology.continuous-discrete` | `world` | `representation.resolution` | `positive` |
| `ontology.essence-accident` | `world` | `property.classes` | `multiple` |
| `ontology.hypostatization` | `world` | `abstract.externalEvidence` | `explicit` |
| `ontology.identity-change` | `self` | `identity.invariantComparison` | `equal` |
| `ontology.mode` | `world` | `mode.context` | `present` |
| `ontology.person-other` | `relations` | `other.capabilityModels` | `multiple` |
| `ontology.possible-worlds` | `world` | `worlds.factSeparation` | `explicit` |
| `ontology.stances` | `interpretation` | `ontology.stance` | `present` |
| `ontology.substance` | `world` | `entity.stableProperties` | `recorded` |
| `ontology.whole-void-infinite` | `world` | `model.boundary` | `present` |
| `paradox.berry` | `logic` | `description.languageBoundary` | `present` |
| `paradox.burali-forti` | `logic` | `ordinal.totalityAssumption` | `zero` |
| `paradox.cantor` | `logic` | `set.universalSetAssumption` | `zero` |
| `paradox.curry` | `logic` | `selfReference.unrestrictedRule` | `zero` |
| `paradox.fitch` | `logic` | `knowledge.modalAssumptions` | `recorded` |
| `paradox.grelling-nelson` | `logic` | `predicate.selfApplicationTyped` | `explicit` |
| `paradox.liar` | `logic` | `liar.undeterminedPreserved` | `explicit` |
| `paradox.moore` | `logic` | `assertion.beliefConsistency` | `explicit` |
| `paradox.richard` | `logic` | `definition.metaObjectSeparation` | `explicit` |
| `paradox.russell` | `logic` | `set.unrestrictedComprehension` | `zero` |
| `paradox.sorites` | `logic` | `vagueness.thresholdPolicy` | `present` |
| `paradox.twin` | `world` | `relativity.properTimes` | `different` |
| `paradox.zeno` | `logic` | `limit.discretizationError` | `zero` |
| `play.agon` | `creative` | `competition.fairCriteria` | `recorded` |
| `play.alea` | `creative` | `chance.seed` | `present` |
| `play.game-studies` | `creative` | `game.analysisDimensions` | `recorded` |
| `play.ilinx` | `creative` | `experience.safetyBoundary` | `present` |
| `play.magic-circle` | `creative` | `play.boundary` | `present` |
| `play.mimicry` | `creative` | `role.simulationSeparation` | `explicit` |
| `play.play` | `creative` | `play.rules` | `recorded` |
| `play.serious-games` | `creative` | `game.learningObjective` | `present` |
| `politics.civil-disobedience` | `policy` | `refusal.publicReason` | `present` |
| `politics.conservatism` | `policy` | `change.continuityCosts` | `recorded` |
| `politics.democratic-participation` | `relations` | `participation.excludedParties` | `zero` |
| `politics.feminism` | `relations` | `governance.exclusionAudit` | `present` |
| `politics.legitimacy` | `relations` | `authority.justification` | `present` |
| `politics.liberalism` | `policy` | `liberty.protectedScope` | `present` |
| `politics.liberty-authority` | `policy` | `authority.scope` | `present` |
| `politics.pluralism` | `relations` | `dissent.retainedModels` | `multiple` |
| `politics.regime-classification` | `topology` | `governance.decisionRule` | `present` |
| `politics.security-liberty-surveillance` | `policy` | `surveillance.tradeoff` | `present` |
| `politics.separation-of-powers` | `topology` | `authority.independentRoles` | `multiple` |
| `politics.social-contract` | `relations` | `commitment.exitProcedure` | `present` |
| `politics.socialism-marxism` | `relations` | `resources.controlDistribution` | `recorded` |
| `process.actuality-potentiality` | `world` | `potential.actualSeparation` | `explicit` |
| `process.badiou-event` | `world` | `event.classificationChange` | `different` |
| `process.bergsonian-vital-impulse` | `interpretation` | `adaptation.nonVitalClaim` | `explicit` |
| `process.deleuze-difference` | `world` | `repetition.stateComparison` | `different` |
| `process.heidegger-dasein` | `interpretation` | `task.practicalContext` | `present` |
| `process.sartrean-existence` | `self` | `identity.choiceHistory` | `recorded` |
| `school.aristotelianism` | `world` | `classification.categories` | `recorded` |
| `school.badiou` | `world` | `event.priorModelComparison` | `different` |
| `school.bergsonism` | `self` | `experience.sequence` | `ordered` |
| `school.cartesianism` | `belief` | `doubt.verification` | `present` |
| `school.deleuze` | `topology` | `routing.alternativePaths` | `positive` |
| `school.empiricism` | `belief` | `empirical.observations` | `recorded` |
| `school.epicureanism` | `self` | `preference.longTermCosts` | `recorded` |
| `school.falsificationism` | `belief` | `hypothesis.refutationCase` | `present` |
| `school.feminist-epistemology` | `relations` | `knowledge.exclusionAudit` | `present` |
| `school.hegelianism` | `belief` | `revision.oppositions` | `multiple` |
| `school.heidegger` | `interpretation` | `action.situation` | `present` |
| `school.kantianism` | `interpretation` | `observation.frameSeparation` | `explicit` |
| `school.leibnizianism` | `interpretation` | `perspectives.models` | `multiple` |
| `school.meillassoux` | `interpretation` | `model.contingency` | `explicit` |
| `school.merleau-ponty` | `interpretation` | `perception.sensorContext` | `present` |
| `school.naturalized-epistemology` | `belief` | `inquiry.empiricalProcess` | `present` |
| `school.newtonianism` | `world` | `reference.frame` | `present` |
| `school.nietzsche` | `interpretation` | `evaluation.perspectives` | `multiple` |
| `school.platonism` | `interpretation` | `ideal.instanceSeparation` | `explicit` |
| `school.pragmatism` | `belief` | `inquiry.testConsequences` | `recorded` |
| `school.rationalism` | `belief` | `reasoning.derivation` | `present` |
| `school.sartre` | `self` | `choice.alternatives` | `multiple` |
| `school.scholasticism` | `interpretation` | `argument.premises` | `recorded` |
| `school.schopenhauer` | `interpretation` | `goal.representationSeparation` | `explicit` |
| `school.situated-knowledges` | `relations` | `observation.situation` | `present` |
| `school.social-epistemology` | `relations` | `knowledge.distributedSources` | `multiple` |
| `school.speculative-realism` | `interpretation` | `reality.modelSeparation` | `explicit` |
| `school.spinozism` | `world` | `system.dependencies` | `recorded` |
| `school.standpoint-theory` | `relations` | `observer.position` | `present` |
| `school.stoicism` | `self` | `control.boundary` | `present` |
| `school.verificationism` | `belief` | `claim.verificationProtocol` | `present` |
| `school.whitehead` | `world` | `process.events` | `recorded` |
| `science.confirmation` | `belief` | `confirmation.testResults` | `recorded` |
| `science.duhem-quine` | `belief` | `test.auxiliaryAssumptions` | `recorded` |
| `science.falsification-demarcation` | `belief` | `theory.falsifier` | `present` |
| `science.godel-incompleteness` | `interpretation` | `formalSystem.scope` | `present` |
| `science.normal-revolutionary` | `belief` | `science.ruleChange` | `explicit` |
| `science.paradigm-incommensurability` | `interpretation` | `paradigm.translationLimits` | `present` |
| `science.progress` | `belief` | `science.comparisonBaseline` | `present` |
| `science.raven-paradox` | `interpretation` | `confirmation.relevanceRule` | `present` |
| `social-cognition.position-map` | `relations` | `social.positions` | `multiple` |
| `social-epistemology.cognitive-labor` | `relations` | `labor.attributions` | `recorded` |
| `social-epistemology.discussion` | `relations` | `discussion.positions` | `multiple` |
| `social-epistemology.emancipatory-critique` | `relations` | `critique.affectedParties` | `recorded` |
| `social-epistemology.feminist` | `relations` | `knowledge.powerContext` | `present` |
| `social-epistemology.testimony` | `relations` | `testimony.sourceIdentity` | `present` |
| `style.abstract` | `creative` | `style.literalReferenceSeparation` | `explicit` |
| `style.baroque` | `creative` | `style.dynamicContrasts` | `multiple` |
| `style.bioart` | `creative` | `style.biologicalAuthority` | `zero` |
| `style.cinema` | `creative` | `style.cinematicConventions` | `recorded` |
| `style.classicism` | `creative` | `style.proportionRules` | `recorded` |
| `style.conceptual-art` | `creative` | `style.conceptStatement` | `present` |
| `style.cubism` | `creative` | `style.simultaneousViewpoints` | `multiple` |
| `style.dada` | `creative` | `style.conventionChallenge` | `present` |
| `style.digital-art` | `creative` | `style.digitalOperations` | `recorded` |
| `style.futurism` | `creative` | `style.motionRelations` | `recorded` |
| `style.geometric` | `creative` | `style.geometricRelations` | `recorded` |
| `style.installation` | `creative` | `style.spatialRelations` | `recorded` |
| `style.land-art` | `creative` | `style.environmentalContext` | `present` |
| `style.maximalism` | `creative` | `style.densityCriterion` | `present` |
| `style.minimalism` | `creative` | `style.reductionCriterion` | `present` |
| `style.naturalism` | `creative` | `style.environmentDetermination` | `present` |
| `style.performance-art` | `creative` | `style.actionContext` | `present` |
| `style.pop-art` | `creative` | `style.massCultureReference` | `present` |
| `style.realism` | `creative` | `style.observedReference` | `present` |
| `style.rococo` | `creative` | `style.ornamentalCriteria` | `recorded` |
| `style.romanticism` | `creative` | `style.subjectivePerspective` | `present` |
| `style.surrealism` | `creative` | `style.unexpectedAssociations` | `multiple` |
| `time.a-series-b-series` | `world` | `time.referenceEvent` | `present` |
| `time.arrow` | `world` | `time.causalOrder` | `ordered` |
| `time.block-universe` | `interpretation` | `time.observedFutureSeparation` | `explicit` |
| `time.duration` | `self` | `duration.events` | `ordered` |
| `time.newtonian` | `world` | `clock.reference` | `present` |
| `time.spacetime-relativity` | `world` | `time.coordinateFrame` | `present` |
| `truth.coherence` | `belief` | `truth.inconsistencyCount` | `zero` |
| `truth.correspondence` | `belief` | `truth.observationComparison` | `equal` |
| `truth.deflationary` | `interpretation` | `truth.disquotation` | `equal` |
| `truth.fixed-point` | `logic` | `truth.iterationComparison` | `equal` |
| `truth.internal-realism` | `interpretation` | `truth.conceptualScheme` | `present` |
| `truth.minimalism` | `interpretation` | `truth.additionalAuthority` | `zero` |
| `truth.pragmatist` | `belief` | `truth.predictionGain` | `positive` |
| `truth.tarski-undefinability` | `logic` | `truth.languageLevels` | `multiple` |
| `video.philosophy` | `creative` | `video.temporalMedium` | `present` |

## Faire évoluer une entrée

1. Modifier le profil explicite et son interprétation, pas une règle de secours.
2. Conserver la distinction avec les entrées voisines et les positions concurrentes.
3. Ajouter un mécanisme spécialisé si le prédicat ne suffit pas à l’invariant.
4. Ajouter des contre-exemples capables de réfuter ce mécanisme.
5. Recalculer les contrats : toute ancienne empreinte devient obsolète.
6. Rejouer les scénarios et vérifier les consommateurs dans Ontogenèse.
7. Actualiser cette projection et les sources documentaires concernées.

Une expérience réussie fournit un reçu borné. La validation sur missions réelles,
le contenu externe des observations et l’attestation indépendante restent des
exigences séparées. Les statuts philosophiques historiques ne sont pas réécrits
pour afficher artificiellement une complétude.

Voir aussi [le registre](registre-philosophique.md) et
[ADR 0326](../adr/0326-audits-philosophiques-executables-et-preuves.md).
