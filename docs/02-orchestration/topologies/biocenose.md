# Biocénose : Système de Délibération Collective et de Formation de Jugement

## 1. Principe fondamental

> **Biocénose est le système de délibération collective, de contestation et de formation de jugement de GenOS lorsque la réponse ne peut pas être confiée à une seule autorité, qu'il existe plusieurs perspectives légitimes ou incomplètes, et que la qualité du résultat dépend de la diversité, de l'indépendance, de la confrontation et de l'agrégation des connaissances.**

Biocénose n'est pas un « consensus multi-agent ». C'est **l'épidémiologie collective** de GenOS : la façon dont la communauté construit un jugement partagé à partir de connaissances distribuées, de désaccords légitimes et de preuves contestées.

La distinction avec les autres topologies est fondamentale :

```text
Trinity
    plusieurs hypothèses concurrentes
    → laquelle résiste à l'expérience contrôlée ?

A-Team
    plusieurs expertises complémentaires
    → comment construire ensemble un artefact ?

Biome
    environnement + populations + niches + ressources
    → où investir les ressources collectivement ?

Métapopulation
    plusieurs dèmes semi-indépendants
    → comment survivre aux extinctions locales ?

Biocénose
    plusieurs perspectives légitimes ou incomplètes
    → que doit croire/décider la communauté
      après délibération, confrontation et agrégation ?
```

Biocénose demande :
> **« Que doit croire ou décider la communauté après que ses membres ont raisonné indépendamment, confronté leurs preuves, exposé leurs désaccords et mis à jour leurs positions sans écraser les minorités utiles ? »**

Et surtout :
> **Le but de Biocénose n'est pas de fabriquer du consensus. Le but est de fabriquer un désaccord bien traité.**

---

## 2. L'implémentation actuelle n'est pas encore réellement une communauté

Dans `backend/src/services/biocenoseService.js`, la composition produit exactement :
```text
community_facilitator
independent_solver
adversarial_reviewer
consensus_observer
```

Donc il n'y a en réalité qu'**un seul solver indépendant**. C'est incompatible avec la documentation qui raisonne elle-même sur $S_1, S_2, \ldots, S_n$. Une communauté où une seule proposition est formulée puis critiquée ressemble davantage à author → reviewer → judge qu'à une véritable Biocénose.

Le premier changement conceptuel est :
```text
Biocénose ≠ 4 rôles = 4 agents
```
mais :
```text
Biocénose
    governance plane
    +
    N independent contributors
    +
    M reviewers/verifiers
    +
    aggregation/observer plane
```

Les rôles actuels peuvent rester, mais comme **fonctions communautaires**, pas comme cardinalité fixe.

---

## 3. Le `kneePoint` Pareto n'est pas un consensus

`evaluateCommunity()` appelle actuellement `arenaTaskEvaluation.evaluateDossiersPareto(...)` puis expose `consensus: evaluation.kneePoint`. Cela mélange deux concepts. Arena répond « quel candidat présente le meilleur compromis multiobjectif ? ». Un consensus répond « quelles propositions la communauté accepte-t-elle après confrontation ? ». Ce n'est pas la même question.

Et surtout, Arena compare aujourd'hui potentiellement Solver, Reviewer, Observer comme candidats. Or le Reviewer n'est pas une solution concurrente au Solver — il produit une fonction différente.

Biocénose ultime doit abandonner comme primitive centrale `candidate ranking` et utiliser `claim-level deliberation + argument graph + belief aggregation + decision rule`. Arena/Pareto reste utile à l'intérieur d'une décision lorsqu'il existe réellement plusieurs options concurrentes.

---

## 4. La diversité actuelle mesure la mauvaise chose

`communityDiversity()` calcule une entropie de Shannon sur EXECUTE, VERIFY, OBSERVE... Donc Solver executes + Reviewer verifies + Observer observes produit mécaniquement de la diversité. Mais cela ne prouve absolument pas : diversité d'évidence, diversité de raisonnement, erreurs indépendantes, sources indépendantes.

Heureusement, GenOS possède déjà un meilleur embryon dans `backend/src/services/epistemic/epistemicBiocenoseService.js` avec : functional diversity, error diversity, tool diversity, provider diversity, strategy diversity, effective diversity, monoculture detection. C'est ce service qui devrait devenir une composante centrale de la vraie Biocénose.

---

## 5. Le Brier actuel a un problème conceptuel subtil

Le code a correctement corrigé une première erreur : sans oracle externe, il refuse de fabriquer une vérité circulaire. C'est très bien. Mais si l'oracle est déjà disponible, pourquoi demander à la communauté de déterminer la réponse ? L'oracle donne déjà la réponse.

Le Brier doit surtout servir à apprendre : Agent A historical calibration excellent, Agent B historical overconfidence high — et influencer les futurs jugements. Pas découvrir rétroactivement la vérité du problème qu'on vient de résoudre.

Le bon cycle est :
```text
t0 agent predicts P=.80
t1 community aggregates
t2 external truth becomes known
t3 Brier score calculated
t4 future calibration/reputation updated
```

Les proper scoring rules sont précisément destinées à évaluer la qualité de probabilités déclarées ([PubsOnline:Neyman][1]). Je transformerais `brier_weighted_consensus` en `historically_calibrated_probability_pooling`.

---

## 6. Une communauté ne doit pas rechercher le consensus à tout prix

C'est probablement **le principe le plus important de Biocénose ultime**. Consensus n'est pas synonyme de vérité.

Une étude ACL 2026 sur le multi-agent debate conclut que le débat homogène classique peut être moins performant qu'un simple vote majoritaire et identifie deux facteurs décisifs : diversité initiale et communication explicite de confiance calibrée ([ACL Anthology:Zhu 2026][2]).

Un autre travail de 2026 met en évidence l'émergence possible de consensus collectifs biaisés dans des débats LLM, avec un rôle de la conformité et une réduction de ce phénomène avec davantage d'hétérogénéité ([arXiv:Okawa 2026][3]).

La littérature sur les groupes humains montre depuis longtemps que le dissent peut faire émerger des informations qui seraient perdues par une convergence prématurée ([PubMed:Hidden Profiles][4]).

Donc CONVERGENCE ↑ n'est pas toujours QUALITY ↑.

---

## 7. La sortie fondamentale doit devenir un `CommunityJudgment`

Pas simplement `consensus = candidate A`. Je définirais :
```text
CommunityJudgment {
    acceptedClaims, rejectedClaims, contestedClaims, unresolvedQuestions
    supportedOptions, dominatedOptions
    majorityPosition, minorityPositions
    evidenceGraph
    confidence, calibrationBasis
    dissentReport
    decisionStatus
}
```

Et surtout plusieurs sorties possibles :

| Outcome | Significance |
|---------|--------------|
| `VERIFIED_CONSENSUS` | preuves externes + accord |
| `ROBUST_CONSENSUS` | accord indépendant fort sans oracle décisif |
| `QUALIFIED_CONSENSUS` | accord avec réserves importantes |
| `PLURALITY_WITH_DISSENT` | une position domine mais minorité substantielle |
| `PARETO_PLURALISM` | plusieurs options légitimes non dominées |
| `IRREDUCIBLE_DISAGREEMENT` | désaccord raisonnable persistant |
| `REQUEST_MORE_EVIDENCE` | preuve insuffisante |
| `ESCALATE_EXPERIMENT` | question empirique à tester |
| `HUMAN_JUDGMENT_REQUIRED` | décision normative/préférentielle non délégable |

---

## 8. Avant la communauté : classifier le type de question

### Question factuelle vérifiable
« Cette fonction produit-elle une race condition ? » Priorité : test, reproduction, formal verifier, evidence. Pas 7 agents disent oui.

### Question probabiliste
« Probabilité que cette migration échoue ? » Ici probability pooling, historical calibration, Brier/log scoring est approprié.

### Question de conception
« Quelle architecture conserver ? » Plusieurs compromis peuvent être valides. Utiliser criteria, Pareto, argumentation, trade-offs.

### Question normative
« Quel compromis est acceptable ? » Il n'existe parfois pas de vérité technique unique. Préserver values, stakeholder constraints, plural alternatives et éventuellement renvoyer à l'humain.

### Question exploratoire
Plusieurs cadrages du problème peuvent être légitimes. Le résultat peut rester pluraliste.

---

## 9. La constitution de la communauté doit être définie AVANT de voir les réponses

C'est une faiblesse potentielle de la documentation actuelle. Le Facilitator est censé définir thresholds, decision boundaries, rules — mais la simulation documentée place aussi le Facilitator vers la fin après Solver/Reviewer/Observer. C'est dangereux.

Je créerais donc un `Community Constitution` scellé avant la première réponse :
```text
question type, eligibility, roles
evidence standard, independence requirements
aggregation method, quorum policy, abstention policy
dissent policy, round limit, stopping rule
escalation rule, verification policy
constitutionHash
```

Puis constitutionHash. Une modification après commencement doit être versionnée et visible.

---

## 10. Les membres doivent d'abord répondre en isolation

Phase SEALED INDEPENDENT JUDGMENT. Chaque membre produit position, claims, probabilities, assumptions, evidence, unknowns et signe commitmentHash avant de voir les autres.

C'est essentiel parce que la sagesse d'une foule dépend fortement de l'indépendance des erreurs ; des erreurs corrélées réduisent fortement l'intérêt de l'agrégation ([PMC:Wisdom Crowd Diversity][5]).

---

## 11. Puis seulement vient la délibération

Le protocole cible devrait être :
```text
INDEPENDENT → COMMIT → BLIND AGGREGATE → EXPOSE ARGUMENTS → CHALLENGE → REQUEST EVIDENCE → REVISE → RE-AGGREGATE → DECIDE OR PRESERVE DISSENT
```

Cela permet de mesurer séparément private belief et post-social belief. Donc GenOS peut observer « Agent A changed because evidence E » versus « Agent A changed merely because majority=7/10 ». Cette distinction est extrêmement importante.

---

## 12. La délibération doit être claim-level

Pas Solution A vs Solution B, mais Claim C1, Claim C2, Claim C3... Une proposition peut être correcte sur C1, fausse sur C2, incertaine sur C3. Le verdict collectif doit pouvoir recombiner les claims.

---

## 13. Créer un Argument Graph

Je connecterais cela directement au système épistémique existant :
```text
Claim ↑ support Evidence
Claim A ├── SUPPORT ← Claim B
         ├── ATTACK ← Claim C
         ├── UNDERCUT ← Evidence D
         └── DEPENDS_ON → Assumption E
```

Relations : SUPPORT, ATTACK, REFUTE, UNDERCUT, DEPEND_ON, QUALIFY, COUNTEREXAMPLE. Les recherches récentes sur la délibération LLM explorent justement des argument graphs et des cadres de bipolar/quantitative argumentation pour rendre les désaccords auditable plutôt que d'utiliser une simple synthèse textuelle ([ACL Anthology:ARGSBASE][6]).

GenOS possède déjà presque toutes les briques dans son EpistemicState : claims, refutations, contradictions, evidenceLinks, uncertainties. Il faut les réutiliser.

---

## 14. Chaque changement d'avis doit avoir une raison

Au lieu de before=.2 après=.8 enregistrer BELIEF_UPDATE reason : NEW_EVIDENCE, COUNTEREXAMPLE, FORMAL_REFUTATION, BETTER_ARGUMENT, MAJORITY_SIGNAL, AUTHORITY_SIGNAL, SELF_CORRECTION. Le système peut ensuite détecter social conformity si des agents changent massivement après exposition à la majorité sans nouvelles preuves.

---

## 15. Introduire un `Conformity Monitor`

Mesures : beliefUpdateAfterEvidence, beliefUpdateAfterMajority, beliefUpdateAfterHighStatusAgent, beliefUpdateWithoutNewInformation. Si social updates >> evidential updates alors GROUPTHINK_RISK. Actions : reblind round, recruit dissent, hide vote counts, introduce independent verifier.

---

## 16. Ne surtout pas afficher le score global trop tôt

Si les agents voient 8/10 support A avant leur seconde analyse, on fabrique potentiellement de l'ancrage. Donc rounds initiaux : argument-visible, vote-hidden, identity-hidden. Puis seulement plus tard aggregate statistics. Le Delphi classique repose justement sur anonymat, itération, feedback contrôlé et synthèse statistique ([BMJ:DCAT][7]).

---

## 17. Le dissent doit être un objet persistant

Créer DissentLedger. Chaque position minoritaire possède claimRefs, supportingEvidence, supporters, independence, materiality, counterexamples, status. Jamais `minority lost vote → delete`. Mais `majority accepted + minority preserved`. Parce qu'une position minoritaire peut contenir l'information rare correcte.

---

## 18. Introduire le `Minority Veto` limité

Pas un veto politique général. Un veto épistémique lorsque la minorité possède : deterministic counterexample, formal contradiction, critical safety evidence, unique verified evidence. Exemple : 9 agents « patch works » mais 1 agent a un test reproductable qui crash → PROMOTION BLOCKED. L'évidence bat le nombre.

---

## 19. Il faut protéger le dissent utile, pas n'importe quel dissent

$$DissentValue = EvidenceStrength \times Independence \times Materiality \times Novelty$$

et non minority = automatically valuable.

---

## 20. La diversité doit être multi-dimensionnelle

Je mesurerais au moins : modèle, provider, stratégie, cognitive recipe, source, evidence type, lineage, retrieval, error history, position. Et construire Community Independence Graph réutilisant epistemicIndependenceService.

---

## 21. Le nombre de personnes n'est pas la diversité effective

100 agents + même modèle + même prompt + même sources peut représenter effective community size ≈ 1. Il faudrait calculer $N_{eff}$ à partir des corrélations/indépendances. Cela empêche de présenter 93 votes / 100 comme très fort si les 100 sont des clones cognitifs.

---

## 22. Recrutement adaptatif

Si community monoculture detected le système doit chercher : different provider, different evidence modality, different strategy, different expertise, different retrieval corpus. Le service épistémique actuel possède déjà shouldRecruit() et recommendNiche(). C'est une excellente base. Il faut le rendre causal au runtime.

---

## 23. Le Reviewer unique doit disparaître

Un reviewer unique devient un goulot d'étranglement. Il peut miss flaws, be biased, anchor everyone. Il faut une Reviewer Population : factual verifier, counterexample hunter, assumption auditor, security reviewer, logic reviewer. Chaque claim est routé vers les reviewers appropriés.

---

## 24. Generator ≠ Reviewer ≠ Aggregator

Séparation obligatoire : Generators produisent positions, Reviewers attack/support claims, Verifiers test empirical assertions, Aggregator combine judgments, Observer monitors social dynamics. Aucun agent ne doit contrôler simultanément toutes ces fonctions sur une décision importante.

---

## 25. La vraie Biocénose est donc une communauté de niches épistémiques

On pourrait avoir : Population of generators, Population of skeptics, Population of empirical verifiers, Population of formal verifiers, Population of minority scouts, Population of intégrateurs. Chaque population occupe une niche cognitive.

---

## 26. L'agrégation doit dépendre de la question

Il ne faut jamais un algorithme unique. Faits avec oracle : oracle > community. Probabilités : weighted probability pool. Les travaux récents comparant différentes règles montrent que les agrégations probabilistes peuvent offrir un meilleur compromis exactitude/décisivité que des règles majoritaires dans certains contextes, et que la corrélation des jugements compte fortement ([Wiley:Condorcet][8]). Options multicritères : Pareto. Arguments complexes : argument graph semantics. Valeurs/préférences : preserve pluralism.

---

## 27. Brier weighting doit devenir historique

Pour chaque membre : CalibrationProfile contenant domain, sampleCount, Brier, logScore, reliabilityCurve, overconfidence, underconfidence. Par domaine. Un excellent forecaster en backend n'obtient pas automatiquement la même autorité en droit ou en mathématiques.

---

## 28. Il faut aussi un score de spécialisation

Poids final d'un jugement : $w_i = Calibration_i \times ExpertiseFit_i \times Independence_i \times EvidenceQuality_i$ avec limites pour éviter un agent dominant. Pas historically good → dictator.

---

## 29. Un marché prédictif interne peut devenir un variant

Pas besoin d'argent réel. Chaque agent reçoit un budget virtuel de conviction. Il peut distribuer 70 units on A, 20 on B, 10 abstain. Le système calcule une probabilité agrégée. Après résolution externe : proper scoring met à jour la calibration. Des recherches sur prediction markets montrent que combinaison statistique, pondération historique et recalibration peuvent extraire efficacement l'information distribuée ([PubsOnline:Atanasov][9]). Très intéressant pour un variant Forecasting Biocenose.

---

## 30. Les variants de Biocénose

| Variant | Structure | Usage |
|---------|-----------|-------|
| **Epistemic Jury** | jugements indépendants → preuves → verdict | validation technique |
| **Delphi Community** | rounds anonymes + feedback contrôlé | expertise incertaine |
| **Adversarial Assembly** | propositions + attaque/défense | robustesse |
| **Forecasting Crowd** | probabilités calibrées | prévision |
| **Argumentation Community** | claim/argument graph | raisonnements contestables |
| **Polycentric Council** | plusieurs sous-communautés | grands systèmes |
| **Byzantine-Resilient Community** | filtrage de membres malveillants | environnements non fiables |
| **Minority-Preserving Jury** | consensus + dissent ledger | décisions à fort risque |
| **Representative Community** | échantillonnage de perspectives | énorme population |
| **Persistent Community** | réputation et culture long terme | projet durable |
| **Human–AI Deliberation** | humain comme participant/arbitre | valeurs et ambiguïtés |
| **Hybrid Oracle Community** | crowd + verifiers déterministes | science/code/math |

Les cinq que je prioriserais : Epistemic Jury, Delphi, Adversarial Assembly, Argumentation Community, Minority-Preserving Jury.

---

## 31. Variant Delphi

Très naturel pour Biocénose. Round 0 private answer, Round 1 anonymous aggregate + reasons, Round 2 agents reconsider, Round 3 stability test. Mais avec un garde-fou majeur : convergence is not mandatory. La littérature Delphi avertit qu'un nombre excessif de rounds peut encourager un consensus forcé ; les méthodes modernes conservent donc des stopping rules explicites ([BMJ:DCAT][7]).

---

## 32. Variant Adversarial Assembly

Plusieurs propositions. Puis red reviewers, blue defenders, neutral verifier — mais avec engagements initiaux scellés. Important : le débat peut aussi propager de mauvaises convictions. Des travaux récents montrent que des agents persuasifs/adversariaux peuvent influencer négativement une délibération multi-agent ([Nature:Kraidia 2026][10]). Donc persuasion power ≠ epistemic authority.

---

## 33. Variant Byzantine-Resilient

Si certains membres peuvent être compromised, malfunctioning, prompt-injected, strategically deceptive — ne pas utiliser simple majority. Le système doit permettre local filtering, evidence verification, reputation bounds, graph robustness, quarantine. Un travail de 2026 propose un protocole de consensus multi-LLM visant explicitement la tolérance à des agents byzantins, avec filtrage local ([arXiv:Lee 2026][11]). GenOS a déjà beaucoup des primitives nécessaires avec immune system, quarantine, provenance, independence graph.

---

## 34. Biocénose massive : 100 ou 1000 agents

Le `hierarchicalQuorumService` possède déjà local quorum → global quorum pour de grands groupes. Mais l'implémentation actuelle réduit chaque cluster à one winning value puis les winners votent. Cela peut détruire une minorité importante. Exemple : Cluster A 51 X / 49 Y → X ; Cluster B 51 X / 49 Y → X → 100% X alors que la population réelle était 51% X / 49% Y. C'est une perte catastrophique d'information.

---

## 35. Le hierarchical quorum doit transmettre une distribution

Chaque cluster doit retourner distribution, confidence, effectiveDiversity, evidence refs, minority claims, critical objections. Pas juste winner=X.

---

## 36. Et la minorité doit disposer d'un bypass

Si un cluster contient 1 verified counterexample il doit pouvoir atteindre directement le niveau supérieur même si 99 autres agents ne le soutiennent pas. Appelons cela Minority Evidence Escalation Channel.

---

## 37. Representative sampling pour 1000 agents

Créer des sous-panels selon expertise, independence, evidence niche, error history. Puis recruter davantage seulement si uncertainty remains high. Donc la taille communautaire devient adaptative.

---

## 38. Community stopping rule

On arrête lorsque ExpectedValueOfAnotherRound < RoundCost. Approximé avec belief change rate, new evidence rate, remaining contradictions, confidence interval, critical dissent. Si trois rounds ne changent plus rien : stop. Mais stable disagreement peut être la bonne sortie.

---

## 39. Cas : revue de code à haut risque

« Cette modification auth peut-elle être mergée ? » Biocénose : 2 independent code reviewers + security reviewer + test verifier + invariant reviewer + observer. Sortie : accepted token validation correct, contested refresh rotation, blocking dissent : reproducible replay attack. Même si quatre reviewers approuvent, le test bloquant empêche le merge.

---

## 40. Cas : recherche scientifique

Mission : « Quelle conclusion les données permettent-elles réellement ? » Populations : literature reviewers, methodology reviewers, statistical reviewer, replication reviewer, skeptic. La sortie n'est pas answer=A mais well-supported claims, weak claims, open controversies, missing experiments.

---

## 41. Cas : deep research sur sources contradictoires

official sources, academic literature, industry, independent audits, community reports. Chaque sous-communauté produit une position. Puis claims, sources, contradictions sont confrontés. C'est nettement meilleur qu'une synthèse LLM qui lisse les contradictions.

---

## 42. Cas : architecture logicielle sans oracle unique

« Monolithe modulaire ou microservices ? » La communauté peut représenter operations, developer productivity, security, cost, scalability. La sortie correcte peut être : Option A dominates under conditions X / Option B dominates under conditions Y. Donc PARETO_PLURALISM est souvent meilleur que consensus forcé.

---

## 43. Cas : sécurité

Plusieurs équipes : defender, attacker, implementation reviewer, incident responder, formal verifier. Le consensus n'autorise pas une vulnérabilité. Une seule faille reproductible : critical dissent bloque le résultat.

---

## 44. Cas : validation modèle ML/IA

Communauté : performance, bias/fairness evaluation, distribution shift, adversarial evaluation, calibration, operational monitoring. Les désaccords sont conservés par dimension. Cela évite qu'un bon score moyen efface une faille critique.

---

## 45. Cas : jugement de benchmarks LLM

Très intéressant pour GenOS lui-même. Plutôt qu'un seul LLM-as-judge : independent judges, blind answer identity, claim-level scoring, calibration, adversarial critic, puis agrégation. Des travaux récents tels que D3 utilisent justement anonymisation, diversification de rôles et débat budgété pour améliorer l'évaluation multi-agent ([ACL Anthology:D3][12]).

---

## 46. Cas : décision organisationnelle

Lorsque plusieurs critères légitimes s'opposent : engineering, cost, operations, security, user experience. La Biocénose peut expliciter facts, trade-offs, disagreements mais laisser le choix de valeurs final à l'humain.

---

## 47. Biocénose vs Trinity

Si on peut construire un test discriminant : Trinity. Si la qualité dépend surtout de connaissances distribuées, contestation et jugement : Biocénose.

---

## 48. Et les deux peuvent être imbriquées

Biocénose identifie deux affirmations irréconciliables (C17 true / C17 false) mais constate qu'une expérience peut trancher. Alors ESCALATE_EXPERIMENT → local Trinity → result → Biocénose updates beliefs. C'est une excellente composition.

---

## 49. Biocénose vs A-Team

A-Team = different responsibilities. Biocénose = different judgments. A-Team construit. Biocénose juge, confronte et légitime épistémiquement.

---

## 50. Biocénose vs Métapopulation

Métapopulation cherche à conserver des populations semi-indépendantes over time. Biocénose cherche collective judgment. Une Métapopulation peut contenir plusieurs communautés Biocénose locales.

---

## 51. Biocénose vs Syncytium

Syncytium veut shared state convergence. Biocénose doit préserver independent private belief jusqu'au bon moment. Trop de Syncytium détruirait précisément la valeur de Biocénose.

---

## 52. Architecture ultime

```text
                         QUESTION
                            │
                            ▼
                    Question Classifier
                            │
                            ▼
                 Community Constitution
                       [COMMITTED]
                            │
                            ▼
                  Community Formation
          expertise + diversity + independence
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
        Member A        Member B         Member C...
            │               │               │
            └──── SEALED INDEPENDENT ───────┘
                            │
                            ▼
                     Commitments
                            │
                            ▼
                       Claim Graph
                            │
            ┌───────────────┼────────────────┐
            ▼               ▼                ▼
         Reviewers       Verifiers       Dissent scouts
            │               │                │
            └────── structured challenge ────┘
                            │
                            ▼
                    Evidence Resolution
                            │
                            ▼
                    Belief Revision Round
                            │
                            ▼
                Independence / Groupthink Gate
                            │
                            ▼
                  Aggregation Policy Router
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
          Oracle       Probability       Argument/
          based          pooling          pluralism
             │              │              │
             └──────────────┴──────────────┘
                            │
                            ▼
                    Community Judgment
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
       consensus          dissent         unresolved
          │                 │                 │
          └─────────────────┴─────────────────┘
                            │
                            ▼
                      Learning
           calibration / reputation / protocol
```

---

## 53. Ce qui rendrait Biocénose vraiment exceptionnelle

Pas : plusieurs agents votent. Pas : plusieurs agents débattent.

Le différenciateur potentiel serait :
```text
protocol committed before answers
+ sealed independent judgments
+ effective cognitive diversity
+ error-correlation measurement
+ claim-level argument graphs
+ evidence-first authority
+ historical calibration
+ domain-specific reputation
+ anonymous structured deliberation
+ explicit belief updates
+ groupthink/conformity detection
+ minority evidence preservation
+ adaptive recruitment
+ aggregation rule chosen by question type
+ Byzantine resistance
+ hierarchical deliberation without losing dissent
+ experiment escalation into Trinity
+ pluralism as valid final outcome
```

C'est une combinaison beaucoup plus ambitieuse qu'un « council of LLMs ».

---

## 54. L'invariant fondamental

Je résumerais Biocénose ultime par :
> **A community is not successful because everyone agrees.**
> **A community is successful when every material claim has been independently proposed, properly challenged, evidentially evaluated, and the final judgment preserves both what the evidence supports and what remains legitimately disputé.**

Si le processus aboutit à un consensus robuste, très bien. S'il aboutit à 60% A / 35% B / 5% abstention avec une objection minoritaire parfaitement valide, **le bon fonctionnement du système consiste précisément à ne pas faire disparaître cette objection**.

C'est là que Biocénose pourrait devenir l'une des topologies les plus importantes de GenOS : **Trinity permettrait à GenOS de faire de la science expérimentale ; Biocénose lui permettrait de construire une véritable épistémologie collective.**

---

## 55. Contrat runtime

### CommunitySession

```typescript
CommunitySession {
    sessionId
    missionId
    constitutionHash
    questionType  // factual | probabilistic | design | normative | exploratory
    variant  // epistemic_jury | delphi | adversarial_assembly | forecasting_crowd | argumentation | polycentric | byzantine_resilient | minority_preserving | representative | persistent | human_ai | hybrid_oracle
    members[]
    claimGraph
    argumentGraph
    dissentLedger
    conformityMonitor
    observer
    aggregationPolicy
    status
    roundCount
    judgment
}
```

### CommunityMember

```typescript
CommunityCommunityMember {
    memberId
    role  // generator | reviewer | verifier | dissent_scout | aggregator | observer
    model
    provider
    cognitiveRecipe
    capabilities
    calibrationProfile
    independenceScore
    sealedCommitment
    currentPosition
    beliefUpdateHistory
}
```

### Claim

```typescript
Claim {
    claimId
    statement
    proposerId
    evidenceRefs[]
    argumentRefs[]
    supportScore
    attackScore
    status  // accepted | rejected | contested | unresolved
}
```

### CommunityJudgment

```typescript
CommunityJudgment {
    acceptedClaims[]
    rejectedClaims[]
    contestedClaims[]
    unresolvedQuestions[]
    supportedOptions[]
    dominatedOptions[]
    majorityPosition
    minorityPositions[]
    evidenceGraph
    confidence
    calibrationBasis
    dissentReport
    decisionStatus  // VERIFIED_CONSENSUS | ROBUST_CONSENSUS | QUALIFIED_CONSENSUS | PLURALITY_WITH_DISSENT | PARETO_PLURALISM | IRREDUCIBLE_DISAGREEMENT | REQUEST_MORE_EVIDENCE | ESCALATE_EXPERIMENT | HUMAN_JUDGMENT_REQUIRED
}
```

---

## 56. Architecture du système (fichiers)

| Fichier | Rôle |
|---------|------|
| `backend/src/services/biocenoseService.js` | Analyse de mission et activation |
| `backend/src/services/biologicalModeService.js` | Composition des rôles |
| `backend/src/services/epistemic/epistemicBiocenoseService.js` | Diversité fonctionnelle, détection monoculture |
| `backend/src/services/epistemic/epistemicIndependenceService.js` | Indépendance épistémique |
| `backend/src/services/agentRuntimeAdapter/index.js` | Dispatch des agents |
| `backend/src/services/hierarchicalQuorumService.js` | Quorum hiérarchique |

---

## 57. Télémétrie et observabilité

Nouvelles métriques enregistrées pour chaque session Biocénose :
```text
sessionId, variant, questionType, roundCount, constitutionHash
members: [{memberId, role, model, provider, independenceScore, calibrationScore}]
claimGraph: {nodes, edges, accepted, rejected, contested}
dissentLedger: [{claimId, supporters, evidenceStrength, independence, status}]
conformity: {socialUpdates, evidentialUpdates, groupthinkRisk}
aggregation: {method, weights, diversityDimensions}
judgment: {decisionStatus, confidence, dissentPreserved}
calibration: [{memberId, brierBefore, brierAfter, logScore}]
```

---

## 58. Références internes

- [ORCHESTRATION.md](../orchestration.md) : orchestration générale, gates et preuves
- [TRINITY.md](trinity.md) : orchestration comparative par hypothèses
- [A_TEAM.md](a-team.md) : orchestration multidisciplinaire par domaines
- [BIOME.md](biome.md) : orchestration par environnement et populations
- [METAPOPULATION.md](metapopulation.md) : orchestration par populations semi-indépendantes
- [biocenoseService.js](../../../backend/src/services/biocenoseService.js) : activation de Biocénose
- [epistemicBiocenoseService.js](../../../backend/src/services/epistemic/epistemicBiocenoseService.js) : diversité épistémique

---

## 59. Références externes

| Référence | Apport pour Biocénose |
|-----------|----------------------|
| [Neyman & Roughgarden, Scoring Rules 2023](https://pubsonline.informs.org/doi/10.1287/opre.2022.2414) | Proper scoring rules pour agrégation de probabilités |
| [Zhu et al., MAD Confidence & Diversity 2026](https://aclanthology.org/2026.findings-acl.1694/) | Diversité initiale + confiance calibrée dans le débat multi-agent |
| [Okawa, Biased Consensus 2026](https://arxiv.org/abs/2608.02827) | Émergence de consensus biaisés, rôle de la conformité |
| [PubMed, Hidden Profiles](https://pubmed.ncbi.nlm.nih.gov/17144766/) | Le dissent améliore la qualité de décision en hidden profile |
| [PMC, Wisdom Crowd Diversity](https://pmc.ncbi.nlm.nih.gov/articles/PMC7549292/) | Indépendance des erreurs et sagesse des foules |
| [ACL:ARGSBASE, Structured Deliberation 2026](https://aclanthology.org/2026.eacl-demo.39/) | Interface multi-agent pour délibération structurée |
| [BMJ:DCAT, Delphi Appraisal 2025](https://www.bmj.com/content/391/bmj-2025-084509) | Outil d'évaluation critique de la méthode Delphi |
| [Wiley:Condorcet, Voting Rules 2025](https://onlinelibrary.wiley.com/doi/epdf/10.1111/cogs.70242) | Comparaison empirique de règles de vote |
| [PubsOnline:Atanasov, Prediction Markets 2016](https://pubsonline.informs.org/doi/10.1287/mnsc.2015.2374) | Agrégation statistique vs sondages de prévision |
| [Nature:Kraidia, Adversarial Persuasion 2026](https://www.nature.com/articles/s41598-026-42705-7) | Persuasion adverse dans le débat multi-agent |
| [arXiv:Lee, Byzantine Faults 2026](https://arxiv.org/abs/2605.09076) | Tolérance aux fautes byzantines dans consensus multi-LLM |
| [ACL:D3, Adversarial Evaluation 2026](https://aclanthology.org/2026.eacl-long.392/) | Débat budgété pour évaluation fiable et interprétable |

---

## 60. Implementation & capacités (GenOS v3)

Depuis la v3, cette topologie est câblée au runtime :
- Service de coordination : `biocenoseService.js`.
- Capacités requises : `EVIDENCE_BARRIER`, `EPISTEMIC_INDEPENDENCE`, `ARGUMENT_GRAPH`, `DELIBERATION_PROTOCOL`, `CALIBRATION_ENGINE`, `CONFORMITY_MONITOR`, `BYZANTINE_RESISTANCE`, `DISSENT_PRESERVATION`.
- Contrat exposé par `topologyCapabilityService` et rendu effectif dans les leases d'outils.
