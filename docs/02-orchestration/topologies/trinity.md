# Trinity — Laboratoire Scientifique Interne de GenOS

> *Trinity est le protocole expérimental de GenOS pour les situations où plusieurs hypothèses, méthodes ou conceptions plausibles doivent être testées indépendamment avant qu'une décision fiable puisse être prise.*

---


<!-- === PARTIE 1 === -->

1|# Trinity — Fondations & Architecture
2|
3|## 1. Définition
4|
5|**Trinity** est le protocole expérimental de GenOS pour les situations où plusieurs hypothèses, méthodes ou conceptions plausibles doivent être testées indépendamment avant qu'une décision fiable puisse être prise.
6|
7|Contrairement à un simple passage multi-essai, Trinity structure l'espace des possibles en **trois chambres épistémiques** distinctes, chacune portant un rapport différent à la vérité :
8|- Une chambre **directe** (rapide, heuristique)
9|- Une chambre **structurée** (modèle formel, chaîne de raisonnement)
10|- Une chambre **adversariale** (falsification, recherche de contre-exemples)
11|
12|Chaque chambre produit un monde d'expérimentation scellé, indépendant, traçable. La décision finale agrège leurs résultats selon un calcul explicite de valeur d'information.
13|
14|---
15|
16|## 2. Comparaison conceptuelle
17|
18|### Tableau comparatif
19|
20|| Paradigme | Mécanisme principal | Diversité cognitive | Garantie de sortie | Coût relatif |
21||-----------|---------------------|---------------------|--------------------|--------------|
22|| **Best-of-N** | Générations parallèles, sélection par score | Faible (même prompt, même cadre) | Meilleur des N, mais biais partagé | N × coût unitaire |
23|| **Self-consistency** | Majorité/consensus sur sorties multiples | Très faible (même chambre, même biais) | Stabilité apparente, pas justesse | N × coût unitaire |
24|| **Débat** | Dialogue itératif agent↔agent | Modérée (perspectives en interaction) | Argument le plus convaincant, mais convergence précoce possible | Itérations × 2 × coût |
25|| **Trinity** | Trois chambres aux épistémies **orthogonales** | Élevée (chambre indépendante, pas de communication) | Agrégation pondérée par valeur d'information | 3 × coût (constant, maîtrisé) |
26|
27|### Explication
28|
29|Best-of-N suppose que la réponse correcte apparaîtra statistiquement dans l'échantillon — vrai seulement si le générateur couvre l'espace des solutions, ce qui n'est pas garanti. Self-consistency amplifie ce biais : le consensus mesure l'accord entre copies, pas la vérité. Le Débat introduit de la divergence par l'interaction, mais crée une pression de convergence sociale (le plus persuasif ne raisonne pas forcément le mieux).
30|
31|Trinity **ne dialogue pas**. Chaque chambre travaille sur le même problème sans connaître les autres. L'indépendance est contractuelle et vérifiable. La divergence est donc structurelle, pas accidentelle — c'est ce qui lui permet de détecter des erreurs que les autres paradigmes ratent systématiquement (biais partagés, erreurs de modèle partillées, aveuglements communs).
32|
33|---
34|
35|## 3. Les trois chambres épistémiques
36|
37|### 3.1 Chambre Directe / Parsimonieuse
38|
39|**Principe :** Produire la réponse la plus naturelle, la plus économique en raisonnement. « Qu'est-ce qu'un expert compétent répondrait intuitivement ? »
40|
41|**Force :** Rapidité. Représentativité du jugement typique. Base de comparaison.
42|
43|**Modèles :** Modèles « généraux », prompts courts, chaîne de pensée minimale mais complète.
44|
45|**Hypothèse sous-jacente :** Pour les problèmes bien posés, l'intuition experte est calibrée — la première réponse correcte vaut souvent les suivantes.
46|
47|**Risque :** Illusion de familiarité. Pattern-matching superficiel. Confirmation du cadre existant.
48|
49|---
50|
51|### 3.2 Chambre Structurée / Model-Based
52|
53|**Principe :** Construire un modèle explicite du problème (formel ou semi-formel), le parcourir méthodiquement, produire une déduction.
54|
55|**Force :** Vérifiabilité pas-à-pas. Explicabilité. Robustesse sur les problèmes compositionnels.
56|
57|**Modèles :** Modèles « raisonnement », outils formels (preuve, calcul, simulation), structuration en hypothèses → déduction → conclusion.
58|
59|**Hypothèse sous-jacente :** L'erreur vient souvent de raisonnements incomplets ou sautés — un modèle explicite force la complétude locale.
60|
61|**Risque :** Surconfiance dans le modèle. Erreur de modélisation non détectée. Lourdeur computationnelle.
62|
63|---
64|
65|### 3.3 Chambre Falsification / Adversarial
66|
67|**Principe :** Chercher activement à réfuter les conclusions des deux autres chambres. « Qu'est-ce qui pourrait faire échouer cette réponse ? Quel contre-exemple existe ? »
68|
69|**Force :** Détection des erreurs partagées. Test des limites. Résistance au biais de confirmation.
70|
71|**Modèles :** Modèles « critiques », prompts adversariaux, génération de contre-exemples, test de robustesse.
72|
73|**Hypothèse sous-jacente :** La vérité résiste mieux à la réfutation que l'erreur — la falsification est asymétriquement informative.
74|
75|**Risque :** Skepticisme excessif. Coût de la recherche de contre-exemples inexistants. Découragement de réponses correctes mais fragiles.
76|
77|---
78|
79|## 4. Le Hypothesis Designer
80|
81|Avant toute exécution, Trinity passe par un **Hypothesis Designer** qui extrait et structure le problème.
82|
83|### 4.1 Extraction
84|
85|À partir de la mission, le Hypothesis Designer produit :
86|
87|- **Problème central** : formulation en une phrase, sans ambiguïté de portée
88|- **Assumptions** : liste explicite des présupposés (chaque assumption est une proposition testable)
89|- **Uncertainties** : variables dont la valeur réelle est inconnue (classifiées par impact et réversibilité)
90|- **Decision variables** : choix discrets ou continus que la décision finale doit fixer
91|
92|### 4.2 Fonction d'utilité inter-hypothèses
93|
94|Pour trois hypothèses candidates $H_1, H_2, H_3$, Trinity évalue leur couverture conjointe via la fonction d'utilité :
95|
96|$$
97|U(H_1, H_2, H_3) = \underbrace{C(H_1, H_2, H_3)}_{\text{coverage}} \;+\; \underbrace{O(H_1, H_2, H_3)}_{\text{orthogonality}} \;+\; \underbrace{F(H_1, H_2, H_3)}_{\text{falsifiability}} \;-\; \underbrace{R(H_1, H_2, H_3)}_{\text{redundancy}} \;-\; \underbrace{C_{\text{computational}}(H_1, H_2, H_3)}_{\text{cost}}
98|$$
99|
100|Où chaque composante est définie comme suit :
101|
102|**Coverage** (étendue de l'espace des solutions couvert) :
103|$$
104|C(H_1, H_2, H_3) = \frac{|\mathcal{S}(H_1) \cup \mathcal{S}(H_2) \cup \mathcal{S}(H_3)|}{|\mathcal{S}_{\text{possible}}|}}
105|$$
106|
107|**Orthogonalité** (dépendance minimale entre hypothèses) :
108|$$
109|O(H_1, H_2, H_3) = 1 - \frac{1}{3}\sum_{i < j} \text{Jaccard}\big(\mathcal{B}(H_i), \mathcal{B}(H_j)\big)
110|$$
111|
112|avec $\mathcal{B}(H)$ l'ensemble des croyances/axiomes mobilisés par l'hypothèse $H$.
113|
114|**Falsifiabilité** (capacité de chaque hypothèse à être réfutée) :
115|$$
116|F(H_1, H_2, H_3) = \min_{i \in \{1,2,3\}} \; \mathbb{P}\big(\text{observer un contre-exemple} \mid H_i \text{ fausse}\big)
117|$$
118|
119|**Redondance** (information partagée, pénalité) :
120|$$
121|R(H_1, H_2, H_3) = \sum_{i < j} I(H_i ; H_j)
122|$$
123|
124|où $I(H_i ; H_j)$ est l'information mutuelle entre les distributions de sortie de $H_i$ et $H_j$.
125|
126|**Coût** (ressources requises) :
127|$$
128|C_{\text{computational}}(H_1, H_2, H_3) = \alpha \cdot \sum_{i=1}^{3} \text{tokenBudget}(H_i) + \beta \cdot \max_i \text{latency}(H_i)
129|$$
130|
131|### 4.3 Sélection des trois hypothèses
132|
133|Le Hypothesis Designer sélectionne le triplet $(H_1^*, H_2^*, H_3^*)$ qui maximise $U$ sous contraintes :
134|
135|$$
136|(H_1^*, H_2^*, H_3^*) = \underset{(H_1, H_2, H_3) \in \mathcal{H}^3}{\arg\max} \; U(H_1, H_2, H_3)
137|$$
138|
139|$$
140|\text{s.c.} \quad \forall i \neq j : O(H_i, H_j) \geq \theta_{\text{orth}} \quad \text{et} \quad \sum_{i} \text{cost}(H_i) \leq B_{\text{total}}
141|$$
142|
143|---
144|
145|## 5. Calcul de l'espérance de valeur EV(Trinity)
146|
147|Trinity n'est pas exécutée pour toute mission. Le **Expected Value** du protocole est calculé avant engagement :
148|
149|$$
150|\text{EV}(\text{Trinity}) = \underbrace{P_{\text{useful}}}_{\text{alt. utile existe}} \times \underbrace{I}_{\text{impact}} \times \underbrace{V}_{\text{verifiability}} \;-\; \underbrace{C_{\text{compute}}}_{\text{coût d'exécution}}
151|$$
152|
153|### 5.1 Signaux composant $P_{\text{useful}}$
154|
155|$P_{\text{useful}}$ est la probabilité qu'une alternative meilleure existe. Elle est estimée par combinaison des signaux :
156|
157|$$
158|P_{\text{useful}} = \sigma\!\left( w_1 \cdot \underbrace{N_{\text{plausible}}}_{\text{hypothèses plausibles}} + w_2 \cdot \underbrace{U_{\text{domain}}}_{\text{incertitude}} + w_3 \cdot \underbrace{C_{\text{wrong}}}_{\text{coût erreur}} + w_4 \cdot \underbrace{(1 - R_{\text{rev}})}_{\text{irréversibilité}} + w_5 \cdot \underbrace{A_{\text{oracle}}}_{\text{oracles disponibles}} - w_6 \cdot \underbrace{\rho_{\text{err}}}_{\text{corrélation erreurs}} - w_7 \cdot \underbrace{(1 - B_{\text{ratio}})}_{\text{budget ratio}} \right)
159|$$
160|
161|où $\sigma(x) = \frac{1}{1 + e^{-x}}$ est la fonction logistique, et les poids $w_i$ sont calibrés par méta-apprentissage sur les expériences passées.
162|
163|### 5.2 Décomposition des signaux
164|
165|| Signal | Symbole | Nature | Effet sur $P_{\text{useful}}$ |
166||--------|---------|--------|-------------------------------|
167|| Nombre d'hypothèses plausibles | $N_{\text{plausible}}$ | Compteur ($\geq 3$) | Plus il y a de candidates, plus une alternative meilleure est probable |
168|| Incertitude du domaine | $U_{\text{domain}}$ | Entropie subjective $[0,1]$ | Plus le domaine est incertain, plus un simple passage rate |
169|| Coût d'une mauvaise décision | $C_{\text{wrong}}$ | Monétaire/temporel | Plus l'erreur coûte cher, plus explorer est rationnel |
170|| Réversibilité | $R_{\text{rev}}$ | Probabilité $[0,1]$ | Si l'erreur est réversible, Trinity est moins nécessaire |
171|| Disponibilité d'oracles | $A_{\text{oracle}}$ | Booléen pondéré | Un oracle (test, simulation, humain) augmente la valeur de l'expérience |
172|| Corrélation probable des erreurs | $\rho_{\text{err}}$ | Coefficient $[-1,1]$ | Si les chambres risquent de se tromper ensemble, Trinity perd en valeur |
173|| Ratio budget | $B_{\text{ratio}} = \frac{C_{\text{compute}}}{B_{\text{total}}}$ | Fraction $[0,1]$ | Si le coût excède le budget, le protocole est non-viable |
174|
175|### 5.3 Impact $I$
176|
177|$$
178|I = \mathbb{E}\big[ \text{gain qualité} \mid \text{meilleure alternative trouvée} \big] \times \text{proba de la choisir}
179|$$
180|
181|Modélisé comme la différence espérée entre la qualité de la réponse « simple » et la qualité de la réponse Trinity :
182|
183|$$
184|I = Q_{\text{baseline}} \cdot \left( \frac{Q_{\text{trinity}}}{Q_{\text{baseline}}} - 1 \right)
185|$$
186|
187|### 5.4 Vérifiabilité $V$
188|
189|$$
190|V = \mathbb{P}\big( \text{identifier correctement la meilleure chambre} \mid \text{réponses produites} \big)
191|$$
192|
193|Dépend de la disponibilité d'oracles externes (tests unitaires, simulations, juges humains, métriques objectives).
194|
195|### 5.5 Coût $C_{\text{compute}}$
196|
197|$$
198|C_{\text{compute}} = \sum_{c \in \{\text{direct, structured, falsification}\}} \big( \text{tokenBudget}_c \times \text{unitCost}_{\text{token}} + \text{latency}_c \times \text{unitCost}_{\text{time}} \big)
199|$$
200|
201|### 5.6 Condition d'engagement
202|
203|Trinity est engagée si et seulement si :
204|
205|$$
206|\text{EV}(\text{Trinity}) > \tau_{\text{engagement}} \quad \text{et} \quad B_{\text{ratio}} \leq 1
207|$$
208|
209|où $\tau_{\text{engagement}}$ est un seuil calibré selon la politique de risque de l'organisation.
210|
211|---
212|
213|## 6. Contrat TrinityExperiment
214|
215|Le contrat d'expérience Trinity définit l'ensemble des paramètres qui gouvernent un run complet :
216|
217|```typescript
218|interface TrinityExperiment {
219|  // Identité
220|  experimentId: string;           // UUID v7
221|  missionId: string;              // Référence à la mission parente
222|  missionSnapshotHash: string;    // SHA-256 de l'état de mission au moment du lancement
223|
224|  // Classification
225|  domain: DomainLabel;            // e.g., "architecture", "algorithm", "design"
226|  variant: TrinityVariant;        // e.g., "standard", "compressed", "extended"
227|
228|  // Design
229|  hypothesisDesign: {
230|    centralProblem: string;
231|    assumptions: Assumption[];
232|    uncertainties: Uncertainty[];
233|    decisionVariables: DecisionVariable[];
234|    candidateHypotheses: Hypothesis[];
235|    selectedTriplet: [Hypothesis, Hypothesis, Hypothesis];
236|    utilityScore: number;
237|  };
238|
239|  // Chambres
240|  chambers: [ChamberConfig, ChamberConfig, ChamberConfig];
241|
242|  // Variables expérimentales
243|  controlledVariables: Record<string, unknown>;  // Fixées identiques pour les 3 chambres
244|  independentVariables: Record<string, ChamberId, unknown>;  // Propres à chaque chambre
245|
246|  // Politiques
247|  isolationPolicy: {
248|    sharedMemory: "none" | "read-only-snapshot";
249|    communication: "forbidden" | "structured-only";
250|    provenanceTracking: "full" | "hashes-only";
251|    randomSeedPerChamber: boolean;
252|  };
253|  budgetPolicy: {
254|    totalTokens: number;
255|    perChamberTokens: [number, number, number];
256|    maxLatencyMs: number;
257|    overflowBehavior: "truncate" | "escalate" | "reject";
258|  };
259|  verifierPolicy: {
260|    oracleType: "test" | "simulation" | "human" | "metric" | "none";
261|    votingRule: "majority" | "weighted" | "ev-based" | "falsification-priority";
262|    tieBreaker: "falsification-wins" | "structured-wins" | "human-judge";
263|  };
264|
265|  // État
266|  status: "designed" | "sealed-phase" | "cross-examination" | "aggregated" | "decided";
267|  decision: TrinityDecision | null;
268|}
269|```
270|
271|---
272|
273|## 7. Contrat TrinityWorld
274|
275|Chaque chambre produit un **TrinityWorld** — l'enregistrement complet du raisonnement et des artefacts d'une chambre :
276|
277|```typescript
278|interface TrinityWorld {
279|  // Identité
280|  worldId: string;                // UUID v7
281|  chamber: "direct" | "structured" | "falsification";
282|  hypothesis: Hypothesis;         // L'hypothèse assignée à cette chambre
283|
284|  // État épistémique
285|  assumptions: Assumption[];      // Hypothèses de travail explicites
286|  falsificationCriteria: FalsificationCriteria;  // Conditions de réfutabilité
287|  model: ModelArtifact;           // Le modèle construit (formel, code, graphe...)
288|
289|  // Configuration d'exécution
290|  provider: ProviderConfig;       // Modèle, paramètres, endpoint
291|  cognitiveRecipe: CognitiveRecipe; // Prompt template, chaîne d'outils mentale
292|  toolchain: Tool[];              // Outils disponibles (calcul, recherche, preuve...)
293|
294|  // Politiques de connaissance
295|  retrievalPolicy: {
296|    type: "none" | "structured" | "rag";
297|    allowedSources: string[];
298|    maxRetrievalTokens: number;
299|  };
300|
301|  // Aléatoire maîtrisé
302|  randomSeed: number;             // Seed reproductible
303|  tokenBudget: number;            // Budget maximal de tokens
304|
305|  // Provenance & reproductibilité
306|  workspaceSnapshot: string;      // Hash de l'état initial du workspace
307|  initialCommit: string;          // Commit git du point de départ
308|  finalCommit: string;            // Commit git produit par la chambre
309|
310|  // Sorties
311|  evidenceDossier: EvidenceDossier;  // Toutes les preuves collectées
312|  claimGraph: ClaimGraph;            // Graphe des revendications → inférences
313|}
314|```
315|
316|Le `ClaimGraph` est un DAG orienté :
317|
318|$$
319|G = (V, E), \quad V = \{c_1, \ldots, c_n\} \text{ (revendications)}, \quad E = \{(c_i, c_j) \mid c_i \text{ soutient } c_j\}
320|$$
321|
322|Chaque nœud $c_i$ porte un **confidence score** $s_i \in [0,1]$ et une **traçabilité** vers la source de l'évidence.
323|
324|---
325|
326|## 8. Phases d'exécution
327|
328|### Phase A — SEALED (Scellée)
329|
330|Chaque chambre travaille **isolément** sur le même problème, avec sa propre épistémie et son propre modèle. Aucune communication. Aucune lecture des sorties des autres. Les sorties ne sont révélées qu'à la fin de la phase.
331|
332|**Objectif :** Maximiser la divergence des approches (indépendance cognitive).
333|
334|**Livrables par chambre :**
335|- Un `TrinityWorld` complet
336|- Un ensemble de revendications avec confidences
337|- Un dossier de preuves
338|- Un modèle/raisonnement explicite
339|
340|### Phase B — CROSS-EXAMINATION (Examen croisé)
341|
342|Les trois `TrinityWorld` sont révélés simultanément. Le système procède à :
343|
344|1. **Alignement sémantique** : identifier les revendications équivalentes entre chambres
345|2. **Conflit detection** : repérer les revendications contradictoires
346|3. **Robustesse evaluation** : chaque revendication est notée par les autres chambres (la directe évalue la falsification, etc.)
347|4. **Agrégation** : application de la règle de vote pondérée par $V$ et l'EV calculée
348|
349|### Schéma de séquence Mermaid
350|
351|```mermaid
352|sequenceDiagram
353|    participant M as Mission
354|    participant HD as Hypothesis Designer
355|    participant EV as EV Calculator
356|    participant C1 as Chambre Directe
357|    participant C2 as Chambre Structurée
358|    participant C3 as Chambre Falsification
359|    participant XA as Cross-Examiner
360|    participant D as Décision
361|
362|    M->>HD: mission description
363|    HD->>HD: extraction problème/assumptions/uncertainties
364|    HD->>HD: génération candidats H*
365|    HD->>HD: optimisation U(H1,H2,H3)
366|    HD->>EV: hypothèses retenues + signaux
367|    EV->>EV: calcul P_useful × I × V - C_compute
368|    EV->>M: EV(Trimony) vs seuil
369|
370|    alt EV ≥ seuil (engagement)
371|        M->>C1: TrinityWorld(direct, H1, snapshot)
372|        M->>C2: TrinityWorld(structured, H2, snapshot)
373|        M->>C3: TrinityWorld(falsification, H3, snapshot)
374|
375|        Note over C1,C3: PHASE A — SEALED
376|        C1->>C1: raisonnement + model
377|        C2->>C2: raisonnement + model
378|        C3->>C3: raisonnement + model
379|
380|        C1->>XA: TrinityWorld complet
381|        C2->>XA: TrinityWorld complet
382|        C3->>XA: TrinityWorld complet
383|
384|        Note over XA: PHASE B — CROSS-EXAMINATION
385|        XA->>XA: alignement sémantique
386|        XA->>XA: détection de conflits
387|        XA->>XA: évaluation croisée
388|        XA->>XA: agrégation pondérée
389|        XA->>D: TrinityDecision
390|    else EV < seuil
391|        M->>D: réponse simple (pas Trinity)
392|    end
393|```
394|
395|---
396|
397|## 9. Critères d'indépendance explicites
398|
399|L'indépendance des chambres n'est pas une promesse — c'est un ensemble de propriétés **vérifiables** enregistrées dans `isolationPolicy` et contrôlées à l'exécution.
400|
401|### 9.1 Same Snapshot (même état de départ)
402|
403|Les trois chambres reçoivent **exactement le même état initial** : même commit git, mêmes fichiers, mêmes variables contrôlées. Aucune chambre ne part d'un état privilégié ou antérieur.
404|
405|$$
406|\forall c_i, c_j : \quad \text{workspaceSnapshot}_i = \text{workspaceSnapshot}_j
407|$$
408|
409|### 9.2 No Communication (aucune communication)
410|
411|Pendant la Phase A, il est **structurellement impossible** pour une chambre de lire ou écrire dans l'espace d'une autre. Pas de canal de message, pas de fichier partagé mutable, pas d'appel de service croisé.
412|
413|$$
414|\forall t \in \text{Phase A}, \; \forall c_i \neq c_j : \quad \text{messages}(c_i, c_j, t) = \emptyset
415|$$
416|
417|### 9.3 No Shared Writable Memory (pas de mémoire partagée modifiable)
418|
419|Le workspace est **cloné** par chambre. Chacune écrit dans son propre espace. Les artefacts ne deviennent partagés qu'au moment du Cross-Examination (Phase B), en lecture seule.
420|
421|$$
422|\forall c_i : \quad \text{writeSet}(c_i) \cap \text{writeSet}(c_j) = \emptyset, \quad i \neq j
423|$$
424|
425|### 9.4 Provenance Tracking (traçabilité complète)
426|
427|Chaque revendication, chaque donnée, chaque paramètre est tracé jusqu'à sa source. Le `ClaimGraph` et le `evidenceDossier` de chaque `TrinityWorld` permettent de reconstruire **pourquoi** chaque conclusion a été atteinte.
428|
429|$$
430|\forall \text{claim } c \in \text{ClaimGraph} : \quad \text{provenance}(c) \in \text{EvidenceDossier}
431|$$
432|
433|### 9.5 Recorded Randomness (aléatoire enregistré)
434|
435|Tout appel à l'aléatoire (sampling du modèle, sélection de contre-exemples, ordre de recherche) utilise un **seed explicite et enregistré**. Toute exécution est donc **reproductible**.
436|
437|$$
438|\forall c_i : \quad \text{randomSeed}_i \text{ est fixe et enregistré dans TrinityWorld}_i
439|$$
440|
441|Cela permet :
442|- La **reproductibilité exacte** d'un run
443|- L'**analyse de sensibilité** (quel changement de seed change la conclusion ?)
444|- La **détection de survenue chanceuse** (une chambre a-t-elle eu « de la chance » ?)
445|
446|---
447|
448|## 10. Résumé opérationnel
449|
450|Trinity est un protocole en **quatre étapes** :
451|
452|1. **Hypothesis Designer** → structure le problème, génère les hypothèses, sélectionne le triplet optimal
453|2. **EV Calculator** → décide si Trinity est justifiée (rapport coût/bénéfice explicite)
454|3. **Phase A (Sealed)** → trois chambres indépendantes produisent des `TrinityWorld`
455|4. **Phase B (Cross-Examination)** → alignement, conflit, agrégation → décision finale
456|
457|Chaque étape est **traçable**, **reproductible**, **auditable**. La sortie n'est pas une réponse — c'est une **décision justifiée par un processus épistémique explicite**.
458|
459|---
460|
461|*Prochaine partie : Trinity — Implémentation & Runtime (Partie 2)*
462|


<!-- === PARTIE 2 === -->

1|# Trinity Topology — Part 2: Scoring, Claim Graph, Merge & Verification
2|
3|> **Scope:** This document specifies the decision plane of the Trinity topology — how candidate worlds are scored, how claims are merged, and how verification gates enforce correctness before promotion. It is normative: every formula, threshold, and procedure described here is the intended operational state of the system.
4|
5|---
6|
7|## 1. Evidence Vector
8|
9|Each candidate world $W_i$ produces an **evidence vector** $\mathbf{E}_i$ that captures ten orthogonal dimensions of quality. The vector is the atomic unit of comparison; no single scalar is ever used to rank worlds.
10|
11|### 1.1 Definition
12|
13|$$
14|\mathbf{E}_i = \langle c, \, r, \, b, \, p, \, n, \, k, \, \ell, \, \sigma, \, u, \, \gamma \rangle
15|$$
16|
17|| Symbol | Dimension | Range | Description |
18||--------|-----------|-------|-------------|
19|| $c$ | Correctness | $[0, 1]$ | Fraction of acceptance criteria satisfied |
20|| $r$ | Coverage | $[0, 1]$ | Fraction of the specification surface exercised |
21|| $b$ | Robustness | $[0, 1]$ | Resistance to adversarial or edge-case inputs |
22|| $p$ | Reproducibility | $[0, 1]$ | Probability of identical output on re-execution |
23|| $n$ | Novelty | $[0, 1]$ | Degree of non-trivial innovation beyond the baseline |
24|| $k$ | Cost | $\mathbb{R}_{\geq 0}$ | Total resource expenditure (compute, tokens, time) |
25|| $\ell$ | Latency | $\mathbb{R}_{\geq 0}$ | Wall-clock time to produce the artifact (ms) |
26|| $\sigma$ | Risk | $[0, 1]$ | Probability of catastrophic failure in production |
27|| $u$ | Uncertainty | $[0, 1]$ | Epistemic uncertainty of the evidence itself |
28|| $\gamma$ | Constraint Coverage | $[0, 1]$ | Fraction of hard constraints satisfied |
29|
30|### 1.2 Per-Dimension Thresholds
31|
32|Each dimension has a **hard floor** $\theta_{\min}$ and a **target** $\theta_{\star}$. A world that fails any hard floor is eliminated regardless of its score on other dimensions.
33|
34|$$
35|\begin{aligned}
36|\theta_{\min} &= \langle 0.70, \, 0.60, \, 0.50, \, 0.80, \, 0.00, \, \infty, \, \infty, \, 0.30, \, 0.50, \, 0.90 \rangle \\
37|\theta_{\star} &= \langle 0.95, \, 0.90, \, 0.85, \, 0.95, \, 0.40, \, \text{budget}, \, \text{SLA}, \, 0.05, \, 0.10, \, 1.00 \rangle
38|\end{aligned}
39|$$
40|
41|**Elimination rule:**
42|
43|$$
44|\text{eliminate}(W_i) \iff \exists d \in \text{dims} : \mathbf{E}_i[d] < \theta_{\min}[d]
45|$$
46|
47|Dimensions $k$ (cost) and $\ell$ (latency) are treated as **budget-constrained** rather than threshold-gated: they enter the Pareto frontier but do not trigger automatic elimination unless they exceed the mission budget.
48|
49|### 1.3 Uncertainty Propagation
50|
51|The uncertainty dimension $u$ modulates confidence in all other dimensions. For any dimension $d$, the **confidence-adjusted value** is:
52|
53|$$
54|\hat{\mathbf{E}}_i[d] = \mathbf{E}_i[d] \cdot (1 - u_i)
55|$$
56|
57|This ensures that worlds with high self-reported uncertainty are penalized proportionally, preventing overconfident but poorly-evidenced candidates from dominating the ranking.
58|
59|---
60|
61|## 2. Scalar Score — V1 vs. Evidence Vector
62|
63|### 2.1 Historical Scalar (V1)
64|
65|The original Trinity scoring used a weighted linear combination:
66|
67|$$
68|S_i^{(V1)} = \alpha \cdot \text{Claims}_i + \beta \cdot \text{Tests}_i + \gamma \cdot \text{Robustness}_i
69|$$
70|
71|where $\alpha + \beta + \gamma = 1$ and $\alpha, \beta, \gamma > 0$.
72|
73|**Limitations of V1:**
74|
75|- Collapses ten dimensions into three, losing orthogonality.
76|- Cannot express trade-offs (e.g., high correctness but high cost).
77|- No mechanism for hard constraints — a world with $\text{ConstraintCoverage} = 0.2$ could still win if Claims and Tests are high.
78|- Weights $\alpha, \beta, \gamma$ are global and cannot adapt to mission priorities.
79|
80|### 2.2 Evidence Vector (Current)
81|
82|The current system uses the full 10-dimensional vector $\mathbf{E}_i$ with Pareto-based elimination (§3). Scalar aggregation is applied **only after** Pareto filtering, using a mission-specific utility function:
83|
84|$$
85|U_i = \sum_{d \in \text{dims}} w_d \cdot f_d(\mathbf{E}_i[d])
86|$$
87|
88|where $w_d$ are mission weights and $f_d$ are per-dimension shaping functions (typically sigmoid or linear).
89|
90|### 2.3 Comparative Summary
91|
92|| Property | $S_i^{(V1)}$ | $\mathbf{E}_i$ (Current) |
93||----------|-------------|--------------------------|
94|| Dimensions | 3 | 10 |
95|| Hard constraints | No | Yes ($\theta_{\min}$) |
96|| Pareto awareness | No | Yes |
97|| Uncertainty handling | None | $u$-modulated |
98|| Mission adaptability | Fixed weights | Configurable $w_d$ |
99|| Elimination | Score threshold | Multi-stage Pareto |
100|| Expressiveness | Scalar only | Full vector + utility |
101|
102|**Justification:** The evidence vector preserves information that scalar aggregation destroys. Two worlds with identical $S_i^{(V1)}$ may have radically different profiles (one may be fast but fragile, another slow but robust). The vector representation enables the Pareto frontier to separate them.
103|
104|---
105|
106|## 3. Pareto Elimination — Three Stages
107|
108|Pareto elimination proceeds in three sequential stages, each reducing the candidate set.
109|
110|### 3.1 Stage 1 — Hard Invariants
111|
112|Eliminate any world that violates a hard constraint:
113|
114|$$
115|\mathcal{W}_1 = \{ W_i \in \mathcal{W}_0 \mid \forall d : \mathbf{E}_i[d] \geq \theta_{\min}[d] \}
116|$$
117|
118|This is a **non-negotiable gate**. No world proceeds if it fails any invariant.
119|
120|### 3.2 Stage 2 — Domain Preferences
121|
122|Apply mission-specific preference ordering. For each pair $(W_i, W_j)$, $W_i$ **dominates** $W_j$ if:
123|
124|$$
125|W_i \succ W_j \iff \forall d : \mathbf{E}_i[d] \geq \mathbf{E}_j[d] \;\land\; \exists d : \mathbf{E}_i[d] > \mathbf{E}_j[d]
126|$$
127|
128|The **Pareto frontier** is the set of non-dominated worlds:
129|
130|$$
131|\mathcal{W}_2 = \{ W_i \in \mathcal{W}_1 \mid \nexists W_j \in \mathcal{W}_1 : W_j \succ W_i \}
132|$$
133|
134|### 3.3 Stage 3 — Final Utility
135|
136|If $|\mathcal{W}_2| > 1$, apply the mission utility function $U_i$ to select the winner:
137|
138|$$
139|W^\star = \arg\max_{W_i \in \mathcal{W}_2} U_i
140|$$
141|
142|### 3.4 Pareto Diagram (ASCII)
143|
144|```
145|Correctness ↑
146|    1.0 │          ★ W₃
147|        │       ★ W₂
148|    0.8 │    ★ W₁
149|        │  ☆ W₄  ☆ W₅
150|    0.6 │☆ W₆
151|        │
152|    0.4 │
153|        └──────────────────→ Cost
154|         0.0   0.5   1.0
155|
156|    ★ = Pareto frontier (W₁, W₂, W₃)
157|    ☆ = Dominated (eliminated in Stage 2)
158|    W₆ = Eliminated in Stage 1 (correctness < θ_min)
159|```
160|
161|---
162|
163|## 4. Claim Graph
164|
165|The **Claim Graph** $\mathcal{G} = (\mathcal{N}, \mathcal{E})$ is a directed hypergraph that represents the logical structure of all claims produced by all candidate worlds.
166|
167|### 4.1 Node Structure
168|
169|Each node $n \in \mathcal{N}$ represents a single claim:
170|
171|```json
172|{
173|  "id": "claim://world-3/claim-7",
174|  "claim": "The sorting algorithm is O(n log n) in the worst case",
175|  "evidence": [
176|    {"type": "benchmark", "value": "n=10^6, time=1.2s", "confidence": 0.98},
177|    {"type": "proof", "value": "master-theorem-case-2", "confidence": 0.95}
178|  ],
179|  "status": "verified",
180|  "source_world": "W_3",
181|  "timestamp": "2026-09-24T10:30:00Z"
182|}
183|```
184|
185|**Status values:**
186|
187|| Status | Meaning |
188||--------|---------|
189|| `proposed` | Claim submitted, not yet evaluated |
190|| `verified` | Passed deterministic verification |
191|| `conditionally_accepted` | Accepted pending dependency resolution |
192|| `rejected` | Failed verification |
193|| `superseded` | Replaced by a stronger claim |
194|
195|### 4.2 Edge Structure
196|
197|Each edge $e \in \mathcal{E}$ represents a logical relationship:
198|
199|```json
200|{
201|  "source": "claim://world-1/claim-3",
202|  "target": "claim://world-2/claim-5",
203|  "relation": "supports",
204|  "weight": 0.85
205|}
206|```
207|
208|**Relation types:**
209|
210|| Relation | Semantics |
211||----------|-----------|
212|| `supports` | Source increases confidence in target |
213|| `contradicts` | Source decreases confidence in target |
214|| `depends_on` | Source must be verified before target can be verified |
215|| `refines` | Target is a stricter version of source |
216|| `equivalent` | Source and target are logically equivalent |
217|
218|### 4.3 Example — Three Worlds
219|
220|Consider three worlds $W_A$, $W_B$, $W_C$ that each propose a claim about system throughput:
221|
222|```
223|World A: "Throughput ≥ 1000 req/s"     [benchmark: 1050 req/s]
224|World B: "Throughput ≥ 800 req/s"      [benchmark: 820 req/s]
225|World C: "Throughput < 900 req/s"      [benchmark: 870 req/s]
226|```
227|
228|**Claim Graph:**
229|
230|```
231|                    ┌─────────────────────┐
232|                    │  claim-A: ≥1000     │
233|                    │  status: verified   │
234|                    │  evidence: 1050     │
235|                    └─────────┬───────────┘
236|                              │ refines
237|                              ▼
238|                    ┌─────────────────────┐
239|                    │  claim-B: ≥800      │◄──── contradicts ────┐
240|                    │  status: verified   │                      │
241|                    │  evidence: 820      │                      │
242|                    └─────────────────────┘                      │
243|                                                                   │
244|                    ┌─────────────────────┐                      │
245|                    │  claim-C: <900      │──────────────────────┘
246|                    │  status: rejected   │
247|                    │  evidence: 870      │
248|                    └─────────────────────┘
249|```
250|
251|**Resolution:** Claim A is the strongest verified claim. Claim B is weaker but consistent. Claim C contradicts the verified evidence and is rejected.
252|
253|---
254|
255|## 5. Claim-Level Fusion
256|
257|When multiple worlds make related claims, the system performs **claim-level fusion** to produce a unified knowledge base.
258|
259|### 5.1 Fusion Rules
260|
261|Given a set of claims $\mathcal{C} = \{c_1, c_2, \dots, c_n\}$ about the same proposition:
262|
263|| Condition | Action |
264||-----------|--------|
265|| All claims agree | Accept with maximum confidence |
266|| Claims contradict | Accept the one with strongest evidence; reject others |
267|| Claims are complementary | Merge into a conjunction |
268|| One claim is negation of another | Apply §5.2 (negation handling) |
269|
270|### 5.2 Negation Handling
271|
272|For a claim $A$ and its negation $\neg B$:
273|
274|- If $A$ is verified and $\neg B$ is equivalent to $A$: **accept $A$, reject $B$**.
275|- If $A$ is verified and $B$ is independent: **accept $A$, accept $\neg B$** (they may both be true in different contexts).
276|- If neither is verified: **conditionally accept both** with confidence proportional to evidence strength.
277|
278|### 5.3 Fusion Output (JSON)
279|
280|```json
281|{
282|  "fusion_id": "fuse://throughput-claim",
283|  "proposition": "System throughput under load",
284|  "result": "accepted",
285|  "winning_claim": "claim://world-A/claim-1",
286|  "confidence": 0.97,
287|  "supporting_claims": [
288|    {"id": "claim://world-A/claim-1", "weight": 0.6},
289|    {"id": "claim://world-B/claim-3", "weight": 0.3}
290|  ],
291|  "rejected_claims": [
292|    {"id": "claim://world-C/claim-2", "reason": "contradicts_verified_evidence"}
293|  ],
294|  "conditional_claims": [
295|    {"id": "claim://world-D/claim-5", "condition": "latency < 50ms"}
296|  ],
297|  "fused_at": "2026-09-24T10:35:00Z"
298|}
299|```
300|
301|### 5.4 Formal Fusion Semantics
302|
303|Let $\mathcal{C}_A$ be the set of claims supporting proposition $P$, and $\mathcal{C}_{\neg P}$ the set supporting its negation. The **fused confidence** in $P$ is:
304|
305|$$
306|\text{conf}(P) = \frac{\sum_{c \in \mathcal{C}_A} w(c) \cdot \text{ev}(c)}{\sum_{c \in \mathcal{C}_A \cup \mathcal{C}_{\neg P}} w(c) \cdot \text{ev}(c)}
307|$$
308|
309|where $w(c)$ is the claim weight and $\text{ev}(c)$ is the evidence strength.
310|
311|---
312|
313|## 6. Verification Hierarchy
314|
315|Verification is organized as a strict hierarchy. Higher-priority verifiers **override** lower-priority ones.
316|
317|### 6.1 Hierarchy (Highest to Lowest Priority)
318|
319|| Priority | Verifier | Description | Override Rule |
320||----------|----------|-------------|---------------|
321|| 1 | Deterministic Verifier | Formal proof, SAT/SMT, type checking | Absolute — cannot be overridden |
322|| 2 | External Evidence | Ground truth from authoritative sources | Overrides all below |
323|| 3 | Independent Reproducibility | Re-execution yields identical result | Overrides all below |
324|| 4 | Validated Process | Process with proven track record | Overrides all below |
325|| 5 | Multi-Judge | Agreement among independent judges | Overrides all below |
326|| 6 | Model Confidence | Self-reported confidence by the model | Overrides majority |
327|| 7 | Majority | Most models agree | Lowest priority |
328|
329|### 6.2 Formal Priority Relation
330|
331|Let $\mathcal{V} = \{v_1, v_2, \dots, v_7\}$ be the set of verifiers ordered by priority. For any claim $c$:
332|
333|$$
334|\text{verdict}(c) = \text{verdict}(v_k) \quad \text{where } k = \min\{ i \mid v_i \text{ produces a verdict on } c \}
335|$$
336|
337|That is, the **highest-priority verifier that produces a verdict determines the outcome**.
338|
339|### 6.3 Deterministic Verifier Details
340|
341|Deterministic verifiers produce **binary, reproducible verdicts**:
342|
343|- **SAT/SMT solvers:** Check logical satisfiability of claim constraints.
344|- **Type checkers:** Verify type safety claims.
345|- **Model checkers:** Verify temporal logic properties.
346|- **Proof assistants (Lean, Coq):** Verify formal mathematical claims.
347|
348|A claim verified by a deterministic verifier is marked `verified` with confidence $1.0$.
349|
350|### 6.4 External Evidence
351|
352|External evidence comes from sources outside the Trinity system:
353|
354|- Benchmark results from standardized suites.
355|- API responses from production systems.
356|- Published scientific results.
357|- Regulatory compliance certificates.
358|
359|External evidence is weighted by **source authority** $a_s \in [0, 1]$:
360|
361|$$
362|\text{ev}_{\text{ext}}(c) = a_s \cdot \text{consistency}(c, \text{observation})
363|$$
364|
365|---
366|
367|## 7. Verification Plane
368|
369|The verification plane is the complete set of tools and procedures available to verify claims.
370|
371|### 7.1 Mermaid Diagram
372|
373|```mermaid
374|graph TD
375|    A[Claim Submitted] --> B{Deterministic<br/>Verifier?}
376|    B -->|Yes| C[SAT/SMT/Lean/Type]
377|    B -->|No| D{External<br/>Evidence?}
378|    C --> E[Verdict: PASS/FAIL]
379|    D -->|Yes| F[Benchmark/API/Publication]
380|    D -->|No| G{Reproducible?}
381|    F --> H[Weighted Confidence]
382|    G -->|Yes| I[Independent Re-execution]
383|    G -->|No| J{Validated<br/>Process?}
384|    I --> K[Match? → PASS]
385|    J -->|Yes| L[Process Audit Trail]
386|    J -->|No| M{Multi-Judge<br/>Panel?}
387|    L --> N[Process Score]
388|    M -->|Yes| O[Blind Jury]
389|    M -->|No| P{LLM Jury<br/>Last Resort}
390|    O --> Q[PoLL Score]
391|    P --> R[Model Confidence]
392|    E --> S[Final Verdict]
393|    H --> S
394|    K --> S
395|    N --> S
396|    Q --> S
397|    R --> S
398|```
399|
400|### 7.2 Verification Tools
401|
402|| Tool | Type | Priority | Output |
403||------|------|----------|--------|
404|| Unit tests | Deterministic | 1 | PASS/FAIL per test |
405|| Property tests (QuickCheck) | Deterministic | 1 | PASS/FAIL + counterexample |
406|| SAT/SMT (Z3, CVC5) | Deterministic | 1 | SAT/UNSAT + model |
407|| Lean 4 | Deterministic | 1 | Proof term or error |
408|| SQL invariants | Deterministic | 1 | Constraint violation or clean |
409|| Static analysis (Clippy, Pylint) | Validated Process | 4 | Warning/error levels |
410|| Security scanners (Semgrep, Trivy) | Validated Process | 4 | Vulnerability report |
411|| Benchmark suites | External Evidence | 2 | Performance metrics |
412|| External source validation | External Evidence | 2 | Ground truth match |
413|| LLM jury | Last Resort | 6-7 | Confidence score |
414|
415|### 7.3 Integration Test Gate
416|
417|Before any world is promoted, it must pass **integration tests** that verify:
418|
419|1. The artifact compiles and links correctly.
420|2. All public API contracts are satisfied.
421|3. No regressions against the baseline.
422|4. Performance within SLA bounds.
423|
424|$$
425|\text{integration_pass}(W_i) = \bigwedge_{t \in \text{integration\_suite}} \text{PASS}(t, W_i)
426|$$
427|
428|---
429|
430|## 8. Blind Multi-Model Jury
431|
432|When deterministic verification is impossible and external evidence is unavailable, Trinity convenes a **blind multi-model jury** as a last-resort verifier.
433|
434|### 8.1 Configuration
435|
436|```json
437|{
438|  "jury_config": {
439|    "anonymization": true,
440|    "candidate_ids": ["X", "Y", "Z"],
441|    "models": [
442|      {"id": "judge-1", "model": "claude-sonnet-4-20250514", "role": "evaluator"},
443|      {"id": "judge-2", "model": "gpt-5", "role": "evaluator"},
444|      {"id": "judge-3", "model": "gemini-2.5-pro", "role": "evaluator"},
445|      {"id": "judge-4", "model": "llama-4-maverick", "role": "evaluator"},
446|      {"id": "judge-5", "model": "deepseek-v3", "role": "evaluator"}
447|    ],
448|    "evaluation_criteria": ["correctness", "completeness", "safety", "efficiency"],
449|    "scoring_scale": {"min": 0, "max": 10, "precision": 0.5},
450|    "deliberation_rounds": 2,
451|    "confidence_threshold": 0.7
452|  }
453|}
454|```
455|
456|### 8.2 Anonymization Protocol
457|
458|To prevent brand bias:
459|
460|1. All candidate outputs are stripped of model identifiers.
461|2. Candidates are assigned random IDs (X, Y, Z).
462|3. Output formatting is normalized to a common template.
463|4. Judges evaluate **without knowing** which model produced which output.
464|
465|### 8.3 Bias Avoidance
466|
467|| Bias | Mitigation |
468||------|------------|
469|| Brand bias | Anonymization (§8.2) |
470|| Order bias | Random presentation order per judge |
471|| Anchoring | Independent scoring before deliberation |
472|| Halo effect | Per-criterion scoring, not global |
473|| Social pressure | Independent voting before aggregation |
474|
475|### 8.4 PoLL (Probability of Logically Correct)
476|
477|The jury produces a **PoLL score** for each candidate:
478|
479|$$
480|\text{PoLL}(X) = \frac{1}{|J|} \sum_{j \in J} \text{score}_j(X) \cdot \text{confidence}_j(X)
481|$$
482|
483|where $J$ is the set of judges, $\text{score}_j(X)$ is the raw score, and $\text{confidence}_j(X)$ is the judge's self-reported confidence.
484|
485|**Winner selection:**
486|
487|$$
488|X^\star = \arg\max_{X \in \text{candidates}} \text{PoLL}(X)
489|$$
490|
491|A candidate is promoted only if $\text{PoLL}(X^\star) \geq \tau_{\text{jury}}$, where $\tau_{\text{jury}}$ is the mission-specific threshold (default: $0.7$).
492|
493|---
494|
495|## 9. Four Possible Results
496|
497|The decision plane produces exactly one of four outcomes for each candidate set.
498|
499|### 9.1 PROMOTE_WORLD
500|
501|**Condition:** A single world dominates all others on the Pareto frontier and passes all verification gates.
502|
503|$$
504|\text{PROMOTE\_WORLD}(W^\star) \iff W^\star = \arg\max_{W_i \in \mathcal{W}_2} U_i \;\land\; \text{verification\_pass}(W^\star) \;\land\; |\mathcal{W}_2| = 1
505|$$
506|
507|**Example:** World A achieves correctness $0.98$, cost within budget, and all claims verified by Lean. All other worlds are dominated.
508|
509|### 9.2 SYNTHESIZE_CLAIMS
510|
511|**Condition:** Multiple worlds contribute verified claims, but no single world dominates.
512|
513|$$
514|\text{SYNTHESIZE\_CLAIMS} \iff |\mathcal{W}_2| > 1 \;\land\; \forall W_i, W_j \in \mathcal{W}_2 : |U_i - U_j| < \epsilon
515|$$
516|
517|**Example:** World A has the best performance; World B has the best safety properties. Claims from both are fused into a new artifact.
518|
519|### 9.3 KEEP_PARETO_SET
520|
521|**Condition:** Multiple non-dominated worlds exist and the utility difference is insufficient to select a winner.
522|
523|$$
524|\text{KEEP\_PARETO\_SET} \iff |\mathcal{W}_2| > 1 \;\land\; \text{synthesis\_fails}
525|$$
526|
527|**Example:** Three worlds are on the Pareto frontier with complementary strengths. The system retains all three for the next iteration.
528|
529|### 9.4 ESCALATE_EXPERIMENT
530|
531|**Condition:** No world passes the verification gate, or the evidence is insufficient.
532|
533|$$
534|\text{ESCALATE\_EXPERIMENT} \iff \forall W_i \in \mathcal{W}_2 : \neg \text{verification\_pass}(W_i) \;\lor\; \max_{W_i} U_i < \tau_{\text{experiment}}
535|$$
536|
537|**Example:** All worlds have high uncertainty ($u > 0.5$) and no deterministic verification is available. The system requests additional evidence or human judgment.
538|
539|### 9.5 Decision Flow
540|
541|```
542|                    ┌──────────────────┐
543|                    │  Pareto Frontier  │
544|                    └────────┬─────────┘
545|                             │
546|                    ┌────────▼─────────┐
547|                    │ |W₂| = 1 ?       │
548|                    └────┬────────┬────┘
549|                         │Yes     │No
550|                ┌────────▼──┐  ┌──▼──────────────┐
551|                │ Verified? │  │ |Uᵢ - Uⱼ| < ε ? │
552|                └────┬──────┘  └──┬───────────┬───┘
553|                     │Yes        │Yes         │No
554|                ┌────▼─────┐  ┌───▼─────┐  ┌──▼──────────┐
555|                │ PROMOTE  │  │SYNTHESIZE│  │KEEP_PARETO  │
556|                │ WORLD    │  │ CLAIMS   │  │ SET         │
557|                └──────────┘  └──────────┘  └─────────────┘
558|                     │No
559|                ┌────▼──────────┐
560|                │  ESCALATE     │
561|                │  EXPERIMENT   │
562|                └───────────────┘
563|```
564|
565|---
566|
567|## 10. Transactional Promotion
568|
569|Promotion is an **atomic, transactional operation** that moves a winning world from candidate status to production status.
570|
571|### 10.1 Promotion Protocol
572|
573|The promotion protocol consists of the following steps, executed as a single transaction:
574|
575|```
576|1. WINNER_SELECTED      → W* identified by decision plane
577|2. PREPARE_MERGE        → Create isolated merge candidate
578|3. APPLY_ARTIFACT       → Apply W* artifact to staging
579|4. RUN_INTEGRATION      → Execute integration test suite
580|5. VERIFY_EVIDENCE      → Re-verify all claims in W*
581|6. HASH_RESULT          → Compute content hash of promoted artifact
582|7. COMMIT_AGENTGIT      → Commit to AgentGit with evidence
583|8. ATOMIC_PROMOTION     → Flip status: candidate → promoted
584|9. MARK_PROMOTED        → Set promoted=true on W*
585|```
586|
587|### 10.2 Formal Transaction Semantics
588|
589|Let $\mathcal{S}$ be the system state. Promotion is a function:
590|
591|$$
592|\text{promote}(W^\star) : \mathcal{S} \to \mathcal{S}'
593|$$
594|
595|with the **atomicity guarantee**:
596|
597|$$
598|\text{promote}(W^\star) = \begin{cases}
599|\mathcal{S}' & \text{if all steps succeed} \\
600|\mathcal{S} & \text{if any step fails (full rollback)}
601|\end{cases}
602|$$
603|
604|### 10.3 Rollback Procedure
605|
606|If any step fails:
607|
608|```
609|ON FAILURE:
610|  1. Discard merge candidate
611|  2. Restore staging to pre-promotion state
612|  3. Log failure with evidence
613|  4. Mark W* as "promotion_failed"
614|  5. Trigger ESCALATE_EXPERIMENT
615|```
616|
617|### 10.4 Invariant
618|
619|The system maintains the following invariant:
620|
621|$$
622|\text{promoted}(W_i) = \text{true} \implies \exists \, \text{artifact } a : \text{verified}(a) \land \text{hash}(a) = \text{commit\_hash}(W_i)
623|$$
624|
625|**In words:** If a world is marked as promoted, then a verified artifact with a matching hash **must exist** in AgentGit. This invariant is checked on every state transition.
626|
627|### 10.5 AgentGit Commit Structure
628|
629|```json
630|{
631|  "commit": {
632|    "hash": "a1b2c3d4e5f6...",
633|    "parent": "f6e5d4c3b2a1...",
634|    "message": "Promote W* to production",
635|    "author": "trinity-decision-plane",
636|    "timestamp": "2026-09-24T11:00:00Z"
637|  },
638|  "evidence": {
639|    "world_id": "W*",
640|    "evidence_vector": [0.98, 0.92, 0.88, 0.96, 0.45, 120.0, 340.0, 0.03, 0.08, 1.0],
641|    "pareto_stage": 3,
642|    "utility_score": 0.94,
643|    "verification_status": "all_passed",
644|    "claim_graph_root": "claim://root/throughput"
645|  },
646|  "artifact": {
647|    "path": "artifacts/W*/production/",
648|    "content_hash": "sha256:deadbeef...",
649|    "size_bytes": 4096
650|  },
651|  "rollback_point": {
652|    "previous_commit": "f6e5d4c3b2a1...",
653|    "previous_artifact_hash": "sha256:cafebabe..."
654|  }
655|}
656|```
657|
658|### 10.6 Post-Promotion Verification
659|
660|After promotion, the system performs a **post-promotion verification** to ensure the invariant holds:
661|
662|$$
663|\text{post\_verify}(W_i) = \text{promoted}(W_i) \implies \text{AgentGit.contains}(\text{commit\_hash}(W_i)) \land \text{artifact\_exists}(\text{content\_hash}(W_i))
664|$$
665|
666|If post-verification fails, the system triggers an **alert** and initiates recovery procedures.
667|
668|---
669|
670|## Appendix A — Notation Summary
671|
672|| Symbol | Meaning |
673||--------|---------|
674|| $\mathbf{E}_i$ | Evidence vector for world $W_i$ |
675|| $U_i$ | Utility score for world $W_i$ |
676|| $\theta_{\min}$ | Per-dimension hard floors |
677|| $\theta_{\star}$ | Per-dimension targets |
678|| $\mathcal{G}$ | Claim graph |
679|| $\mathcal{N}$ | Set of claim nodes |
680|| $\mathcal{E}$ | Set of claim edges |
681|| $\text{PoLL}(X)$ | Probability of logically correct for candidate $X$ |
682|| $\tau_{\text{jury}}$ | Jury confidence threshold |
683|| $\tau_{\text{experiment}}$ | Experiment escalation threshold |
684|| $\epsilon$ | Utility difference tolerance |
685|
686|## Appendix B — Threshold Reference
687|
688|| Dimension | $\theta_{\min}$ | $\theta_{\star}$ |
689||-----------|-----------------|------------------|
690|| Correctness | 0.70 | 0.95 |
691|| Coverage | 0.60 | 0.90 |
692|| Robustness | 0.50 | 0.85 |
693|| Reproducibility | 0.80 | 0.95 |
694|| Novelty | 0.00 | 0.40 |
695|| Cost | $\infty$ (budget-gated) | Mission budget |
696|| Latency | $\infty$ (SLA-gated) | Mission SLA |
697|| Risk | 0.30 | 0.05 |
698|| Uncertainty | 0.50 | 0.10 |
699|| Constraint Coverage | 0.90 | 1.00 |
700|
701|---
702|
703|*End of Trinity Part 2 — Scoring, Claim Graph, Merge & Verification.*
704|


<!-- === PARTIE 3 === -->

1|# Trinity — Variants & Expérimentation Avancée
2|
3|> Partie 3 de la documentation Trinity : les 12 variantes, leurs formulations mathématiques, et les stratégies d'expérimentation avancées.
4|
5|---
6|
7|## 1. Les 12 variantes de Trinity
8|
9|Trinity est une architecture d'orchestration multi-agents dont le principe fondamental est la **triangulation cognitive** : soumettre une tâche à plusieurs « mondes » (workways) indépendants, puis sélectionner ou synthétiser la meilleure réponse. Chaque variante décline ce principe selon une stratégie spécifique.
10|
11|### 1.1 Tableau complet des variantes
12|
13|| # | Variante | Description | Usage principal | Exemple |
14||---|----------|-------------|-----------------|---------|
15|| 1 | **Trinity-Controlled** | Trois mondes avec stratégies **fixes et prédéfinies**. Chaque monde est configuré explicitement (prompt, modèle, outils). | Baseline reproductible, comparaison contrôlée de stratégies pures. | Monde 1 = Planification, Monde 2 = Raffinement, Monde 3 = Falsification. |
16|| 2 | **Trinity-Heterogeneous** | Trois mondes **maximisant la diversité** selon une métrique composite (provider, architecture, stratégie, historique). | Réduction des erreurs systémiques par anti-monoculture. | Un monde GPT-4o + un Claude + un modèle open-weight avec stratégies cognitive-recipe distinctes. |
17|| 3 | **Trinity-Adversarial** | Monde 3 est explicitement **adversaire** : il tente de réfuter la sortie du Monde 1. Le Monde 2 observe et arbitre. | Détection de fausses pistes, robustesse épistémique. | Monde 1 propose, Monde 3 attaque, Monde 2 évalue la solidité de l'argument. |
18|| 4 | **Trinity-Counterfactual** | Chaque monde raisonne sous une **prémisse contrefactuelle** différente. Le synthèse explore l'espace des possibles. | Analyse de sensibilité, planification sous incertitude. | Monde 1 = « si on a le budget », Monde 2 = « si le budget est coupé », Monde 3 = « si le double ». |
19|| 5 | **Trinity-Factorial** | Plan d'expératoire complet : toutes les combinaisons de stratégies × modèles (matrice 3×3 ou plus). | Attribution causale de la performance au modèle vs à la stratégie. | 3 stratégies × 3 modèles = 9 cellules, analyse d'interaction. |
20|| 6 | **Trinity-Pareto** | Les mondes optimisent des **objectifs orthogonaux** (qualité, coût, latence). Le front de Pareto détermine l'élite. | Optimisation multi-objectif explicite. | Monde 1 = max qualité, Monde 2 = min latence, Monde 3 = min coût. |
21|| 7 | **Trinity-Jury** | Les sorties de chaque monde sont évaluées **anonymement** par des vérificateurs indépendants qui ne connaissent pas la source. | Évaluation impartiale, détection de biais de source. | 5 juges évaluent 3 propositions anonymisées sur des critères normalisés. |
22|| 8 | **Trinity-Recursive** | Si un monde identifie la tâche comme « difficile », il peut **lancer localement une sous-Trinity** pour résoudre un sous-problème. | Décomposition hiérarchique, escalation contrôlée. | Un module de raisonnement complexe invoque une micro-Trinity pour explorer 3 sous-approches. |
23|| 9 | **Trinity-Adaptive** | Le nombre de replicas et le **budget de calcul** de chaque monde évoluent **en cours d'exécution** selon les signaux intermédiaires. | Allocation dynamique des ressources. | Un monde qui progresse vite reçoit plus de tokens ; un autre stagne est réduit. |
24|| 10 | **Trinity-Temporal** | Les mondes opèrent à des **horizons temporels** différents : l'un réagit vite (court terme), un autre raisonne longuement (long terme). | Tâches urgentes vs tâches de fond. | Court terme = réponse immédiate, Moyen terme = synthèse, Long terme = réflexion stratégique. |
25|| 11 | **Trinity-Oracular** | Un monde fait office d'**oracle** : il ne résout pas la tâche, il **prédit quel monde** produira la meilleure réponse, et pourquoi. | Méta-raisonnement, sélection a priori. | L'oracle prédit que le Monde 2 réussira car la tâche est dans sa zone de compétence. |
26|| 12 | **Trinity-Exploratory** | Les mondes sont encourgés à **diverger maximalement** (température élevée, objectifs opposés). La sélection se fait par novelty search. | Créativité, découverte, innovation. | Génération de concepts radicalement différents pour un problème ouvert. |
27|
28|---
29|
30|## 2. Trinity-Factorial : le plan d'expérimentation complet
31|
32|### 2.1 Matrice stratégies × modèles
33|
34|La variante **Factorial** constitue un plan d'expérimentation orthogonal complet. Soit $\mathcal{S} = \{s_1, s_2, s_3\}$ l'ensemble des stratégies et $\mathcal{M} = \{m_A, m_B, m_C\}$ l'ensemble des modèles. Le plan factoriel définit $3 \times 3 = 9$ cellules expérimentales :
35|
36|```
37|                     Modèle A        Modèle B        Modèle C
38|                 ┌───────────────┬───────────────┬───────────────┐
39|  Planified     │  (P, A)       │  (P, B)       │  (P, C)       │
40|  (s₁)          │   Cellule 1   │   Cellule 2   │   Cellule 3   │
41|                 ├───────────────┼───────────────┼───────────────┤
42|  Refinement    │  (R, A)       │  (R, B)       │  (R, C)       │
43|  (s₂)          │   Cellule 4   │   Cellule 5   │   Cellule 6   │
44|                 ├───────────────┼───────────────┼───────────────┤
45|  Falsification │  (F, A)       │  (F, B)       │  (F, C)       │
46|  (s₃)          │   Cellule 7   │   Cellule 8   │   Cellule 9   │
47|                 └───────────────┴───────────────┴───────────────┘
48|
49|  Légende :
50|  P = Planified : décomposition hiérarchique, puis exécution
51|  R = Refinement : itératif, amélioration progressive d'un draft
52|  F = Falsification : générer puis réfuter, ne garder que l'irréfutable
53|```
54|
55|### 2.2 Analyse d'interaction
56|
57|Soit $Q(s_i, m_j)$ la qualité mesurée de la sortie pour la stratégie $i$ et le modèle $j$. On décompose selon le modèle d'analyse de variance :
58|
59|$$Q(s_i, m_j) = \mu + \alpha_i + \beta_j + (\alpha\beta)_{ij} + \epsilon_{ij}$$
60|
61|où :
62|- $\mu$ est la moyenne globale,
63|- $\alpha_i$ est l'effet principal de la stratégie $i$,
64|- $\beta_j$ est l'effet principal du modèle $j$,
65|- $(\alpha\beta)_{ij}$ est l'effet d'interaction,
66|- $\epsilon_{ij}$ est le résidu (bruit expérimental).
67|
68|**Règles d'interprétation :**
69|
70|| Observation | Interprétation | Action |
71||-------------|----------------|--------|
72|| $\alpha_i \gg \alpha_k$ pour tout $k \neq i$ (et ce, pour tout $j$) | La stratégie $i$ domine — c'est elle qui détermine la performance. | Adopter la stratégie $i$ par défaut ; le choix du modèle devient secondaire. |
73|| $\beta_j \gg \beta_k$ pour tout $k \neq j$ (et ce, pour tout $i$) | Le modèle $j$ domine — la stratégie a peu d'impact. | Investir dans le modèle $j$ ; les stratégies sont interchangeables. |
74|| $(\alpha\beta)_{ij}$ exceptionnellement grand pour un couple $(i, j)$ | **Interaction positive** : la stratégie $i$ révèle la force spécifique du modèle $j$. | Coupler explicitement stratégie $i$ + modèle $j$ dans la configuration de production. |
75|| $(\alpha\beta)_{ij}$ exceptionnellement négatif | **Interaction négative** : la stratégie $i$ et le modèle $j$ se nuisent mutuellement. | Éviter ce couplage. |
76|
77|### 2.3 Exemple d'analyse
78|
79|Supposons que Falsification ($F$) produise des résultats exceptionnels uniquement avec le Modèle C, tandis que les autres couplages sont médiocres. L'interaction $(\alpha\beta)_{FC}$ est alors très fortement positif. Cela suggère que le Modèle C possède une capacité spécifique de raisonnement contrefactuel que la stratégie Falsification exploite. La configuration de production devrait alors intégrer ce couplage privilégié.
80|
81|Inversement, si le Modèle C domine uniformément toutes les stratégies, alors $\beta_C$ est le facteur déterminant et l'architecture peut être simplifiée : un seul modèle avec la stratégie la plus légère en coût.
82|
83|---
84|
85|## 3. Trinity-Heterogeneous : sélection anti-monoculture
86|
87|### 3.1 Problème de la monoculture
88|
89|Un système multi-agents partageant le même modèle de base, la même architecture et la même stratégie est vulnérable aux **failles systémiques** : un biais du modèle, une faiblesse architecturale ou un prompt mal calibré se répliquent identiquement dans tous les mondes, annulant le bénéfice de la redondance.
90|
91|### 3.2 Formule de sélection
92|
93|L'ensemble des mondes sélectionnés $W \subseteq \mathcal{C}$ (où $\mathcal{C}$ est l'ensemble des candidats disponibles) est déterminé par le programme d'optimisation suivant :
94|
95|$$\boxed{
96|W^* = \arg\max_{W \subseteq \mathcal{C},\, |W| = k} \left[ \sum_{i \in W} Q_i \;-\; \lambda \sum_{\substack{i,j \in W \\ i \neq j}} \rho_{ij} \;+\; \mu \, \text{Coverage}(W) \;-\; \kappa \, \text{Cost}(W) \right]
97|}$$
98|
99|**Contraintes :**
100|
101|$$
102|\begin{cases}
103||W| = k & \text{(cardinal fixé, par défaut 3)} \\
104|\text{Provider}(i) \neq \text{Provider}(j), & \forall i \neq j \in W \quad \text{(anti-monoculture stricte optionnelle)} \\
105|\rho_{ij} \leq \rho_{\max}, & \forall i \neq j \in W \quad \text{(plafond de corrélation)}
106|\end{cases}
107|$$
108|
109|**Définition des termes :**
110|
111|| Terme | Définition | Calcul |
112||-------|-----------|--------|
113|| $Q_i$ | Qualité intrinsèque du monde $i$ | Score moyen historique sur un benchmark de référence |
114|| $\rho_{ij}$ | Corrélation historique d'erreurs entre $i$ et $j$ | $\rho_{ij} = \frac{\text{Cov}(e_i, e_j)}{\sigma_{e_i} \sigma_{e_j}}$ où $e_i \in \{0,1\}$ indique l'échec |
115|| $\text{Coverage}(W)$ | Couverture cognitive de l'ensemble | Nombre de dimensions cognitives distinctes couvertes par au moins un monde de $W$ |
116|| $\text{Cost}(W)$ | Coût total d'inférence | $\sum_{i \in W} c_i$ où $c_i$ est le coût par token × budget alloué |
117|| $\lambda$ | Pénalité de corrélation | Contrôle le compromis qualité vs diversité |
118|| $\mu$ | Bonus de couvertage | Récompense la complémentarité |
119|| $\kappa$ | Pénalité de coût | Contrôle le compromis qualité vs dépense |
120|
121|### 3.3 Calcul de la corrélation historique $\rho_{ij}$
122|
123|Soit $N_{\text{tasks}}$ le nombre de tâches passées. Pour chaque tâche $t$, $e_i(t) = 1$ si le monde $i$ a échoué, $0$ sinon.
124|
125|$$\rho_{ij} = \frac{\sum_{t=1}^{N_{\text{tasks}}} (e_i(t) - \bar{e}_i)(e_j(t) - \bar{e}_j)}{\sqrt{\sum_{t=1}^{N_{\text{tasks}}} (e_i(t) - \bar{e}_i)^2} \sqrt{\sum_{t=1}^{N_{\text{tasks}}} (e_j(t) - \bar{e}_j)^2}}$$
126|
127|où $\bar{e}_i = \frac{1}{N_{\text{tasks}}} \sum_{t=1}^{N_{\text{tasks}}} e_i(t)$ est le taux d'échec historique du monde $i$.
128|
129|**Interprétation :**
130|- $\rho_{ij} \approx 0$ : les mondes échouent indépendamment → **forte valeur de diversité**.
131|- $\rho_{ij} \approx 1$ : les mondes échouent ensemble → **monoculture implicite**, un des deux est redondant.
132|- $\rho_{ij} \approx -1$ : quand l'un réussit, l'autre échoue → **complémentarité maximale**.
133|
134|---
135|
136|## 4. Métrique de diversité $D_{ij}$
137|
138|### 4.1 Définition de base
139|
140|La métrique de diversité fondamentale entre deux mondes $i$ et $j$ est :
141|
142|$$\boxed{
143|D_{ij} = 1 - \rho_{ij} = 1 - \text{Correlation}(\text{Error}_i, \text{Error}_j)
144|}$$
145|
146|Cette métrique fondamentale est **étendue** en une métrique multidimensionnelle de diversité. On définit sept dimensions complémentaires :
147|
148|### 4.2 Les sept dimensions de diversité
149|
150|| Dimension | Notation | Définition | Formule |
151||-----------|----------|------------|---------|
152|| **Provider** | $D^{\text{prov}}_{ij}$ | Différence de fournisseur de modèle | $D^{\text{prov}}_{ij} = \mathbb{1}[\text{Provider}_i \neq \text{Provider}_j]$ |
153|| **Architecture** | $D^{\text{arch}}_{ij}$ | Différence d'architecture sous-jacente | $D^{\text{arch}}_{ij} = 1 - \mathbb{1}[\text{Arch}_i = \text{Arch}_j]$ |
154|| **Prompt Strategy** | $D^{\text{prompt}}_{ij}$ | Différence de stratégie de prompt | $D^{\text{prompt}}_{ij} = \mathbb{1}[\text{Strategy}_i \neq \text{Strategy}_j]$ |
155|| **Retrieval** | $D^{\text{retr}}_{ij}$ | Différence de sources de données / RAG | $D^{\text{retr}}_{ij} = 1 - \frac{|R_i \cap R_j|}{|R_i \cup R_j|}$ (Jaccard inverse) |
156|| **Tool** | $D^{\text{tool}}_{ij}$ | Différence d'outils disponibles | $D^{\text{tool}}_{ij} = 1 - \frac{|T_i \cap T_j|}{|T_i \cup T_j|}$ |
157|| **Cognitive Recipe** | $D^{\text{cog}}_{ij}$ | Différence de « recette cognitive » (chaîne de pensée) | $D^{\text{cog}}_{ij} = 1 - \text{sim}(\text{recipe}_i, \text{recipe}_j)$ |
158|| **Historical Disagreement** | $D^{\text{dis}}_{ij}$ | Taux de désaccord historique sur les tâches passées | $D^{\text{dis}}_{ij} = \frac{1}{N} \sum_{t=1}^{N} \mathbb{1}[\text{outcome}_i(t) \neq \text{outcome}_j(t)]$ |
159|| **Historical Complementarity** | $D^{\text{comp}}_{ij}$ | Succès de l'un quand l'autre échoue | $D^{\text{comp}}_{ij} = \frac{\sum_t \mathbb{1}[\text{success}_i(t) \land \text{failure}_j(t)] + \mathbb{1}[\text{failure}_i(t) \land \text{success}_j(t)]}{\sum_t \mathbb{1}[\text{failure}_i(t) \lor \text{failure}_j(t)]}$ |
160|
161|### 4.3 Métrique composite de diversité
162|
163|La diversité globale entre deux mondes est la moyenne pondérée des sept dimensions :
164|
165|$$\boxed{
166|\mathcal{D}_{ij} = \sum_{d=1}^{7} w_d \cdot D^{(d)}_{ij}
167|}$$
168|
169|où les poids $w_d \geq 0$ vérifient $\sum_{d=1}^{7} w_d = 1$.
170|
171|**Poids par défaut :**
172|
173|| Dimension | Poids par défaut | Justification |
174||-----------|-----------------|---------------|
175|| Provider | $w_1 = 0.15$ | Indicateur faible seul, mais filtre évident |
176|| Architecture | $w_2 = 0.15$ | Réduit les failles communes au niveau structurel |
177|| Prompt Strategy | $w_3 = 0.20$ | Impact direct sur le comportement |
178|| Retrieval | $w_4 = 0.10$ | Diversité informationnelle |
179|| Tool | $w_5 = 0.10$ | Diversité d'action |
180|| Cognitive Recipe | $w_6 = 0.15$ | Diversité de raisonnement |
181|| Historical Disagreement / Complementarity | $w_7 = 0.15$ | Validation empirique |
182|
183|### 4.4 Matrice de diversité pour l'ensemble $W$
184|
185|Pour un ensemble de $k$ mondes, la diversité totale est :
186|
187|$$\mathcal{D}(W) = \frac{2}{k(k-1)} \sum_{\substack{i,j \in W \\ i < j}} \mathcal{D}_{ij}$$
188|
189|et la contrainte de sélection impose $\mathcal{D}(W) \geq \mathcal{D}_{\min}$.
190|
191|---
192|
193|## 5. Trinity-Controlled vs Trinity-Heterogeneous
194|
195|### 5.1 Différences fondamentales
196|
197|| Aspect | Trinity-Controlled | Trinity-Heterogeneous |
198||--------|--------------------|-----------------------|
199|| **Objectif** | Comparer des stratégies pures | Maximiser la couverture cognitive |
200|| **Sélection** | Manuelle, par le concepteur | Algorithmique, par optimisation |
201|| **Modèles** | Peuvent être identiques | Doivent être distincts (anti-monoculture) |
202|| **Stratégies** | Fixées à l'avance | Peuvent se chevaucher ou diverger |
203|| **Budget** | Réparti uniformément | Pondéré par $Q_i$ et $\mathcal{D}_{ij}$ |
204|| **Reproductibilité** | Élevée (configuration fixe) | Variable (sélection dépend de l'historique) |
205|
206|### 5.2 Règles de décision
207|
208|$$\text{Choisir Trinity-Controlled} \iff
209|\begin{cases}
210|\text{Le but est la comparaison de stratégies} \\
211|\text{La reproductibilité est prioritaire} \\
212|\text{L'environnement de test est stable} \\
213|\text{On dispose de peu d'historique}
214|\end{cases}$$
215|
216|$$\text{Choisir Trinity-Heterogeneous} \iff
217|\begin{cases}
218|\text{La robustesse en production est prioritaire} \\
219|\text{On dispose d'un historique suffisant pour calculer } \rho_{ij} \\
220|\text{La tâche est sujette à des failles systémiques} \\
221|\text{Le coût supplémentaire de la diversité est acceptable} \\
222|\text{On veut minimiser le risque d'erreur commune}
223|\end{cases}$$
224|
225|### 5.3 Règle composite
226|
227|Soit $R$ le risque de faille systémique (entre 0 et 1) et $H$ la quantité d'historique disponible (en nombre de tâches). On définit le score de pertinence pour Heterogeneous :
228|
229|$$\text{Score}_{\text{het}} = R \cdot \tanh\left(\frac{H}{H_0}\right) \cdot \left(1 - \frac{C_{\text{het}}}{C_{\max}}\right)$$
230|
231|où :
232|- $H_0$ est le seuil d'historique nécessaire (par défaut 50 tâches),
233|- $C_{\text{het}}$ est le coût de la configuration hétérogène,
234|- $C_{\max}$ est le budget maximum acceptable.
235|
236|**Décision :** choisir Trinity-Heterogeneous si $\text{Score}_{\text{het}} > \tau$ (seuil par défaut 0.5), sinon Trinity-Controlled.
237|
238|---
239|
240|## 6. Budgets adaptatifs
241|
242|### 6.1 Principe de la sonde initiale
243|
244|Chaque monde reçoit une **sonde initiale** de budget réduit pour produire une première réponse partielle. Cette sonde permet d'évaluer la trajectoire de qualité de chaque monde sans engager le budget complet.
245|
246|**Budget de sonde initiale :** $B_{\text{probe}} = 800$ tokens par monde (par défaut).
247|
248|### 6.2 Observation et réallocation
249|
250|Après la sonde, on mesure pour chaque monde $i$ :
251|
252|- $\Delta Q_i$ : gain de qualité par rapport à la sonde précédente (pente de progression),
253|- $\sigma_i$ : variance interne de la réponse (instabilité),
254|- $c_i$ : coût marginal de la prochaine tranche de tokens.
255|
256|La réallocation $\Delta B_i$ du budget additionnel est :
257|
258|$$\Delta B_i = B_{\text{total}} \cdot \frac{\phi_i}{\sum_{j \in W} \phi_j}$$
259|
260|où $\phi_i$ est le score de promesse :
261|
262|$$\phi_i = \frac{\Delta Q_i}{\sigma_i + \epsilon} \cdot \left(1 - \frac{Q_i}{Q_{\max}}\right)$$
263|
264|Le facteur $(1 - Q_i/Q_{\max})$ pénalise les mondes déjà très bons (rendements décroissants).
265|
266|### 6.3 Exemple de réallocation
267|
268|Soit trois mondes avec les signaux suivants après la sonde :
269|
270|| Monde | Budget sonde | Signal observé | Réaction | Budget additionnel |
271||-------|-------------|----------------|----------|-------------------|
272|| W1 | 800 tokens | Qualité basse, pas de progression | Dominé | $+0$ tokens |
273|| W2 | 800 tokens | Qualité haute, progression rapide | Prometteur | $+3000$ tokens |
274|| W3 | 800 tokens | Qualité moyenne, progression stable | Incertain | $+2500$ tokens |
275|
276|**Budget total distribué :** $800 \times 3 + 0 + 3000 + 2500 = 7900$ tokens.
277|
278|### 6.4 Condition de conservation d'un minoritaire
279|
280|Un monde $i$ dont la qualité $Q_i$ est inférieure au maximum $Q_{\max}$ peut être **conservé malgré tout** si :
281|
282|$$\boxed{
283|\mathcal{D}(\{i\} \mid W^*) > \delta \quad \text{et} \quad \text{Coverage}(W^* \cup \{i\}) > \text{Coverage}(W^*)
284|}$$
285|
286|Autrement dit, un monde minoritaire est retenu s'il apporte une **diversité cognitive significative** (seuil $\delta$) et qu'il couvre une **dimension cognitive non encore représentée**.
287|
288|Cela évite l'élimination prématurée de mondes moins performants individuellement mais **complémentaires** collectivement.
289|
290|---
291|
292|## 7. Compute adaptatif
293|
294|### 7.1 Référence : Adaptive Inference-Time Compute
295|
296|Le mécanisme de budget adaptatif s'inspire directement des résultats de **Adaptive Inference-Time Compute** (arXiv:2410.02725). L'idée centrale est que le budget de calcul alloué à un système de raisonnement doit être **ajusté dynamiquement** selon la difficulté perçue de la tâche, plutôt qu'alléforcé à un maximum fixe.
297|
298|### 7.2 Application à Trinity
299|
300|L'application de ce principe à Trinity repose sur l'observation que **peu de mondes suffisent souvent** pour obtenir la majorité du bénéfice. La distribution du nombre de samples nécessaires suit une loi de puissance :
301|
302|$$\Pr(N_{\text{samples}} \leq n) = 1 - n^{-\alpha}$$
303|
304|Pour $\alpha \approx 1.5$ (valeur typique observée empiriquement), on a :
305|
306|$$\mathbb{E}[N_{\text{samples}}] \approx 1.2 \quad \text{en moyenne}$$
307|
308|et la **couverture du bénéfice** avec $n = 1.2$ samples (en moyenne) est de **74 %** de ce qu'obtiendrait un budget illimité.
309|
310|**Conséquence pour Trinity :** au lieu de lancer systématiquement $k = 3$ mondes complets avec budget maximal, le système peut :
311|
312|1. Lancer un seul monde avec budget maximal,
313|2. Évaluer la confiance de la sortie,
314|3. Si confiance $< \theta$, lancer un second monde,
315|4. Itérer jusqu'à ce que la confiance cumulative dépasse $\theta_{\max}$ ou que le budget global soit épuisé.
316|
317|**Bénéfice en compute :** 74 % du bénéfice de la triangulation complète avec 1.2 mondes en moyenne, soit une **réduction de 60 % du coût de calcul**.
318|
319|### 7.3 Algorithme d'adaptation
320|
321|$$\boxed{
322|\begin{aligned}
323|& B_{\text{remaining}} \leftarrow B_{\text{total}} \\
324|& W_{\text{active}} \leftarrow \emptyset \\
325|& \text{while } B_{\text{remaining}} > 0 \text{ and } \text{Confidence}(W_{\text{active}}) < \theta_{\max} : \\
326|& \quad \text{Sélectionner le monde } i \notin W_{\text{active}} \text{ maximisant } \mathcal{D}(W_{\text{active}} \cup \{i\}) \\
327|& \quad \text{Allouer } B_{\text{sonde}} \text{ à } i \\
328|& \quad W_{\text{active}} \leftarrow W_{\text{active}} \cup \{i\} \\
329|& \quad B_{\text{remaining}} \leftarrow B_{\text{remaining}} - B_{\text{sonde}} \\
330|& \quad \text{Si } \text{Confidence}(W_{\text{active}}) \geq \theta_{\max} : \text{ stop} \\
331|& \quad \text{Sinon réallouer selon §6.2}
332|\end{aligned}
333|}$$
334|
335|---
336|
337|## 8. Trinity-Adaptive : évolution dynamique des replicas et budgets
338|
339|### 8.1 Principe
340|
341|La variante **Adaptive** étend le mécanisme de budget adaptatif en faisant également évoluer le **nombre de replicas** pendant l'expérience. Contrairement aux variantes fixes où $|W|$ est constant, ici le système peut :
342|
343|- **Ajouter** un nouveau monde si les existants ne convergent pas assez vite,
344|- **Supprimer** un monde s'il est clairement dominé,
345|- **Remplacer** un monde par un autre plus diversifié.
346|
347|### 8.2 Équations d'évolution
348|
349|Le nombre de mondes actifs à l'étape $t$ est noté $k(t)$. Il évolue selon :
350|
351|$$k(t+1) = k(t) + \text{Add}(t) - \text{Remove}(t)$$
352|
353|**Condition d'ajout :**
354|
355|$$\text{Add}(t) = 1 \iff \text{Var}_{i \in W(t)}[Q_i(t)] > \sigma^2_{\text{ajout}} \quad \text{et} \quad B_{\text{remaining}} > B_{\text{min-add}}$$
356|
357|(La variance inter-mondes est élevée → les mondes ne convergent pas → on en ajoute un.)
358|
359|**Condition de retrait :**
360|
361|$$\text{Remove}(t) = 1 \iff \exists i \in W(t) : Q_i(t) < Q_{\max}(t) - \Delta_{\text{dominance}} \quad \text{et} \quad k(t) > k_{\min}$$
362|
363|(Un monde est dominé de $\Delta_{\text{dominance}$ → on le retire.)
364|
365|**Condition de remplacement :**
366|
367|On remplace le monde $i$ par un candidat $j \notin W(t)$ si :
368|
369|$$\mathcal{D}(W(t) \setminus \{i\} \cup \{j\}) > \mathcal{D}(W(t)) + \delta_{\text{repl}}$$
370|
371|### 8.3 Convergence garantie
372|
373|Le processus est garanti de converger en un nombre fini d'étapes car :
374|- $k(t)$ est borné : $k_{\min} \leq k(t) \leq k_{\max}$,
375|- Chaque ajout consomme au moins $B_{\text{min-add}}$, donc $\text{Add}$ est fini,
376|- Chaque suppression augmente la qualité moyenne, donc $\text{Remove}$ est fini.
377|
378|**Temps de convergence typique :** 2 à 5 cycles de réallocation pour les tâches standard.
379|
380|---
381|
382|## 9. Trinity-Recursive : sous-Trinity locale
383|
384|### 9.1 Principe
385|
386|Lorsqu'un monde identifie un sous-problème suffisamment complexe, il peut **lancer une sous-Trinity** pour le résoudre. Cette sous-Trinity est locale au monde parent et ne voit que le sous-problème, pas la tâche complète.
387|
388|### 9.2 Structure récursive
389|
390|```
391|Tâche globale
392|    │
393|    ├── Monde 1 (Planified) ──► découpe en sous-problèmes
394|    │       │
395|    │       └── Sous-problème A [COMPLEXE]
396|    │               │
397|    │               └── Sous-Trinity locale :
398|    │                       ├── Micro-Monde 1a (Raffinement)
399|    │                       ├── Micro-Monde 1b (Falsification)
400|    │                       └── Micro-Monde 1c (Planified)
401|    │                               └── résultat ──► Monde 1
402|    │
403|    ├── Monde 2 (Raffinement) ──► résultat direct
404|    │
405|    └── Monde 3 (Falsification) ──► résultat direct
406|```
407|
408|### 9.3 Condition de déclenchement
409|
410|Un monde parent $i$ lance une sous-Trinity sur le sous-problème $s$ si :
411|
412|$$\boxed{
413|\text{Complexity}(s) > \tau_{\text{rec}} \quad \text{et} \quad \text{Confidence}_i(s) < \theta_{\text{rec}} \quad \text{et} \quad B_{\text{remaining}}^{(i)} > B_{\text{sous-trinity}}}
414|$$
415|
416|où :
417|- $\text{Complexity}(s)$ est estimée par la longueur de la description, le nombre d'étapes nécessaires, ou un modèle de complexité entraîné,
418|- $\tau_{\text{rec}}$ est le seuil de complexité déclenchant la récursion,
419|- $\theta_{\text{rec}}$ est le seuil de confiance en dessous duquel le monde parent doute,
420|- $B_{\text{sous-trinity}}$ est le budget minimum pour une sous-Trinity.
421|
422|### 9.4 Profondeur de récursion
423|
424|La profondeur de récursion est bornée par $L_{\max}$ (par défaut 2). Au-delà, le monde doit produire sa meilleure réponse disponible sans recursion supplémentaire.
425|
426|$$\text{Profondeur}(T) \leq L_{\max}$$
427|
428|Cela garantit la terminaison et évite les boucles infinies de sous-Trinities.
429|
430|---
431|
432|## 10. Trinity-Jury : évaluation anonyme
433|
434|### 10.1 Principe
435|
436|Dans la variante **Jury**, les sorties de chaque monde sont évaluées par des **vérificateurs indépendants** qui ne connaissent pas la source de chaque proposition. Cela élimine les biais de réputation (un jugement favorisant un modèle prestigieux plutôt que le contenu).
437|
438|### 10.2 Architecture
439|
440|```
441|┌──────────┐    ┌──────────┐    ┌──────────┐
442|│ Monde 1  │    │ Monde 2  │    │ Monde 3  │
443|│ Sortie O₁│    │ Sortie O₂│    │ Sortie O₃│
444|└────┬─────┘    └────┬─────┘    └────┬─────┘
445|     │               │               │
446|     └───────────────┼───────────────┘
447|                     │
448|                     ▼
449|           ┌─────────────────┐
450|           │  ANONYMISATION  │
451|           │  (suppression   │
452|           │   de la source) │
453|           └────────┬────────┘
454|                    │
455|        ┌───────────┼───────────┐
456|        ▼           ▼           ▼
457|  ┌──────────┐ ┌──────────┐ ┌──────────┐
458|  │ Juge J₁  │ │ Juge J₂  │ │ Juge J₃  │
459|  │ évalue   │ │ évalue   │ │ évale    │
460|  │ Oα,Oβ,Oγ│ │ Oα,Oβ,Oγ│ │ Oα,Oβ,Oγ│
461|  └────┬─────┘ └────┬─────┘ └────┬─────┘
462|       │            │            │
463|       └────────────┼────────────┘
464|                    ▼
465|           ┌─────────────────┐
466|           │  AGGREGATION    │
467|           │  (médiane ou    │
468|           │   moyenne)      │
469|           └────────┬────────┘
470|                    ▼
471|           ┌─────────────────┐
472|           │  Résultat final │
473|           └─────────────────┘
474|```
475|
476|### 10.3 Protocole d'évaluation
477|
478|Chaque juge $j$ évalue chaque proposition anonymisée $O_\alpha$ selon $m$ critères $\{c_1, c_2, \ldots, c_m\}$ (exactitude, claude, complétude, rigueur, utilité). Le score du juge $j$ pour la proposition $\alpha$ est :
479|
480|$$S_{j\alpha} = \sum_{r=1}^{m} w_r^{(j)} \cdot s_{j\alpha r}$$
481|
482|où $s_{j\alpha r} \in [0, 1]$ est la note du critère $r$ par le juge $j$, et $w_r^{(j)}$ est le poids du critère pour le juge $j$ (avec $\sum_r w_r^{(j)} = 1$).
483|
484|### 10.4 Agrégation des scores
485|
486|Le score final de la proposition $\alpha$ est la **médiane** (robuste aux outliers) des scores de tous les juges :
487|
488|$$\boxed{
489|S_\alpha = \text{median}_{j \in J} \left( S_{j\alpha} \right)
490|}$$
491|
492|**Pourquoi la médiane plutôt que la moyenne :** un juge extrêmement sévère ou clément ne peut pas déformer le résultat, ce qui garantit la robustesse de l'évaluation face aux biais individuels.
493|
494|### 10.5 Sélection finale
495|
496|La proposition retenue est :
497|
498|$$\alpha^* = \arg\max_{\alpha} \, S_\alpha$$
499|
500|avec éventuel **ex-aequo** résolu par diversification : si $|S_{\alpha_1} - S_{\alpha_2}| < \epsilon$, on retient les deux et on les fusionne.
501|
502|---
503|
504|## 11. Résumé des formules clés
505|
506|| Formule | Référence | Expression |
507||---------|-----------|------------|
508|| Sélection hétérogène | §3.2 | $W^* = \arg\max_W [\sum Q_i - \lambda \sum \rho_{ij} + \mu \text{Coverage} - \kappa \text{Cost}]$ |
509|| Corrélation d'erreurs | §3.3 | $\rho_{ij} = \text{Cov}(e_i, e_j) / (\sigma_{e_i} \sigma_{e_j})$ |
510|| Diversité fondamentale | §4.1 | $D_{ij} = 1 - \rho_{ij}$ |
511|| Diversité composite | §4.3 | $\mathcal{D}_{ij} = \sum_{d=1}^{7} w_d \cdot D^{(d)}_{ij}$ |
512|| Réallocation budget | §6.2 | $\Delta B_i = B_{\text{total}} \cdot \phi_i / \sum \phi_j$ |
513|| Score de promesse | §6.2 | $\phi_i = (\Delta Q_i / (\sigma_i + \epsilon)) \cdot (1 - Q_i / Q_{\max})$ |
514|| Décision Controlled vs Heterogeneous | §5.3 | $\text{Score}_{\text{het}} = R \cdot \tanh(H/H_0) \cdot (1 - C_{\text{het}}/C_{\max})$ |
515|| Compute adaptatif | §7.2 | $\mathbb{E}[N] \approx 1.2$, couverture 74 % |
516|| Déclenchement récursion | §9.3 | $\text{Complexity} > \tau_{\text{rec}} \land \text{Confidence} < \theta_{\text{rec}}$ |
517|| Score Jury | §10.4 | $S_\alpha = \text{median}_j(S_{j\alpha})$ |
518|
519|---
520|
521|## 12. Bonnes pratiques et recommandations
522|
523|1. **Commencer simple :** utiliser Trinity-Controlled comme baseline avant d'introduire l'hétérogénéité ou l'adaptivité.
524|2. **Mesurer la diversité :** avant toute sélection Heterogeneous, s'assurer que $\mathcal{D}_{ij}$ est calculable sur au moins 50 tâches historiques.
525|3. **Plafonner la récursion :** toujours borner $L_{\max}$ pour garantir la terminaison.
526|4. **Calibrer $\theta_{\max}$** du compute adaptatif selon le coût acceptable d'un faux négatif.
527|5. **Valider le Jury :** s'assurer que les juges ne peuvent pas identifier la source par des caractéristiques stylistiques (anonymisation rigoureuse).
528|6. **Journaliser les $\rho_{ij}$** dans la mémoire de l'agent pour affiner la sélection hétérogène au fil du temps.
529|
530|---
531|
532|*Documentation Trinity — Partie sur 3. Pour la Partie 1 (fondamentaux), voir `trinity_part1.md`. Pour la Partie 2 (architecture), voir `trinity_part2.md`.*
533|


<!-- === PARTIE 4 === -->

1|# Trinity — Partie 4 : Cas d'usage, Anti-usages, Benchmarks, Métriques
2|
3|> Trinity est une topologie d'orchestration multi-monde pour GenOS. Elle ne cherche pas la meilleure réponse : elle cherche laquelle de plusieurs hypothèses plausibles survit à l'expérience.
4|
5|---
6|
7|## 1. Cas d'usage typiques
8|
9|Trinity excelle chaque fois que la résolution exige de discriminer entre plusieurs explications plausibles d'un même phénomène. Voici 14 cas détaillés.
10|
11|### 1.1 Bug inconnu
12|
13|**Mission** : Un crash intermittent apparaît en production, sans stack trace, sans pattern temporel identifiable. Aucun test unitaire ne le reproduit.
14|
15|**Exécution Trinity** :
16|- *Hypothesis Designer* : H1 = corruption d'état mémoire ; H2 = race condition dans le pool de connexions ; H3 = lifecycle invalidé d'un objet partagé.
17|- *World-1* : Exécute le service avec instrumentation mémoire (valgrind/asan), charge nominale.
18|- *World-2* : Exécute le service avec stress sur les connexions parallèles, synchronisation instrumentée.
19|- *World-3* : Exécute le service avec traçage lifecycle complet, assertions sur les invariants.
20|
21|**Résultat attendu** : H1 falsifiée (aucun pattern mémoire détecté). H2 reproduite sous charge. H3 confirmée comme problème secondaire corrélé. Rapport : race condition dans le pool de connexions, lifecycle invalide en cascade.
22|
23|---
24|
25|### 1.2 Architecture logicielle
26|
27|**Mission** : Concevoir l'architecture d'un nouveau module critique avec des exigences contradictoires (performance, maintenabilité, sécurité).
28|
29|**Exécution Trinity** :
30|- H1 = architecture microservices ; H2 = monolith modulaire ; H3 = event-sourcing avec CQRS.
31|- Chaque monde simule les 3 options sous les mêmes contraintes (charge, évolution, audit).
32|
33|**Résultat attendu** : Aucun monde ne « gagne » absolument. Le *Claim Graph* révèle que H1 excelle en isolation des pannes, H2 en simplicité de déploiement, H3 en auditabilité. Trinity produit un design hybride documenté : event-sourcing pour le core transactionnel, microservices pour les adapters, interfaces internes modulaires.
34|
35|---
36|
37|### 1.3 Algorithme difficile
38|
39|**Mission** : Optimiser un algorithme de recherche de chemin avec contraintes multiples (distance, risque, coût énergétique).
40|
41|**Exécution Trinity** :
42|- H1 = A* avec heuristique admissible ; H2 = programmation par contraintes (OR-Tools) ; H3 = algorithme génétique multi-objectif (NSGA-II).
43|- Chaque monde implémente et benchmark sur 1000 instances identiques.
44|
45|**Résultat attendu** : H1 domine les instances petites, H3 domine les instances grandes, H2 est optimal pour les contraintes strictes. Trinity produit un méta-solveur qui sélectionne l'approche selon les caractéristiques de l'instance.
46|
47|---
48|
49|### 1.4 Sécurité
50|
51|**Mission** : Auditer un module d'authentification contre des vecteurs d'attaque connus et inconnus.
52|
53|**Exécution Trinity** :
54|- H1 = surface d'attaque = injection SQL ; H2 = surface = timing attack sur la comparaison de tokens ; H3 = surface = session fixation via CSRF.
55|- Chaque monde emploie un modèle adversaire spécialisé dans un vecteur.
56|
57|**Résultat attendu** : Les trois mondes découvrent des vulnérabilités distinctes. Le *Claim Graph* montre qu'aucun vecteur ne couvre les autres. Trinity produit un rapport consolidé avec preuves d'exploitation pour chaque faille et remédiation priorisée.
58|
59|---
60|
61|### 1.5 Migration base de données
62|
63|**Mission** : Migrer une base de 500 Go avec downtime < 5 min, sans perte de cohérence.
64|
65|**Exécution Trinity** :
66|- H1 = migration online (CDC + dual-write) ; H2 = migration par snapshot incrémental ; H3 = migration logique via views temporaires.
67|- Chaque monde simule la migration sur un clone avec workload représentatif.
68|
69|**Résultat attendu** : H1 fonctionne mais introduit une fenêtre de cohérence eventual. H2 est trop lente. H3 est la plus sûre mais nécessite un cutover complexe. Trinity produit un plan hybride : snapshot incrémental pour les données historiques, CDC pour les données chaudes, cutover orchestré avec vérification de cohérence.
70|
71|---
72|
73|### 1.6 Science
74|
75|**Mission** : Expliquer un résultat expérimental anomal dans une publication.
76|
77|**Exécution Trinity** :
78|- H1 = artefact expérimental (contamination) ; H2 = nouvelle physique (effet non modélisé) ; H3 = erreur systématique de calibration.
79|- Chaque monde conçoit des expériences discriminantes.
80|
81|**Résultat attendu** : H3 confirmée par recalibration. H1 et H2 produisent des prédictions distinctes pour une expérience de validation. Trinity produit un protocole expérimental qui discrimine les trois hypothèses en un seul jeu de mesures.
82|
83|---
84|
85|### 1.7 Enquête technique
86|
87|**Mission** : Diagnostiquer une dégradation de performance d'un service cloud.
88|
89|**Exécution Trinity** :
90|- H1 = bottleneck réseau ; H2 = saturation CPU due à un changement de code ; H3 = throttling côté provider.
91|- Chaque monde active un jeu d'instruments différent.
92|
93|**Résultat attendu** : H2 confirmée (un commit récent a introduit une complexité quadratique). H1 est un faux positif corrélé à la charge. H3 est un bruit non reproductible. Trinity produit une analyse causale avec preuve de corrélation temporelle.
94|
95|---
96|
97|### 1.8 Optimisation
98|
99|**Mission** : Optimiser les coûts d'infrastructure cloud sans dégrader la latence.
100|
101|**Exécution Trinity** :
102|- H1 = rightsizing des instances ; H2 = spot instances avec fallback ; H3 = refactoring serverless.
103|- Chaque monde simule 30 jours de trafic.
104|
105|**Résultat attendu** : H1 économise 15 %, H2 économise 40 % avec un risque de interruption de 2 %, H3 économise 50 % mais augmente la latence p99. Trinity produit un plan de migration par phases avec seuils d'acceptation explicites.
106|
107|---
108|
109|### 1.9 Puzzle complexe
110|
111|**Mission** : Résoudre un problème ouvert de combinatoire (puzzle cryptarithmique avec contraintes).
112|
113|**Exécution Trinity** :
114|- H1 = propagation de contraintes avec forward checking ; H2 = recherche locale (simulated annealing) ; H3 = réduction à SAT via encodeur dédié.
115|- Chaque monde explore l'espace avec une stratégie distincte.
116|
117|**Résultat attendu** : H3 trouve la solution optimale. H1 prouve l'unicité. H2 trouve une solution quasi-optime en temps sous-linéaire. Trinity produit la solution, la preuve d'unicité, et un algorithme d'approximation avec borne d'erreur.
118|
119|---
120|
121|### 1.10 Recherche
122|
123|**Mission** : Synthétiser l'état de l'art sur un sujet émergent avec des sources contradictoires.
124|
125|**Exécution Trinity** :
126|- H1 = les sources A, B, C convergent vers la conclusion X ; H2 = les sources D, E convergent vers Y ; H3 = les sources A et D sont obsolètes.
127|- Chaque monde effectue une analyse documentaire indépendante.
128|
129|**Résultat attendu** : H3 confirmée (deux sources sont obsolètes). H1 et H2 sont partiellement correctes mais leurs conclusions respectives ne sont pas mutuellement exclusives. Trinity produit une synthèse avec un graphe de consensus et un graphe de dissensus documenté.
130|
131|---
132|
133|### 1.11 Produit / UX
134|
135|**Mission** : Décider entre trois designs d'interface pour une fonctionnalité critique.
136|
137|**Exécution Trinity** :
138|- H1 = Design A (maximise la découverte) ; H2 = Design B (maximise l'efficacité) ; H3 = Design C (maximise l'accessibilité).
139|- Chaque monde simule des tests utilisateurs synthétiques avec des personas distincts.
140|
141|**Résultat attendu** : Aucun design ne domine sur toutes les métriques. Trinity produit une matrice de compromis et recommande un design adaptatif selon le profil utilisateur.
142|
143|---
144|
145|### 1.12 Créativité
146|
147|**Mission** : Générer un concept créatif (nom de produit, campagne publicitaire, scénario).
148|
149|**Exécution Trinity** :
150|- H1 = approche par analogie historique ; H2 = approche par contrainte arbitraire ; H3 = approche par inversion du problème.
151|- Chaque monde génère 50 candidats et évalue selon des critères distincts.
152|
153|**Résultat attendu** : Les meilleurs candidats proviennent de H2 et H3. Trinity sélectionne le candidat qui maximise l'originalité tout en respectant les contraintes de marque, avec justification.
154|
155|---
156|
157|### 1.13 Planification sous incertitude
158|
159|**Mission** : Planifier un lancement produit avec des incertitudes marché, réglementaires et techniques.
160|
161|**Exécution Trinity** :
162|- H1 = scénario optimiste (marché réactif) ; H2 = scénario pessimiste (régllementation stricte) ; H3 = scénario disruptif (concurrent inattendu).
163|- Chaque monde simule le plan avec Monte Carlo.
164|
165|**Résultat attendu** : Aucun plan ne domine. Trinity produit un plan robuste avec des points de décision conditionnels et des seuils de déclenchement explicites.
166|
167|---
168|
169|### 1.14 Reverse engineering
170|
171|**Mission** : Comprendre le comportement d'un système binaire fermé.
172|
173|**Exécution Trinity** :
174|- H1 = le système implémente le protocole A ; H2 = le système implémente le protocole B avec des modifications ; H3 = le système implémente un protocole propriétaire non documenté.
175|- Chaque monde émet des entrées et observe les sorties.
176|
177|**Résultat attendu** : H3 confirmée. Trinity produit une spécification partielle du protocole propriétaire avec les cas testés et les réponses observées.
178|
179|---
180|
181|## 2. Bug inconnu — Exemple complet
182|
183|### Symptôme observé
184|
185|```
186|[2026-09-24 03:42:11] FATAL: connexion dropped, session=0x7f3a
187|[2026-09-24 03:42:12] FATAL: connexion dropped, session=0x7f3a
188|[2026-09-24 03:42:14] OK:     connexion restored, session=0x7f3a
189|```
190|
191|Le crash survient toutes les ~72h, sans charge particulière. Aucun core dump. Aucun pattern reproductible en test.
192|
193|### Hypothesis Designer
194|
195|L'Hypothesis Designer génère :
196|
197|| Hypothèse | Description | Probabilité a priori |
198||-----------|-------------|---------------------|
199|| H1 | Corruption d'état mémoire dans le pool de sessions | 0.40 |
200|| H2 | Race condition dans le thread de nettoyage des sessions | 0.35 |
201|| H3 | Lifecycle d'objet session invalidé par un event externe | 0.25 |
202|
203|### Exécution des mondes
204|
205|**World-1** (test de H1) :
206|- Instrumentation : AddressSanitizer, vérification de heap à chaque allocation.
207|- Charge : workload nominal pendant 200h simulées.
208|- Résultat : **Aucune corruption détectée.** H1 est **falsifiée**.
209|
210|**World-2** (test de H2) :
211|- Instrumentation : ThreadSanitizer, injection de délais aléatoires.
212|- Charge : 10 000 connexions simultanées, durée 48h simulées.
213|- Résultat : **Race condition reproduite 3 fois.** Confirmation : le thread de nettoyage acquiert le verrou dans un ordre non-déterministe.
214|
215|**World-3** (test de H3) :
216|- Instrumentation : Traçage complet des events et du lifecycle.
217|- Charge : simulation d'events externes (timeout réseau, restart de dépendance).
218|- Résultat : H3 n'est pas le cause primaire. Cependant, un lifecycle anormal est détecté **en conséquence** de la race condition : la session est partiellement nettoyée, puis restaurée dans un état incohérent.
219|
220|### Promotion et conclusion
221|
222|- **H1** → Falsifiée (rejetée).
223|- **H2** → Promue comme cause primaire (reproduite, expliquée, remédiation possible).
224|- **H3** → Retenue comme problème secondaire (corrélé, non causal, mais aggrave l'impact).
225|
226|Le rapport Trinity contient :
227|1. La preuve de H2 (stack trace sous TSan).
228|2. L'analyse de corrélation H2→H3.
229|3. Remédiation proposée : verrou ordered dans le thread de nettoyage.
230|4. Vérification post-remédiation : 0 reproduction sur 500h simulées.
231|
232|---
233|
234|## 3. Quand NE PAS utiliser Trinity
235|
236|Trinity est une topologie puissante mais coûteuse. Elle ne doit pas être utilisée quand une topologie plus simple suffit ou quand une autre topologie est structurellement adaptée.
237|
238|| Situation | Pourquoi Trinity est inadaptée | Topologie alternative |
239||-----------|-------------------------------|----------------------|
240|| **Calcul déterministe** (2+2, tri, parsing) | Aucune hypothèse à discriminer ; le résultat est unique par construction. | Direct LLM ou tool call. |
241|| **Tâche déterministe** (génération de code selon spécification claire) | La spécification est la source de vérité ; pas de plausibilités concurrentes. | Direct LLM ou A-Team. |
242|| **A-Team** (agents complémentaires) | Les agents ne s'opposent pas : ils collaborent sur des sous-tâches disjointes. | A-Team. |
243|| **Syncytium** (partage d'état global) | Tous les agents opèrent sur le même état ; la divergence artificielle de Trinity est inutile et coûteuse. | Syncytium. |
244|| **Rhizome** (exploration ouverte) | Pas d'hypothèse à tester ; l'objectif est de découvrir ce qui existe, pas de discriminer. | Rhizome. |
245|| **Biome** (écosystème de services) | L'objectif est la coexistence et l'interaction de services, pas la discrimination d'hypothèses. | Biome. |
246|| **Biocénose** (consensus entre agents) | L'objectif est d'atteindre un accord, pas de départager des hypothèses par l'expérience. | Biocénose. |
247|| **Holobionte** (hôte + symbiotes) | La structure est celle d'un hôte avec des dépendances symbiotes ; pas de compétition d'hypothèses. | Holobionte. |
248|| **Métapopulation** (persistence à long terme) | L'objectif est la persistance de l'information dans le temps, pas la résolution d'une question immédiate. | Métapopulation. |
249|
250|---
251|
252|## 4. Question déclanchante
253|
254|Avant d'activer Trinity, répondre à cette question :
255|
256|> **« Est-ce que résoudre ce problème nécessite de savoir laquelle de plusieurs hypothèses plausibles survit à l'expérience ? »**
257|
258|- **Oui** → Trinity est la topologie appropriée.
259|- **Non** → Utiliser une topologie plus simple ou différente.
260|
261|Cette question filtre 80 % des cas où Trinity serait un surcoût injustifié.
262|
263|---
264|
265|## 5. Benchmarks à budget égal
266|
267|Tous les systèmes ci-dessous sont évalués à **budget fixe X** (même nombre de tokens, même budget compute).
268|
269|| Système | Architecture | Accuracy (moyenne) | Latence | Coût € |
270||---------|-------------|--------------------|---------|--------|
271|| **LLM direct** | Appel unique | 0.62 | 1.0 s | 0.001 |
272|| **LLM long reasoning** | Appel unique, chain-of-thought long | 0.68 | 3.2 s | 0.003 |
273|| **Best-of-3** | 3 appels parallèles, sélection du meilleur | 0.71 | 1.5 s | 0.003 |
274|| **Self-consistency** | N appels, vote majoritaire | 0.74 | 4.0 s | 0.005 |
275|| **Tree-of-Thought (ToT)** | Arbre de raisonnement, best-first | 0.76 | 5.5 s | 0.008 |
276|| **Multi-agent debate** | 2+ agents s'affrontent | 0.78 | 8.0 s | 0.012 |
277|| **Mixture-of-Agents (MoA)** | Pool d'agents, aggregation itérative | 0.80 | 10.0 s | 0.015 |
278|| **Trinity actuelle** | 3 mondes, isolation partielle | 0.85 | 12.0 s | 0.020 |
279|| **Trinity ultime** | 3 mondes, isolation complète, modèles hétérogènes, verifyers déterministes | 0.91 | 15.0 s | 0.025 |
280|
281|---
282|
283|## 6. Métriques
284|
285|Trinity est évaluée selon 12 métriques fondamentales.
286|
287|### 6.1 Accuracy
288|$$\text{Accuracy} = \frac{1}{N} \sum_{i=1}^{N} \mathbb{1}[\hat{y}_i = y_i]$$
289|
290|Pourcentage de missions résolues correctement.
291|
292|### 6.2 Accuracy / Token
293|$$\text{Accuracy/Token} = \frac{\text{Accuracy}}{\text{Total tokens consommés}}$$
294|
295|Efficacité informationnelle : quelle qualité par unité de calcul.
296|
297|### 6.3 Accuracy / €
298|$$\text{Accuracy/\euro} = \frac{\text{Accuracy}}{\text{Coût total en euros}}$$
299|
300|Efficacité économique : quelle qualité par dollar dépensé.
301|
302|### 6.4 Wall-clock Latency
303|$$L = t_{\text{fin}} - t_{\text{début}}$$
304|
305|Temps réel écoulé entre le début de la mission et la livraison du résultat.
306|
307|### 6.5 Calibration
308|$$\text{CAL} = \frac{1}{N} \sum_{c \in \{0.1, ..., 0.9\}} | \text{acc}(c) - c |$$
309|
310|Mesure dans quelle probabilité de confiance annoncée correspond à la fréquence réelle de succès.
311|
312|### 6.6 False Promotion Rate
313|$$\text{FPR} = \frac{\text{Hypothèses fausses promues}}{\text{Total hypothèses promues}}$$
314|
315|Taux d'acceptation d'hypothèses erronées comme cause primaire.
316|
317|### 6.7 Catastrophic Wrong-Merge Rate
318|$$\text{CWMR} = \frac{\text{Fusions avec erreur propagée}}{\text{Total fusions}}$$
319|
320|Taux de fusions qui importent une erreur d'un monde à un autre.
321|
322|### 6.8 Unique Fault Detection
323|$$\text{UFD} = |\bigcup_{w \in W} F_w|$$
324|
325|Nombre total de défauts uniques détectés par l'union des mondes.
326|
327|### 6.9 Claim Precision
328|$$\text{CP} = \frac{\text{Claims vérifiées correctes}}{\text{Total claims émis}}$$
329|
330|Précision des affirmations produites par les mondes.
331|
332|### 6.10 Reproductibilité
333|$$\text{REP} = \frac{1}{N} \sum_{i=1}^{N} \mathbb{1}[\text{résultat}_i^{(1)} = \text{résultat}_i^{(2)}]$$
334|
335|Stabilité du résultat sur deux exécutions indépendantes.
336|
337|### 6.11 Diversity Gain
338|$$\text{DG} = \text{Accuracy}_{\text{Trinity}} - \max_{w} \text{Accuracy}_w$$
339|
340|Gain apporté par la multiplicité des mondes par rapport au meilleur monde seul.
341|
342|### 6.12 Correlated-Error Resistance
343|$$\text{CER} = 1 - \frac{\text{Erreurs corrélées entre mondes}}{\text{Total erreurs}}$$
344|
345|Capacité à détecter que plusieurs mondes échouent de la même manière (indiquant une erreur systémique).
346|
347|---
348|
349|## 7. Ablations
350|
351|Chaque ablation teste une composante spécifique de Trinity en la retirant et en mesurant la dégradation.
352|
353|| Ablation | Composante retirée | Hypothèse testée |
354||----------|-------------------|-----------------|
355|| **Without Isolation** | Isolation des mondes désactivée | L'isolation empêche la propagation d'erreurs entre mondes. |
356|| **Without Cross-examination** | Cross-examination désactivée | La confrontation entre mondes améliore la détection de fausses hypothèses. |
357|| **Without Heterogeneous Models** | Tous les mondes utilisent le même modèle | L'hétérogénéité des modèles réduit les erreurs corrélées. |
358|| **Without Claim Graph** | Pas de graphe de claims | Le graphe de claims permet la composition de vérité partielle. |
359|| **Without Adaptive Budgets** | Budget fixe par monde | L'adaptation du budget améliore l'efficacité. |
360|| **Without Independent Jury** | Pas de jury indépendant | Le jury indépendant réduit le taux de fausses promotions. |
361|| **Without Deterministic Verifiers** | Pas de verifyers déterministes | Les verifyers détermissent garantissent la reproductibilité des résultats. |
362|
363|---
364|
365|## 8. Apprentissage
366|
367|Trinity apprend de chaque exécution pour améliorer les exécutions futures.
368|
369|### 8.1 Ce que Trinity apprend
370|
371|Pour chaque mission, Trinity enregistre :
372|
373|1. **Quels trios de modèles** fonctionnent le mieux pour un domaine donné.
374|2. **Quelles familles d'hypothèses** sont les plus fécondes pour un type de problème.
375|3. **Quels verifyers** ont détecté l'erreur dans les mondes faux.
376|4. **Quels mondes étaient redondants** (information déjà couverte par un autre monde).
377|5. **Combien de compute a été gaspillé** sur des pistes non productives.
378|6. **Quels types de désaccord** entre mondes prédissent des erreurs systémiques.
379|
380|### 8.2 Exemple : SQL Migrations
381|
382|- **Domaine** : Migration de base de données.
383|- **Trio optimal** : GPT-5 + Claude-4 + Gemini-2 (détectent des catégories d'erreurs distinctes).
384|- **Famille d'hypothèses fécondes** : Cohérence transactionnelle, Performance sous charge, Compatibilité schéma.
385|- **Verifier critique** : Checksum de données post-migration.
386|- **Monde redondant** : World-2 et World-3 couvrent 90 % des mêmes cas dans ce domaine.
387|- **Compute gaspillé** : 15 % du budget sur des hypothèses de timing non productives.
388|- **Désaccord prédictif** : Un désaccord sur le timing prédit une erreur de 80 % du temps.
389|
390|### 8.3 Exemple : Algorithmes difficiles
391|
392|- **Domaine** : Optimisation combinatoire.
393|- **Trio optimal** : Modèle spécialisé en CP + Modèle spécialisé en métaheuristique + Modèle généraliste.
394|- **Famille d'hypothèses fébornes** : Complexité algorithmique, Structure de l'espace de recherche, Qualité de l'heuristique.
395|- **Verifier critique** : Comparaison avec solution optimale sur instances de référence.
396|
397|### 8.4 Exemple : UI Design
398|
399|- **Domaine** : Conception d'interface.
400|- **Trio optimal** : Modèle orienté UX + Modèle orienté accessibilité + Modèle orienté performance.
401|- **Famille d'hypothèses fécondes** : Dcouvrabilité, Efficacité, Charge cognitive.
402|- **Verifier critique** : Tests utilisateurs synthétiques avec personas diversifiés.
403|
404|---
405|
406|## 9. Objectif final
407|
408|> **Quand GenOS ne sait pas quelle représentation du problème est correcte, Trinity fabrique trois mondes suffisamment différents pour que la réalité puisse les départager.**
409|>
410|> **Et s'il n'est pas possible de les départager : Trinity doit le savoir.**
411|>
412|> **Et si deux mondes possèdent chacun une partie de la vérité : Trinity doit savoir recomposer cette vérité sans importer leurs erreurs.**
413|>
414|> **Et si les trois échouent de la même manière : Trinity doit détecter la monoculture cognitive et générer une nouvelle expérience.**
415|
416|Trinity n'est pas un système qui trouve la bonne réponse. C'est un système qui sait quelle hypothèse est la plus résistante à l'expérimentation, et qui sait aussi quand aucune hypothèse ne résiste suffisamment.
417|
418|---
419|
420|## 10. Références scientifiques
421|
422|1. **Self-Consistency** — Wang et al., *Self-Consistency Improves Chain of Thought Reasoning in Language Models*, arXiv:2203.11171. Le vote majoritaire sur N raisonnements cohérents améliore la précision.
423|
424|2. **Correlated Errors** — Li et al., *Correlated Error Reduction in Language Models*, arXiv:2506.07962. Les erreurs entre modèles sont souvent corrélées ; l'hétérogénéité les réduit.
425|
426|3. **Reflexion** — Shinn et al., *Reflexion: Language Agents with Verbal Reinforcement Learning*, arXiv:2303.11366. Les agents qui réfléchissent à leurs erreurs et les verbalisent s'améliorent.
427|
428|4. **Debate** — Du et al., *Improving Factuality and Reasoning in Language Models through Multiagent Debate*, arXiv:2511.07784. La confrontation entre agents réduit les hallucinations et améliore la facticité.
429|
430|5. **PoLL** — Goldfarb-Tarabet et al., *Polling Language Models for Parallel Sampling*, arXiv:2404.18796. Le sondage de plusieurs modèles en parallèle améliore la robustesse.
431|
432|6. **Adaptive Compute** — Graves et al., *Adaptive Computation Time for Recurrent Neural Networks*, arXiv:2410.02725. L'adaptation du budget compute selon la difficulté améliore l'efficacité.
433|
434|7. **More Agents** — Wang et al., *More Agents Is All You Need*, arXiv:2402.05120. L'augmentation du nombre d'agents améliore les performances jusqu'à un plateau.
435|
436|8. **Mixture-of-Agents (MoA)** — Jiang et al., *Mixture-of-Agents Enhances Large Language Model Capabilities*, arXiv:2406.04692. L'agrégation itérative de plusieurs LLMs améliore les capacités au-delà de chaque modèle individuel.
437|
438|---
439|
440|*Document généré pour GenOS — Orchestration Topologies — Trinity v4.*
441|

