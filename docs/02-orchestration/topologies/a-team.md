# A-Team — Organisation Adaptative du Travail Spécialisé

> *A-Team est le protocole de GenOS pour les problèmes dont la solution exige plusieurs compétences complémentaires, interdépendantes et non substituables, qui doivent produire ensemble un artefact cohérent.*

---


<!-- === PARTIE 1 === -->

1|# A-Team — Partie 1 : Fondations, Définition, Distinction Trinity, Problèmes Conceptuels
2|
3|## 1. Définition
4|
5|**A-Team** est le protocole de GenOS pour les problèmes dont la solution exige plusieurs compétences complémentaires, interdépendantes et non substituables, qui doivent produire ensemble un artefact cohérent.
6|
7|Formellement, soit $\mathcal{M}$ une mission et $\mathcal{A}$ l'ensemble des agents disponibles. Une mission est classée **A-Team** si et seulement si :
8|
9|$$\exists \, S \subseteq \mathcal{A}, \; |S| \geq 2, \; \text{tel que} \; \forall i \in S: \; \nexists \, j \in \mathcal{A} \setminus \{i\} \; \text{avec} \; C_j \supseteq C_i$$
10|
11|où $C_i$ désigne le contrat de capacités de l'agent $i$. Autrement dit, aucun agent ne peut être remplacé par un autre sans perte de couverture fonctionnelle.
12|
13|La condition d'interdépendance s'exprime par la matrice de dépendance $\mathbf{D} \in \{0,1\}^{n \times n}$ :
14|
15|$$\forall (i,j) \in S \times S, \; i \neq j: \; D_{ij} = 1 \iff \text{la sortie de } i \text{ est une entrée requise de } j$$
16|
17|Un cas A-Team exige que le graphe de dépendance $\mathcal{G} = (S, E)$ où $E = \{(i,j) \mid D_{ij} = 1\}$ soit **connexe** et **acyclique** (DAG), garantissant un ordonnancement topologique valide.
18|
19|La production finale est un artefact composite $\mathcal{X}$ défini comme :
20|
21|$$\mathcal{X} = \bigoplus_{i \in S} x_i$$
22|
23|où $\bigoplus$ est l'opérateur d'intégration sémantique (et non la simple concaténation), et chaque $x_i$ est la contribution de l'agent $i$, validée par le contrat d'interface $\Phi_{i \to \mathcal{X}}$.
24|
25|---
26|
27|## 2. Distinction fondamentale : Trinity vs A-Team
28|
29|### 2.1 Nature des rôles
30|
31|| Dimension | Trinity | A-Team |
32||-----------|---------|--------|
33|| **Relation entre agents** | Hiérarchique (Stratège → Exécuteur → Gardien) | Horizontale (spécialistes pairs) |
34|| **Substituabilité** | Chaque rôle a un remplaçant potentiel | Aucun spécialiste n'est substituable |
35|| **Flux de contrôle** | Séquentiel avec boucles de rétroaction | DAG de dépendances |
36|| **Objectif de cohérence** | Alignement sur la mission | Cohérence de l'artefact composite |
37|| **Modèle de défaillance** | Un rôle peut échouer, les autres continuent | La défaillance d'un spécialiste bloque le DAG |
38|| **Type de cas** | Décision sous contrainte | Construction multi-compétences |
39|| **Métaphore biologique** | Système nerveux central | Organe multicellulaire |
40|
41|### 2.2 Diagramme de distinction
42|
43|```
44|TRINITY                          A-TEM
45|                                  
46|  ┌──────────┐                   ┌──────────┐
47|  │ Stratège │                   │ Frontend │
48|  └────┬─────┘                   └────┬─────┘
49|       │ dépendance                      │ dépendance
50|       ▼                               ▼
51|  ┌──────────┐    ┌──────────┐    ┌──────────┐
52|  │ Exécuteur│◄──►│ Backend  │◄──►│ Security │
53|  └────┬─────┘    └──────────┘    └──────────┘
54|       │                               │
55|       ▼                               ▼
56|  ┌──────────┐                   ┌──────────┐
57|  │ Gardien  │                   │   DevOps │
58|  └──────────┘                   └──────────┘
59|                                  
60|  Profondeur = 3                  Largeur = n
61|  Contrôle = vertical             Coordination = horizontale
62|```
63|
64|### 2.3 Critères de décision
65|
66|Le choix entre Trinity et A-Team suit les règles suivantes :
67|
68|- Si la mission nécessite **plus de 2 compétences orthogonales** et un artefact composite → A-Team
69|- Si la mission nécessite **décision → exécution → validation** → Trinity
70|- Si une seule compétence suffit → Solo
71|
72|**Formule de priorité** :
73|
74|$$\text{choix}(\mathcal{M}) = \begin{cases} \text{A-Team} & \text{si } |\mathcal{G}_{\text{ICG}}| \geq 3 \text{ et } \mathcal{G} \text{ est non trivial} \\ \text{Trinity} & \text{si } \mathcal{M} \text{ est une décision sous contrainte} \\ \text{Solo} & \text{si } \exists \, i \in \mathcal{A}: \; C_i \supseteq \text{requis}(\mathcal{M}) \end{cases}$$
75|
76|### 2.4 Exemples de missions par type
77|
78|| Mission | Type | Justification |
79||---------|------|---------------|
80|| Déployer une API REST sécurisée | A-Team | Backend + Frontend + Security + DevOps |
81|| Décider d'acquérir une startup | Trinity | Stratégie + Exécution due diligence + Validation légale |
82|| Corriger un typo | Solo | Une seule compétence requise |
83|| Construire un pipeline ML | A-Team | Data Engineering + ML + Infrastructure + Monitoring |
84|
85|### 2.5 Formule de classification
86|
87|Soit $\mathcal{P}$ une mission. La fonction de classification $\chi: \mathcal{P} \to \{\text{Trinity}, \text{A-Team}, \text{Solo}\}$ est définie par :
88|
89|$$\chi(\mathcal{P}) = \begin{cases} \text{A-Team} & \text{si } \exists \, \text{DAG de spécialistes } \mathcal{G} \text{ avec } |\mathcal{G}| \geq 2 \\ \text{Trinity} & \text{si } \mathcal{P} \text{ exige décision + exécution + validation} \\ \text{Solo} & \text{si } \exists \, \text{agent unique couvrant } \mathcal{P} \end{cases}$$
90|
91|La décision A-Team est prioritaire sur Trinity quand les deux conditions sont satisfaites, car la construction d'un artefact composite domine la séquence décision-exécution.
92|
93|---
94|
95|## 3. Ce que l'implémentation fait bien
96|
97|### 3.1 Mécanismes existants
98|
99|| Mécanisme | Description | Formule / Propriété |
100||-----------|-------------|---------------------|
101|| **Domaines** | Partition de l'espace des compétences | $\mathcal{D} = \{d_1, d_2, \ldots, d_n\}, \; d_i \cap d_j = \emptyset$ |
102|| **Rôles** | Attribution de responsabilités par domaine | $R: \mathcal{A} \to \mathcal{D}$ |
103|| **Workspaces** | Isolation des contextes d'exécution | $WS_i \cap WS_j = \emptyset$ sauf interfaces |
104|| **Dépendances** | Arêtes du DAG de spécialistes | $E = \{(i,j) \mid \text{sortie}(i) \in \text{entrée}(j)\}$ |
105|| **Ordonnancement** | Tri topologique du DAG | $\sigma: S \to \{1, \ldots, n\}, \; (i,j) \in E \Rightarrow \sigma(i) < \sigma(j)$ |
106|| **Capability Contract** | Spécification formelle des entrées/sorties | $\Phi_i = (\mathcal{I}_i, \mathcal{O}_i, \mathcal{P}_i)$ |
107|| **Tool Leases** | Verrous sur les outils partagés | $L: \mathcal{T} \to \mathcal{A} \cup \{\emptyset\}$ |
108|| **19 Organisations** | Configurations prédéfinies de topologies | $\mathcal{O} = \{O_1, \ldots, O_{19}\}$ |
109|| **Evidence Barrier** | Gate de promotion des résultats partiels | $\text{promouvoir}(x_i) \iff \text{vérifier}(\Phi_i, x_i)$ |
110|
111|### 3.2 Propriétés garanties
112|
113|L'implémentation assure les propriétés suivantes :
114|
115|**Théorème d'ordonnancement** : Pour tout DAG $\mathcal{G}$ de spécialistes, l'ordonnancement $\sigma$ produit un ordre d'exécution valide tel que :
116|
117|$$\forall (i,j) \in E: \; \text{terminer}(i) < \text{démarrer}(j)$$
118|
119|**Théorème d'isolation** : Les workspaces garantissent que :
120|
121|$$\forall i \neq j: \; \text{accès}(WS_i, \text{agent } j) = \emptyset \setminus \text{interfaces}(\Phi_i, \Phi_j)$$
122|
123|**Théorème de couverture** : L'union des domaines couvre l'espace de la mission :
124|
125|$$\bigcup_{i \in S} d_i \supseteq \text{domaine}(\mathcal{M})$$
126|
127|### 3.3 Architecture d'intégration
128|
129|```
130|┌─────────────────────────────────────────────────────────┐
131|│                    ORCHESTRATOR                          │
132|│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
133|│  │Scheduler│  │  Quality │  │ Evidence │  │  Tool   │ │
134|│  │         │  │   Gate   │  │  Barrier │  │  Leases │ │
135|│  └────┬────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
136|│       │            │             │              │       │
137|└───────┼────────────┼─────────────┼──────────────┼───────┘
138|        │            │             │              │
139|   ┌────┴────┐  ┌────┴────┐  ┌────┴────┐  ┌──────┴─────┐
140|   │Frontend │  │ Backend │  │Security │  │  DevOps    │
141|   │  Agent  │  │  Agent  │  │  Agent  │  │  Agent     │
142|   │  WS_1   │  │  WS_2   │  │  WS_3   │  │  WS_4      │
143|   └─────────┘  └─────────┘  └─────────┘  └────────────┘
144|```
145|
146|---
147|
148|## 4. La question conceptuelle fondamentale
149|
150|### 4.1 Pourquoi Pareto(frontend, backend, security) est une mauvaise abstraction
151|
152|L'approche Pareto traite les spécialistes comme des candidats concurrents sur un front d'optimalité multi-objectif. Cette abstraction est inadaptée car :
153|
154|**Non-substituabilité** : Les spécialistes A-Team ne sont pas des compromis entre objectifs. Le frontend n'est pas un « moins bon backend » — il est **orthogonal**. La distance de Pareto entre deux spécialistes est infinie dans leur dimension respective :
155|
156|$$\forall i \neq j: \; \text{score}(i, d_j) = 0$$
157|
158|où $\text{score}(i, d_j)$ mesure la compétence de l'agent $i$ dans le domaine $d_j$.
159|
160|**Absence de trade-off** : En Pareto, on accepte de dégrader un objectif pour améliorer un autre. En A-Team, dégrader la sécurité pour améliorer le frontend ne produit pas un artefact acceptable — il produit un artefact **invalide** :
161|
162|$$\text{accepter}(\mathcal{X}) \iff \forall i \in S: \; \text{qualité}(x_i) \geq \tau_i$$
163|
164|Il n'y a pas de compensation entre les dimensions.
165|
166|**Indépendance des contributions** : La valeur totale n'est pas additive mais multiplicative (ou logique ET) :
167|
168|$$V(\mathcal{X}) = \prod_{i \in S} v(x_i)$$
169|
170|où $v(x_i) \in \{0, 1\}$ selon que la contribution satisfait son contrat. Si une contribution échoue, l'artefact entier échoue.
171|
172|### 4.2 La bonne structure : Integration Contract Graph
173|
174|La structure correcte est un **Graphe de Contrats d'Intégration** (ICG) défini par :
175|
176|$$\mathcal{G}_{\text{ICG}} = (S, E, \mathcal{C})$$
177|
178|où :
179|- $S$ est l'ensemble des spécialistes
180|- $E \subseteq S \times S$ est l'ensemble des dépendances
181|- $\mathcal{C} = \{C_{i \to j} \mid (i,j) \in E\}$ est l'ensemble des contrats d'interface
182|
183|Chaque contrat $C_{i \to j}$ spécifie :
184|
185|$$C_{i \to j} = (\text{type}, \text{format}, \text{contraintes}, \text{préconditions}, \text{postconditions})$$
186|
187|La condition de validité globale est :
188|
189|$$\forall (i,j) \in E: \; \text{satisfait}(C_{i \to j}, x_i, x_j)$$
190|
191|### 4.3 Formule de cohérence
192|
193|La cohérence de l'artefact composite est mesurée par :
194|
195|$$\text{cohérence}(\mathcal{X}) = \min_{(i,j) \in E} \; \text{conformité}(x_i, C_{i \to j})$$
196|
197|L'artefact est cohérent si et seulement si :
198|
199|$$\text{cohérence}(\mathcal{X}) = 1$$
200|
201|C'est une condition de **minimum** (et non de moyenne), reflétant qu'un seul contrat violé invalide l'ensemble.
202|
203|### 4.4 Comparaison des abstractions
204|
205|| Propriété | Pareto | ICG |
206||-----------|--------|-----|
207|| Relation entre agents | Compétition | Coopération |
208|| Substituabilité | Oui (trade-off) | Non (orthogonalité) |
209|| Échec d'un agent | Dégradation graduelle | Échec total |
210|| Optimisation | Front de Pareto | Satisfaction de contrats |
211|| Métaphore | Marché | Assemblage |
212|
213|---
214|
215|## 5. Les 4 corrections structurelles requises
216|
217|### 5.1 Handoff incomplet
218|
219|**État actuel** : Le handoff entre spécialistes transfère uniquement la sortie brute $x_i$ sans métadonnées de contexte.
220|
221|**État requis** : Un handoff A-Team doit transférer un **paquet de transition** structuré :
222|
223|$$H_{i \to j} = (x_i, \text{claims}_i, \text{interface}_i, \text{assumptions}_i, \text{unresolved}_i, \text{evidence}_i)$$
224|
225|où :
226|- $x_i$ : la contribution (artefact)
227|- $\text{claims}_i$ : les affirmations de l'agent sur sa contribution
228|- $\text{interface}_i$ : le contrat d'interface formel
229|- $\text{assumptions}_i$ : les hypothèses sous-jacentes
230|- $\text{unresolved}_i$ : les questions non résolues
231|- $\text{evidence}_i$ : les preuves de vérification
232|
233|**Formule de complétude** :
234|
235|$$\text{complet}(H_{i \to j}) = \begin{cases} 1 & \text{si } \forall \, \text{champ} \in H_{i \to j}: \; \text{champ} \neq \emptyset \\ 0 & \text{sinon} \end{cases}$$
236|
237|Le handoff est valide si et seulement si $\text{complet}(H_{i \to j}) = 1$.
238|
239|### 5.2 Scheduler timeout incohérent
240|
241|**État actuel** : Quand un spécialiste dépasse son timeout, le scheduler lance quand même le consumer en aval.
242|
243|**État requis** : En A-Team rigoureuse, le timeout d'un spécialiste doit **bloquer** le DAG en aval, car la contribution est soit incomplète, soit non vérifiée.
244|
245|**Formule de propagation** :
246|
247|$$\text{état}(j) = \begin{cases} \text{bloqué} & \text{si } \exists \, i: \; (i,j) \in E \; \text{et} \; \text{état}(i) \in \{\text{timeout}, \text{échec}\} \\ \text{prêt} & \text{si } \forall \, i: \; (i,j) \in E \Rightarrow \text{état}(i) = \text{succès} \end{cases}$$
248|
249|**Formule de sécurité** :
250|
251|$$\text{sécurité}(\mathcal{G}) = \forall j \in S: \; \text{démarrer}(j) \Rightarrow \forall i: \; (i,j) \in E \Rightarrow \text{promu}(x_i)$$
252|
253|### 5.3 Quality Gate à fausse couverture
254|
255|**État actuel** : La Quality Gate agrège quatre métriques distinctes en un seul score, donnant une impression de couverture globale.
256|
257|**État requis** : Les quatre métriques doivent être séparées et évaluées indépendamment :
258|
259|| Métrique | Notation | Formule |
260||----------|----------|---------|
261|| **Mission Capability Coverage** | $MCC$ | $\frac{|\bigcup_{i \in S} C_i \cap \text{requis}(\mathcal{M})|}{|\text{requis}(\mathcal{M})|}$ |
262|| **Team Staffed Coverage** | $TSC$ | $\frac{|\{i \in S \mid \text{actif}(i)\}|}{|S|}$ |
263|| **Runtime Capability Availability** | $RCA$ | $\frac{|\{i \in S \mid \text{disponible}(i)\}|}{|S|}$ |
264|| **Verified Expertise Coverage** | $VEC$ | $\frac{|\{i \in S \mid \text{vérifié}(i)\}|}{|S|}$ |
265|
266|**Formule de couverture réelle** :
267|
268|$$\text{couverture}(\mathcal{M}, S) = MCC \times TSC \times RCA \times VEC$$
269|
270|Le produit (et non la moyenne) garantit qu'une dégradation sur une dimension n'est pas masquée par les autres.
271|
272|### 5.4 Détecteur de contamination naïf
273|
274|**État actuel** : Le détecteur vérifie uniquement l'isolation des domaines (DOMAIN ISOLATION).
275|
276|**État requis** : Le détecteur doit vérifier trois propriétés :
277|
278|**Propriété 1 — Ownership** : Chaque artefact a un propriétaire unique :
279|
280|$$\forall x \in \mathcal{X}: \; \exists! \, i \in S: \; \text{propriétaire}(x) = i$$
281|
282|**Propriété 2 — Consultation** : Un spécialiste ne peut modifier un artefact d'un autre qu'après consultation :
283|
284|$$\text{modifier}(i, x_j) \Rightarrow \text{consulté}(j, i, x_j)$$
285|
286|**Propriété 3 — Interface Authority** : Seules les interfaces contractuelles autorisent la modification :
287|
288|$$\text{modifier}(i, x_j) \Rightarrow (i,j) \in E \; \text{et} \; C_{j \to i} \neq \emptyset$$
289|
290|**Formule de contamination** :
291|
292|$$\text{contaminé}(\mathcal{X}) = \exists x \in \mathcal{X}: \; \neg \text{ownership}(x) \lor \neg \text{consultation}(x) \lor \neg \text{interface}(x)$$
293|
294|---
295|
296|## 6. Ce qu'A-Team doit réellement être
297|
298|### 6.1 Organisation adaptative du travail spécialisé
299|
300|A-Team est une **organisation adaptative** qui reconfigure sa structure en fonction de la mission. La configuration optimale n'est pas fixe — elle émerge de l'analyse des dépendances.
301|
302|**Formule d'adaptation** :
303|
304|$$\text{configuration}(\mathcal{M}) = \arg\min_{S \subseteq \mathcal{A}} \; |S| \; \text{sous contrainte} \; \bigcup_{i \in S} C_i \supseteq \text{requis}(\mathcal{M})$$
305|
306|C'est une question d'optimisation combinatoire résolu par l'orchestrateur lors de la phase de planification.
307|
308|### 6.2 Mémoire transactive
309|
310|A-Team implémente une **mémoire transactive** distribuée : chaque spécialiste sait ce que les autres savent (et ne savent pas).
311|
312|**Formule de mémoire transactive** :
313|
314|$$\text{MT}(i, j, d) = \begin{cases} 1 & \text{si l'agent } i \text{ sait que l'agent } j \text{ maîtrise le domaine } d \\ 0 & \text{sinon} \end{cases}$$
315|
316|La matrice de mémoire transactive $\mathbf{MT} \in \{0,1\}^{n \times n \times |\mathcal{D}|}$ est maintenue par l'orchestrateur et mise à jour après chaque handoff.
317|
318|**Propriété de complétude** :
319|
320|$$\forall i, j \in S, \; \forall d \in \mathcal{D}: \; \text{MT}(i, j, d) = \text{MT}(j, i, d)$$
321|
322|La mémoire transactive est symétrique : si $i$ sait que $j$ maîtrise $d$, alors $j$ sait que $i$ sait.
323|
324|### 6.3 Handoffs typés
325|
326|Les handoffs A-Team sont **typés** selon la nature de la transition :
327|
328|| Type | Notation | Description |
329||------|----------|-------------|
330|| **Delivery** | $H_D$ | Livraison d'artefact complet |
331|| **Delegation** | $H_{Del}$ | Délégation de sous-tâche |
332|| **Consultation** | $H_C$ | Demande d'expertise |
333|| **Validation** | $H_V$ | Vérification croisée |
334|| **Escalation** | $H_E$ | Remontée de blocage |
335|
336|**Formelle de typage** :
337|
338|$$\text{type}(H_{i \to j}) \in \{H_D, H_{Del}, H_C, H_V, H_E\}$$
339|
340|Chaque type a un contrat de validation distinct :
341|
342|$$\text{valider}(H_{i \to j}) = \begin{cases} \text{vérifier}(x_i, \Phi_i) & \text{si type} = H_D \\ \text{vérifier}(\text{sous-tâche}, \Phi_j) & \text{si type} = H_{Del} \\ \text{vérifier}(\text{réponse}, \text{question}) & \text{si type} = H_C \\ \text{vérifier}(x_i, x_j) & \text{si type} = H_V \\ \text{vérifier}(\text{blocage}, \text{contexte}) & \text{si type} = H_E \end{cases}$$
343|
344|### 6.4 Intégration continue
345|
346|A-Team pratique l'**intégration continue** des contributions : chaque artefact partiel est intégré dès qu'il est promu, et l'artefact composite est revalidé.
347|
348|**Formule d'intégration** :
349|
350|$$\mathcal{X}_t = \bigoplus_{i \in S_t} x_i$$
351|
352|où $S_t = \{i \in S \mid \text{promu}(x_i) \text{ au temps } t\}$ est l'ensemble des contributions disponibles au temps $t$.
353|
354|**Formule de revalidation** :
355|
356|$$\text{valide}(\mathcal{X}_t) = \forall (i,j) \in E: \; i \in S_t \land j \in S_t \Rightarrow \text{satisfait}(C_{i \to j}, x_i, x_j)$$
357|
358|L'intégration continue garantit que les incohérences sont détectées **immédiatement** plutôt qu'à la fin.
359|
360|---
361|
362|## 7. Références scientifiques
363|
364|### 7.1 APA Teamwork Podcast — Salas (7 Cs)
365|
366|Salas et al. identifient les 7 conditions du travail d'équipe efficace (the « 7 Cs ») :
367|
368|| C | Description | Application A-Team |
369||---|-------------|-------------------|
370|| **Coordination** | Synchronisation des activités | Ordonnancement du DAG |
371|| **Communication** | Échange d'information structuré | Handoffs typés |
372|| **Cooperation** | Alignement sur l'objectif commun | Capability Contracts |
373|| **Cognition** | Modèle mental partagé | Mémoire transactive |
374|| **Coaching** | Mentorat entre spécialistes | Consultation |
375|| **Conflict Resolution** | Gestion des désaccords | Evidence Barrier |
376|| **Composition** | Sélection des membres | Configuration adaptative |
377|
378|**Formule de performance d'équipe** (Salas) :
379|
380|$$P_{\text{équipe}} = f(C_1, C_2, \ldots, C_7) \times \text{contexte}$$
381|
382|### 7.2 Mémoire transactive (Wegner, 1985)
383|
384|La mémoire transactive est un système de connaissances partagées où chaque membe sait ce que les autres savent.
385|
386|**Formule de mémoire transactive** :
387|
388|$$\text{MT}_{\text{groupe}} = \sum_{i \neq j} \text{MT}(i, j)$$
389|
390|Un groupe avec une mémoire transactive élevée peut accéder à plus de connaissances que n'importe quel individu.
391|
392|### 7.3 DyLAN (Dynamic Language Agent Network)
393|
394|DyLAN construit dynamiquement un réseau d'agents basé sur les compétences requises.
395|
396|**Formule de sélection** :
397|
398|$$S^* = \arg\max_{S \subseteq \mathcal{A}} \; \text{performance}(\mathcal{M}, S) - \lambda |S|$$
399|
400|Le terme $\lambda |S|$ pénalise la taille de l'équipe pour éviter la sur-coordination.
401|
402|### 7.4 MetaGPT
403|
404|MetaGPT formalise les rôles spécialisés avec des contrats d'interface explicites.
405|
406|**Formule de rôle** :
407|
408|$$\text{Rôle}_i = (\text{responsabilités}, \text{contraintes}, \text{interfaces})$$
409|
410|### 7.5 Magentic-One
411|
412|Magnetic-One utilise un orchestrateur central qui planifie et supervise les spécialistes.
413|
414|**Formule d'orchestration** :
415|
416|$$\text{plan}(\mathcal{M}) = \text{décomposer}(\mathcal{M}) \rightarrow \text{assigner}(\mathcal{M}, \mathcal{A})$$
417|
418|### 7.6 MacNet
419|
420|MacNet implémente une mémoire transactive explicite entre agents.
421|
422|**Formule de connaissance distribuée** :
423|
424|$$K_{\text{groupe}} = \bigcup_{i \in S} K_i$$
425|
426|### 7.7 AgentPrune
427|
428|AgentPrune élague les agents redondants pour minimiser la taille de l'équipe.
429|
430|**Formule d'élagage** :
431|
432|$$S' = S \setminus \{i \in S \mid \exists \, j \in S: \; C_j \supseteq C_i\}$$
433|
434|### 7.8 Hidden Profiles (Meta-analyse)
435|
436|Les « hidden profiles » montrent que les groupes échouent quand l'information est distribuée et non partagée.
437|
438|**Formule de détection** :
439|
440|$$\text{hidden}(\mathcal{M}) = \exists \, \text{information } k: \; k \in K_i \; \text{et} \; k \notin \bigcup_{j \neq i} K_j$$
441|
442|A-Team doit garantir que toutes les informations critiques sont partagées via les handoffs.
443|
444|### 7.9 Debrief Meta-analyse
445|
446|Les débriefings post-mission améliorent la performance future.
447|
448|**Formule d'apprentissage** :
449|
450|$$\text{performance}_{t+1} = \text{performance}_t + \alpha \times \text{debrief}(\mathcal{M}_t)$$
451|
452|où $\alpha$ est le taux d'apprentissage organisationnel.
453|
454|---
455|
456|## 8. Synthèse des formules
457|
458|| # | Formule | Contexte |
459||---|---------|----------|
460|| 1 | $\nexists \, j: \; C_j \supseteq C_i$ | Non-substituabilité |
461|| 2 | $\mathcal{X} = \bigoplus_{i \in S} x_i$ | Artefact composite |
462|| 3 | $\chi(\mathcal{P})$ | Classification Trinity/A-Team/Solo |
463|| 4 | $\text{score}(i, d_j) = 0$ | Orthogonalité des spécialistes |
464|| 5 | $V(\mathcal{X}) = \prod_{i \in S} v(x_i)$ | Valeur multiplicative |
465|| 6 | $\text{cohérence}(\mathcal{X}) = \min_{(i,j) \in E} \; \text{conformité}(x_i, C_{i \to j})$ | Cohérence par minimum |
466|| 7 | $H_{i \to j} = (x_i, \text{claims}, \text{interface}, \text{assumptions}, \text{unresolved}, \text{evidence})$ | Handoff complet |
467|| 8 | $\text{complet}(H_{i \to j})$ | Complétude du handoff |
468|| 9 | $\text{état}(j) = \text{bloqué} \Leftarrow \text{état}(i) \in \{\text{timeout}, \text{échec}\}$ | Propagation de blocage |
469|| 10 | $\text{sécurité}(\mathcal{G})$ | Sécurité du DAG |
470|| 11 | $MCC = \frac{|\bigcup_{i \in S} C_i \cap \text{requis}(\mathcal{M})|}{|\text{requis}(\mathcal{M})|}$ | Mission Capability Coverage |
471|| 12 | $\text{couverture}(\mathcal{M}, S) = MCC \times TSC \times RCA \times VEC$ | Couverture réelle |
472|| 13 | $\exists! \, i: \; \text{propriétaire}(x) = i$ | Ownership unique |
473|| 14 | $\text{modifier}(i, x_j) \Rightarrow \text{consulté}(j, i, x_j)$ | Consultation obligatoire |
474|| 15 | $\text{contaminé}(\mathcal{X})$ | Détection de contamination |
475|| 16 | $\text{configuration}(\mathcal{M}) = \arg\min |S|$ | Configuration adaptative |
476|| 17 | $\text{MT}(i, j, d)$ | Mémoire transactive |
477|| 18 | $\text{type}(H_{i \to j}) \in \{H_D, H_{Del}, H_C, H_V, H_E\}$ | Typage des handoffs |
478|| 19 | $\mathcal{X}_t = \bigoplus_{i \in S_t} x_i$ | Intégration continue |
479|| 20 | $\text{valide}(\mathcal{X}_t)$ | Revalidation |
480|| 21 | $P_{\text{équipe}} = f(C_1, \ldots, C_7) \times \text{contexte}$ | Performance d'équipe (Salas) |
481|| 22 | $\text{MT}_{\text{groupe}} = \sum_{i \neq j} \text{MT}(i, j)$ | Mémoire transactive totale |
482|| 23 | $S^* = \arg\max \; \text{performance} - \lambda |S|$ | Sélection DyLAN |
483|| 24 | $S' = S \setminus \{i \mid \exists \, j: \; C_j \supseteq C_i\}$ | Élagage AgentPrune |
484|| 25 | $\text{hidden}(\mathcal{M})$ | Détection hidden profile |
485|| 26 | $\text{performance}_{t+1} = \text{performance}_t + \alpha \times \text{debrief}$ | Apprentissage organisationnel |
486|
487|---
488|
489|## 9. Conclusion de la Partie 1
490|
491|Cette partie a établi :
492|
493|1. **La définition formelle** d'A-Team comme protocole pour cas multi-compétences non substituables
494|2. **La distinction fondamentale** avec Trinity (hiérarchique vs horizontal)
495|3. **Les mécanismes existants** qui fonctionnent (domaines, contrats, ordonnancement, evidence barrier)
496|4. **La question conceptuelle fondamentale** : Pareto est inadapté, l'ICG est la bonne structure
497|5. **Les 4 corrections structurelles** : handoff complet, scheduler bloquant, quality gate séparée, détecteur de contamination enrichi
498|6. **La vision complète** : organisation adaptative, mémoire transactive, handoffs typés, intégration continue
499|7. **Les fondations scientifiques** : Salas, Wegner, DyLAN, MetaGPT, Magentic-One, MacNet, AgentPrune, hidden profiles, debrief
500|
501|La Partie 2 détaillera l'implémentation technique de ces corrections.
502|


<!-- === PARTIE 2 === -->

1|# A-Team — Partie 2 : Work Graph, Team Formation, Handoffs, Transactive Memory
2|
3|## 1. Le Work Graph G = (V, E)
4|
5|Le Work Graph est la structure fondamentale définissant l'architecture de travail d'une équipe A-Team. Chaque nœud représente une responsabilité spécialisée, chaque arête encode un contrat de dépendance entre responsabilités.
6|
7|### 1.1 Définition formelle
8|
9|Le Work Graph est un graphe orienté pondéré défini comme :$$G = (V, E, \omega, \gamma)$$
10|
11|L'ensemble des nœuds :$$V = \{V_1, V_2, \ldots, V_n\}, \quad V_i = \langle R_i, C_i, A_i \rangle$$
12|
13|Chaque nœud $V_i$ est un triplet composé de :
14|- $R_i$ : la responsabilité spécialisée (domaine de compétence)
15|- $C_i$ : la capacité de production (artefacts émis)
16|- $A_i$ : les artefacts consommés en entrée
17|
18|L'ensemble des arêtes :$$E = \{E_{ij} \mid V_i, V_j \in V, \, i \neq j\}$$
19|
20|Chaque arête $E_{ij}$ représente un contrat de dépendance du producteur $V_i$ vers le consommateur $V_j$ :$$E_{ij} = \langle \text{artifactType}, \text{interfaceSchema}, \text{precondition}, \text{postcondition}, \text{priority} \rangle$$
21|
22|La fonction de poids $\omega : E \to \mathbb{R}^+$ attribue un coefficient de couplage :$$\omega(E_{ij}) = \frac{|\text{artifacts}(V_i) \cap \text{inputs}(V_j)|}{|\text{inputs}(V_j)|}$$
23|
24|La fonction de criticité $\gamma : V \to \{ \text{critical}, \text{standard}, \text{optional} \}$ :$$\gamma(V_i) = \begin{cases} \text{critical} & \text{si } \text{outdegree}(V_i) \geq \theta_c \text{ ou } V_i \in \text{cutset}(G) \\ \text{standard} & \text{si } \theta_s \leq \text{outdegree}(V_i) < \theta_c \\ \text{optional} & \text{sinon} \end{cases}$$
25|
26|### 1.2 Exemple complet : application web full-stack
27|
28|```
29|┌─────────────────────────────────────────────────────────────────┐
30|│                        WORK GRAPH                                │
31|│                                                                  │
32|│  ┌──────────┐         ┌──────────────┐        ┌──────────────┐  │
33|│  │ Security │────────▶│   Backend    │◀───────│    Data      │  │
34|│  │  V_1     │  E_12   │    V_2       │  E_42  │    V_4       │  │
35|│  └──────────┘         └──────┬───────┘        └──────────────┘  │
36|│       │                      │                   │      │       │
37|│       │ E_13                 │ E_23              │ E_46 │       │
38|│       ▼                      ▼                   ▼      ▼       │
39|│  ┌──────────┐         ┌──────────────┐        ┌──────────────┐  │
40|│  │ Frontend │◀────────│     API      │        │   DevOps     │  │
41|│  │  V_3     │  E_53   │   Gateway V_5│◀───────│    V_6       │  │
42|│  └──────────┘         └──────┬───────┘  E_65  └──────────────┘  │
43|│                              │ E_25                             │
44|└─────────────────────────────────────────────────────────────────┘
45|```
46|
47|Les nœuds du graphe sont :$$V_1 = \langle \text{Security}, \, \{\text{auth-spec}, \text{threat-model}\}, \, \{\text{api-spec}\} \rangle$$$$V_2 = \langle \text{Backend}, \, \{\text{api-spec}, \text{business-logic}, \text{schema}\}, \, \{\text{auth-spec}, \text{data-model}\} \rangle$$$$V_3 = \langle \text{Frontend}, \, \{\text{ui-components}, \text{client-state}\}, \, \{\text{api-spec}, \text{auth-spec}\} \rangle$$$$V_4 = \langle \text{Data}, \, \{\text{data-model}, \text{migrations}, \text{queries}\}, \, \{\text{schema}\} \rangle$$$$V_5 = \langle \text{Gateway}, \, \{\text{routes}, \text{rate-limits}, \text{middleware}\}, \, \{\text{api-spec}\} \rangle$$$$V_6 = \langle \text{DevOps}, \, \{\text{pipeline}, \text{infra-config}, \text{deploy-spec}\}, \, \{\text{api-spec}, \text{data-model}\} \rangle$$
48|
49|Contrats d'arêtes explicites :$$E_{12} = \langle \text{auth-spec}, \, \text{OAuth2+JWT schema}, \, \text{security-review-done}, \, \text{backend-integrates-auth}, \, P_1 \rangle$$$$E_{13} = \langle \text{auth-spec}, \, \text{client-auth-flow}, \, \text{security-review-done}, \, \text{frontend-handles-tokens}, \, P_1 \rangle$$$$E_{23} = \langle \text{api-spec}, \, \text{OpenAPI 3.0}, \, \text{endpoints-defined}, \, \text{frontend-consumes-api}, \, P_0 \rangle$$$$E_{25} = \langle \text{api-spec}, \, \text{OpenAPI 3.0}, \, \text{endpoints-defined}, \, \text{gateway-routes-ready}, \, P_0 \rangle$$$$E_{42} = \langle \text{data-model}, \, \text{SQLAlchemy schema}, \, \text{migrations-tested}, \, \text{backend-persists-data}, \, P_1 \rangle$$$$E_{46} = \langle \text{data-model}, \, \text{schema+connection-pool}, \, \text{migrations-ready}, \, \text{infra-provisions-db}, \, P_2 \rangle$$$$E_{53} = \langle \text{routes}, \, \text{REST mapping}, \, \text{gateway-deployed}, \, \text{frontend-routes-resolve}, \, P_1 \rangle$$$$E_{65} = \langle \text{deploy-spec}, \, \text{K8s manifests}, \, \text{CI-tested}, \, \text{gateway-runs-in-prod}, \, P_2 \rangle$$
50|
51|---
52|
53|## 2. Ce que le Work Graph détermine
54|
55|### 2.1 Qui travaille et qui attend
56|
57|L'état d'activité de chaque agent est déterminé par la disponibilité de ses dépendances en entrée :$$\text{state}(V_i, t) = \begin{cases} \text{active} & \text{si } \forall E_{ji} \in \text{in-edges}(V_i) : \text{artifact}(E_{ji}).\text{status} = \text{ready} \\ \text{waiting} & \text{si } \exists E_{ji} : \text{artifact}(E_{ji}).\text{status} = \text{pending} \\ \text{blocked} & \text{si } \exists E_{ji} : \text{artifact}(E_{ji}).\text{status} = \text{failed} \\ \text{idle} & \text{si } \text{outdegree}(V_i) = 0 \text{ et tous les artefacts émis} \end{cases}$$
58|
59|Le runtime calcule l'ensemble des agents actifs à tout instant :$$A(t) = \{ V_i \in V \mid \text{state}(V_i, t) = \text{active} \}$$
60|
61|Le taux d'activité du système :$$\text{activityRatio}(t) = \frac{|A(t)|}{|V|}$$
62|
63|### 2.2 Qui produit quoi et qui consomme quoi
64|
65|La fonction de production $\pi : V \to \mathcal{P}(\text{Artifacts})$ définit chaque nœud comme producteur : $\pi(V_i) = C_i$.La fonction de consommation $\chi : V \to \mathcal{P}(\text{Artifacts})$ définit les besoins : $\chi(V_i) = A_i$.
66|
67|Cohérence du graphe garantie par la contrainte de couverture :$$\forall V_i \in V, \, \forall b \in \chi(V_i) : \exists V_j \in V, \, E_{ji} \in E : b \in \pi(V_j)$$
68|
69|Le degré de satisfaction d'un nœud :$$\text{satisfaction}(V_i) = \frac{|\{b \in A_i \mid b.\text{status} = \text{available}\}|}{|A_i|}$$
70|
71|### 2.3 Qui doit être consulté
72|
73|La matrice de consultation est dérivée par accessibilité transitive :$$M_{\text{consult}}[i][j] = \begin{cases} 1 & \text{si } \exists \text{ path } V_i \leadsto V_j \text{ in } G \\ 0 & \text{sinon} \end{cases}$$
74|
75|Routing des requêtes :$$\text{consult}(V_i, \text{topic}) = \{ V_j \in V \mid M_{\text{consult}}[i][j] = 1 \land \text{topic} \in R_j \}$$
76|
77|Le runtime sélectionne le meilleur candidat par :$$\text{bestConsultant}(V_i, \text{topic}) = \arg\max_{V_j \in \text{consult}(V_i, \text{topic})} \left( \text{sim}(R_j, \text{topic}) \cdot \frac{1}{\text{latency}(V_i, V_j)} \right)$$
78|
79|### 2.4 Qui peut bloquer (bottlenecks)
80|
81|Centralité d'intermédiarité :$$\text{betweenness}(V_i) = \sum_{s \neq V_i \neq t} \frac{\sigma_{st}(V_i)}{\sigma_{st}}$$
82|
83|où $\sigma_{st}$ est le nombre de plus courts chemins de $s$ à $t$, et $\sigma_{st}(V_i)$ le nombre de ces chemins passant par $V_i$.
84|
85|$$V_i \text{ est bottleneck} \iff \text{betweenness}(V_i) > \frac{2(n-1)(n-2)}{n^2}$$
86|
87|avec $n = |V|$. Le runtime alloue des ressources supplémentaires aux nœuds bottleneck et surveille leur temps de réponse.
88|
89|### 2.5 Quels artefacts doivent circuler
90|
91|Pour chaque arête $E_{ij}$, l'artefact transite du registre de $V_i$ vers la boîte de réception de $V_j$ :$$\text{flow}(E_{ij}) = \langle \text{registry}[V_i].\text{push}(\text{artifact}), \, \text{inbox}[V_j].\text{enqueue}(\text{artifact}) \rangle$$
92|
93|Le volume total d'artefacts circulant dans le système à l'instant $t$ :$$\Phi(t) = \sum_{E_{ij} \in E} |\text{artifact}(E_{ij})| \cdot \mathbb{1}[\text{state}(V_i, t) = \text{active}]$$
94|
95|La latence moyenne de livraison d'un artefact :$$\bar{\tau}_{\text{delivery}} = \frac{1}{|\Phi(t)|} \sum_{E_{ij}} \text{latency}(E_{ij}) \cdot \mathbb{1}[\text{state}(V_i, t) = \text{active}]$$
96|
97|---
98|
99|## 3. Team Formation
100|
101|### 3.1 Problème d'optimisation
102|
103|Étant donné un pool de candidats $\mathcal{C} = \{c_1, \ldots, c_m\}$ et le Work Graph $G$, le runtime sélectionne $T \subseteq \mathcal{C}$ maximisant :$$\text{TeamUtility}(T) = \text{Coverage}(T) + \alpha \cdot \text{ExpertiseFit}(T) + \beta \cdot \text{Complementarity}(T) + \gamma \cdot \text{HistoricalPerformance}(T) + \delta \cdot \text{InterfaceCompatibility}(T) - \lambda \cdot \text{CoordCost}(T) - \mu \cdot \text{Redundancy}(T) - \rho \cdot \text{Risk}(T)$$
104|
105|où les coefficients $\alpha, \beta, \gamma, \delta, \lambda, \mu, \rho \in \mathbb{R}^+$ sont calibrés par le profil de mission.
106|
107|### 3.2 Composantes de l'utilité
108|
109|**Couverture** : fraction des nœuds du Work Graph assignés à au moins un agent :$$\text{Coverage}(T) = \frac{|\bigcup_{a \in T} \text{dom}(a) \cap V|}{|V|}$$
110|
111|où $\text{dom}(a) \subseteq V$ est l'ensemble des nœuds que l'agent $a$ peut couvrir.
112|
113|**Expertise Fit** : adéquation entre les compétences requises et celles disponibles :$$\text{ExpertiseFit}(T) = \frac{1}{|V|} \sum_{V_i \in V} \max_{a \in T} \, \text{sim}(R_i, \, \text{genome}(a).\text{expertise})$$
114|
115|où $\text{sim}$ mesure la similarité sémantique entre le besoin $R_i$ et l'expertise de l'agent.
116|
117|**Complémentarité** : les agents couvrent des domaines distincts :$$\text{Complementarity}(T) = \frac{2}{|T|(|T|-1)} \sum_{\substack{a,b \in T \\ a \neq b}} \left(1 - \frac{|\text{dom}(a) \cap \text{dom}(b)|}{|\text{dom}(a) \cup \text{dom}(b)|}\right)$$
118|
119|**Performance historique** (décroissance exponentielle) :$$\text{HistoricalPerformance}(T) = \frac{1}{|T|} \sum_{a \in T} \sum_{h \in \text{history}(a)} w_h \cdot \text{score}(h), \quad w_h = e^{-\kappa \cdot \text{age}(h)}$$
120|
121|**Compatibilité d'interface** : capacité des agents à échanger des artefacts :$$\text{InterfaceCompatibility}(T) = \frac{2}{|T|(|T|-1)} \sum_{\substack{a,b \in T \\ a \neq b}} \text{compat}(a, b)$$
122|
123|où $\text{compat}(a, b) \in [0, 1]$ est calculé à partir des schémas d'interface et des formats supportés.
124|
125|**Coût de coordination** : surcharge liée à la taille et la complexité :$$\text{CoordCost}(T) = \frac{|T|(|T|-1)}{2} \cdot \text{commOverhead} \cdot \text{taskDensity}(G)$$
126|
127|**Redondance** : duplication inutile de couverture :$$\text{Redundancy}(T) = \sum_{V_i \in V} \max\left(0, \, |\{a \in T : V_i \in \text{dom}(a)\}| - 1\right)$$
128|
129|**Risque** : probabilité de défaillance de l'équipe :$$\text{Risk}(T) = 1 - \prod_{a \in T} (1 - \text{failureProbability}(a))$$
130|
131|### 3.3 Contraintes
132|
133|**Budget** : $\sum_{a \in T} \text{cost}(a) \leq B_{\max}$
134|
135|**Capacité** : $\forall a \in T : |\text{dom}(a)| \leq \text{capacity}(a)$
136|
137|**Outils** : $\forall V_i \in V : \exists a \in T : \text{tools}(V_i) \subseteq \text{tools}(a)$
138|
139|**Dépendances** : $\forall E_{ij} \in E : \exists a_p, a_c \in T : V_i \in \text{dom}(a_p) \land V_j \in \text{dom}(a_c) \land \text{compat}(a_p, a_c) > \tau$
140|
141|**Deadlines** : $\max_{\text{path } P \text{ in } G} \sum_{V_i \in P} \text{effort}(V_i, \text{assigned}(V_i)) \leq D_{\max}$
142|
143|### 3.4 Résolution
144|
145|Le runtime résout ce problème par pré-filtrage par contraintes dures, puis recherche heuristique (recuit simulé) et affinement par échanges locaux :$$\hat{T} = \arg\max_{T \subseteq \mathcal{C}} \text{TeamUtility}(T) \quad \text{s.c.} \, \text{constraints}(T) = \text{true}$$
146|
147|La température du recuit : $T_k = T_0 \cdot \alpha^k$, avec acceptance probability $p = e^{-\Delta E / T_k}$.
148|
149|---
150|
151|## 4. L'agent idéal : bien plus qu'un modèle + prompt
152|
153|Un agent dans l'A-Team n'est pas résumé à son modèle et son prompt système. GenOS maintient un profil multidimensionnel :$$\text{AgentProfile}(a) = \langle \text{genome}, \, \text{experience}, \, \text{recipe}, \, \text{history}, \, \text{reliability}, \, \text{cost}, \, \text{compat} \rangle$$
154|
155|### 4.1 Le génome
156|
157|$\text{genome}(a) = \langle \text{model}, \, \text{contextWindow}, \, \text{toolAccess}, \, \text{reasoningDepth}, \, \text{creativityIndex}, \, \text{precisionIndex} \rangle$
158|
159|### 4.2 L'expérience par domaine
160|
161|$\text{experience}(a) = \{ \langle d, s, n, t \rangle \}$, avec expérience effective :$$\text{experience}_a(d) = s_d \cdot \left(1 - e^{-\lambda_d \cdot n_d}\right) \cdot \min\left(1, \, \frac{t_d}{T_{\text{saturation}}}\right)$$
162|
163|### 4.3 La cognitive recipe
164|
165|$\text{recipe}(a) = \langle \text{decompositionStyle}, \, \text{searchStrategy}, \, \text{verificationLevel}, \, \text{abstractionLevel}, \, \text{communicationStyle} \rangle$
166|
167|Adéquation agent-tâche : $\text{fit}(a, V_i) = \text{match}(\text{recipe}(a), \, \text{requiredStyle}(V_i))$
168|
169|### 4.4 Historique et fiabilité
170|
171|$$\text{reliability}(a) = \frac{\sum_{m \in \text{missions}(a)} \text{success}(m) \cdot e^{-\eta \cdot \text{age}(m)}}{|\text{missions}(a)|}$$
172|
173|### 4.5 Coût et compatibilité
174|
175|$\text{cost}(a) = \text{computeCost}(a) \cdot \text{duration} + \text{coordinationCost}(a) \cdot |V_{\text{assigned}}|$
176|
177|$$\text{compat}(a, b) = \frac{|\text{outputSchemas}(a) \cap \text{inputSchemas}(b)| + |\text{outputSchemas}(b) \cap \text{inputSchemas}(a)|}{|\text{outputSchemas}(a) \cup \text{inputSchemas}(b)| + |\text{outputSchemas}(b) \cup \text{inputSchemas}(a)|}$$
178|
179|### 4.6 Sélection de l'agent backend_engineer idéal
180|
181|$$\text{score}(a, V_{\text{backend}}) = w_1 \cdot \text{experience}_a(\text{backend}) + w_2 \cdot \text{fit}(a, V_{\text{backend}}) + w_3 \cdot \text{reliability}(a) + w_4 \cdot \text{compat}(a, V_{\text{neighbors}}) - w_5 \cdot \text{cost}(a)$$
182|
183|L'agent sélectionné maximise ce score sous contraintes globales de l'équipe.
184|
185|---
186|
187|## 5. Le Transactive Memory System
188|
189|### 5.1 Structure par agent
190|
191|Le Transactive Memory System (TMS) est une mémoire distribuée où chaque agent connaît son propre domaine et *qui sait quoi*.
192|
193|$$\text{TMS}(a) = \langle \text{self}, \, \text{others}, \, \text{meta} \rangle$$
194|
195|**Self** — ce que l'agent sait et possède :$$\text{self}(a) = \{ \langle \text{domain}, \, \text{knowledge}, \, \text{ownership}, \, \text{confidence} \rangle \}$$
196|
197|**Others** — ce que l'agent sait des autres :$$\text{others}(a) = \{ \langle b, \, \text{domains}(b), \, \text{trust}(a,b), \, \text{latency}(a,b), \, \text{lastContact}(a,b) \rangle \mid b \in T \setminus \{a\} \}$$
198|
199|**Meta** — métadonnées de la mémoire transactive :$$\text{meta}(a) = \langle \text{lastUpdated}, \, \text{decayRate}, \, \text{verificationLog} \rangle$$
200|
201|### 5.2 Exemple Frontend / Backend / Security
202|
203|$$\text{self}(\text{frontend}) = \{ \langle \text{UI/UX}, \, \text{React/CSS expert}, \, \text{owns: components}, \, 0.95 \rangle, \, \langle \text{state mgmt}, \, \text{Redux expert}, \, \text{owns: stores}, \, 0.90 \rangle \}$$$$\text{self}(\text{backend}) = \{ \langle \text{API design}, \, \text{REST/GraphQL}, \, \text{owns: endpoints}, \, 0.92 \rangle, \, \langle \text{database}, \, \text{SQL/NoSQL}, \, \text{owns: schema}, \, 0.88 \rangle \}$$$$\text{self}(\text{security}) = \{ \langle \text{auth}, \, \text{OAuth/JWT}, \, \text{owns: auth-spec}, \, 0.96 \rangle, \, \langle \text{threat modeling}, \, \text{STRIDE/DREAD}, \, \text{owns: threat-model}, \, 0.93 \rangle \}$$
204|
205|Mémoire transactive croisée :$$\text{others}(\text{frontend}) = \{ \langle \text{backend}, \, \{\text{API design, database}\}, \, 0.85, \, 120\text{ms}, \, t-3\text{h} \rangle, \, \langle \text{security}, \, \{\text{auth, threat modeling}\}, \, 0.78, \, 150\text{ms}, \, t-1\text{j} \rangle \}$$$$\text{others}(\text{backend}) = \{ \langle \text{frontend}, \, \{\text{UI/UX, state mgmt}\}, \, 0.82, \, 120\text{ms}, \, t-2\text{h} \rangle, \, \langle \text{security}, \, \{\text{auth, threat modeling}\}, \, 0.90, \, 100\text{ms}, \, t-30\text{min} \rangle \}$$$$\text{others}(\text{security}) = \{ \langle \text{backend}, \, \{\text{API design, database}\}, \, 0.88, \, 100\text{ms}, \, t-30\text{min} \rangle, \, \langle \text{frontend}, \, \{\text{UI/UX, state mgmt}\}, \, 0.75, \, 150\text{ms}, \, t-1\text{j} \rangle \}$$
206|
207|### 5.3 Confiance décroissante
208|
209|La confiance qu'un agent $a$ accorde aux connaissances d'un agent $b$ décroît avec le temps :$$\text{trust}(a, b, t) = \text{trust}_0(a, b) \cdot e^{-\delta \cdot (t - t_{\text{lastContact}})}$$
210|
211|Si la confiance tombe sous un seuil $\tau_{\text{trust}}$, le runtime déclenche une re-vérification avant tout échange.
212|
213|### 5.4 Ignorance reconnue
214|
215|$$\text{unknowns}(a) = \{ \langle \text{domain}, \, \text{awareness}, \, \text{seekingStrategy} \rangle \}$$
216|
217|avec $\text{awareness} \in \{ \text{known-unknown}, \, \text{unknown-unknown}, \, \text{out-of-scope} \}$.
218|
219|Ceci permet au runtime de détecter les lacunes et de suggérer des consultations.
220|
221|---
222|
223|## 6. Knowledge Location Graph
224|
225|Le KLG répond : *J'ai besoin de X — sait X ?*
226|
227|$$\text{KLG} = \{ \langle \text{topic}, \, \text{agent}, \, \text{confidence}, \, \text{latency}, \, \text{load} \rangle \}$$
228|
229|### 6.1 Résolution de requête
230|
231|$$\text{resolve}(a, \text{need}) = \arg\max_{b \in \text{KLG}[topic]} \left( \text{confidence}(b, topic) \cdot \frac{1}{\text{latency}(a,b)} \cdot \frac{1}{\text{load}(b)} \right)$$
232|
233|### 6.2 Requête du contrat pertinent seul
234|
235|Le KLG permet de ne demander que le contrat pertinent :$$\text{request}(a, b, \text{need}) = \langle \text{need.contractId}, \, \text{need.interfaceSchema}, \, \text{need.preconditions}, \, \text{need.preferredFormat} \rangle$$
236|
237|Ceci minimise la communication : $\text{requestSize} \ll |\text{allKnowledge}(b)|$.
238|
239|### 6.3 Exemple
240|
241|Agent Frontend need("authentication flow for mobile").
242|KLG → Security (confidence 0.96, load 0.3) sélectionné plutôt que Backend (0.88, 0.7).
243|Seul le contrat mobile-auth est demandé, non l'ensemble du threat-model.
244|
245|---
246|
247|## 7. Le Handoff ultime : HandoffContract typé
248|
249|Le Handoff est l'unité fondamentale de transfert de travail entre agents :$$\text{HandoffContract} = \langle$$
250|$$\text{producer}, \, \text{consumer}, \, \text{artifactRefs},$$
251|$$\text{claims}, \, \text{assumptions}, \, \text{interfaceSchema},$$
252|$$\text{preconditions}, \, \text{postconditions}, \, \text{invariants},$$
253|$$\text{evidenceRefs}, \, \text{openQuestions}, \, \text{knownRisks},$$
254|$$\text{acceptanceCriteria}, \, \text{version}, \, \text{status}$$
255|$$\rangle$$
256|
257|### 7.1 Champs détaillés
258|
259|**artifactRefs** : $\{ \langle \text{id}, \, \text{uri}, \, \text{hash}, \, \text{version}, \, \text{format} \rangle \}$
260|
261|**claims** : assertions vérifiées par le producteur :$$\text{claims} = \{ \langle \text{assertion}, \, \text{confidence}, \, \text{verifiedBy} \rangle \}$$
262|
263|**assumptions** : hypothèses sous-jacentes :$$\text{assumptions} = \{ \langle \text{hypothesis}, \, \text{validityCondition}, \, \text{bound} \rangle \rangle \}$$
264|
265|**preconditions** : $\{ \langle \text{condition}, \, \text{evaluator}, \, \text{timeout} \rangle \}$
266|
267|**postconditions** : $\{ \langle \text{guarantee}, \, \text{proofRef} \rangle \}$
268|
269|**invariants** : $\{ \langle \text{invariant}, \, \text{monitoringStrategy} \rangle \}$
270|
271|**evidenceRefs** : $\{ \langle \text{type}, \, \text{uri}, \, \text{signature} \rangle \rangle \}$
272|
273|**openQuestions** : $\{ \langle \text{question}, \, \text{urgency}, \, \text{suggestedApproach} \rangle \rangle \}$
274|
275|**knownRisks** : $\{ \langle \text{risk}, \, \text{probability}, \, \text{impact}, \, \text{mitigation} \rangle \rangle \}$
276|
277|**acceptanceCriteria** : $\{ \langle \text{criterion}, \, \text{validator}, \, \text{threshold} \rangle \}$
278|
279|### 7.2 Exemple Backend → Frontend
280|
281|```yaml
282|producer: backend_agent_v2.3
283|consumer: agent_frontend_v1.7
284|artifactRefs:
285|  - id: api-spec-v3
286|    uri: genos://registry/backend/api-spec-v3.yaml
287|    hash: sha256:a3f2...
288|    version: 3.1.0
289|    format: openapi-3.0-yaml
290|claims:
291|  - assertion: "p95 latency <200ms under load"
292|    confidence: 0.94
293|    verifiedBy: load-test-suite-v2
294|assumptions:
295|  - hypothesis: "Frontend uses React 18+ with Suspense"
296|    validityCondition: "package.json react>=18"
297|    bound: "frontend-lockfile"
298|interfaceSchema:
299|  format: openapi-3.0
300|  schema: genos://schemas/api-spec-v3.json
301|  version: 3.1.0
302|  compatibility: backward-compatible-from-3.0
303|preconditions:
304|  - { condition: "Frontend has auth token evaluator", validator: "auth-check", timeout: 30s }
305|  - { condition: "Storybook environment configured", validator: "sb-config", timeout: 10s }
306|postconditions:
307|  - { guarantee: "All GET endpoints callable from frontend", proofRef: "integration-smoke-v3" }
308|  - { guarantee: "Error responses follow RFC 7807", proofRef: "error-format-test" }
309|invariants:
310|  - { invariant: "API contract hash unchanged during handoff", monitoringStrategy: "hash-watch" }
311|  - { invariant: "No breaking changes from v3.0.x", monitoringSchema: "semver-check" }
312|evidenceRefs:
313|  - { type: test-results, uri: genos://evidence/backend/load-test-2024-09.json, signature: ed25519:9f2a... }
314|  - { type: coverage-report, uri: genos://evidence/backend/coverage-v3.1.xml, signature: ed25519:8e3b... }
315|openQuestions:
316|  - { question: "WebSocket support needed for realtime?", urgency: medium, suggestedApproach: "polling-fallback-available" }
317|  - { question: "Offline mode required for mobile?", urgency: low, suggestedApproach: "PWA-strategy" }
318|knownRisks:
319|  - { risk: "Rate limit may throttle rapid frontend polling", probability: 0.2, impact: low, mitigation: "client-debounce-300ms" }
320|  - { risk: "Large response payload on /export", probability: 0.15, impact: medium, mitigation: "streaming-endpoint-available" }
321|acceptanceCriteria:
322|  - { criterion: "Schema validates without errors", validator: "openapi-validator", threshold: 0 errors }
323|  - { criterion: "Storybook renders all views", validator: "storybook-snapshot", threshold: 100% match }
324|  - { criterion: "Integration tests pass (>95%)", validator: "jest-integration", threshold: 95% }
325|version: 3.1.0
326|status: pending_acceptance
327|```
328|
329|---
330|
331|## 8. Réponses du récepteur
332|
333|Le consommateur d'un HandoffContract répond parmi cinq décisions :$$\text{Response} \in \{ \text{ACCEPT}, \, \text{PARTIAL\_ACCEPT}, \, \text{REJECT}, \, \text{REQUEST\_REPAIR}, \, \text{REQUEST\_CLARIFICATION} \}$$
334|
335|### 8.1 ACCEPT
336|
337|Tous les critères d'acceptation sont validés :$$\text{ACCEPT} \iff \forall c \in \text{acceptanceCriteria} : \text{validator}(c) \geq \text{threshold}(c)$$
338|
339|Le handoff est consommé, le travail downstream peut commencer. Le producteur est notifié : $\text{notify}(\text{producer}, \text{ACCEPT})$.
340|
341|### 8.2 PARTIAL_ACCEPT
342|
343|Critères principaux validés, écarts mineurs avec workaround fourni :$$\text{PARTIAL\_ACCEPT} \iff \exists c \in \text{acceptanceCriteria} : \text{validator}(c) < \text{threshold}(c) \land \text{severity}(c) = \text{minor}$$
344|
345|Le consommateur fournit un rapport d'écart structuré. Le producteur décide d'accepter le workaround ou d'initier un repair.
346|
347|### 8.3 REJECT
348|
349|Critères critiques invalidés :$$\text{REJECT} \iff \exists c \in \text{acceptanceCriteria} : \text{validator}(c) < \text{threshold}(c) \land \text{severity}(c) = \text{critical}$$
350|
351|Le handoff est refusé avec un rapport de rejet contenant raison et suggestedFix. Le producteur doit reconstruire le handoff.
352|
353|### 8.4 REQUEST_REPAIR
354|
355|Défect corrigeable détecté. RepairRequest spécifiant defect, location, expectedFix, deadline. Le consommateur reste en waiting pendant la réparation.
356|
357|### 8.5 REQUEST_CLARIFICATION
358|
359|Information manquante ou ambiguë. ClarificationRequest avec blocking=true si le consommateur reste en waiting tant que la clarification n'est pas reçue.
360|
361|### 8.6 Cycle de vie
362|
363|$$\text{pending} \xrightarrow{\text{submitted}} \text{under\_review} \xrightarrow{\text{decision}} \begin{cases} \text{accepted} & \text{si ACCEPT} \\ \text{partial} & \text{si PARTIAL\_ACCEPT} \\ \text{rejected} & \text{si REJECT} \\ \text{repairing} & \text{si REQUEST\_REPAIR} \\ \text{clarifying} & \text{si REQUEST\_CLARIFICATION} \end{cases}$$
364|
365|La durée moyenne de résolution :$$\bar{t}_{\text{resolve}} = \frac{1}{|\text{handovers}|} \sum_{h} (t_{\text{resolved}}(h) - t_{\text{submitted}}(h))$$
366|
367|---
368|
369|## 9. Ligand/receptor biomimétique : physiologie runtime
370|
371|Inspiré de la biologie moléculaire, le système d'interaction agentique suit un modèle ligand/récepteur où les offres de service et les contrats d'acceptation s'accouplent par complémentarité vérifiée.
372|
373|### 9.1 Le ligand : offre de service
374|
375|$$\text{Ligand} = \langle \text{offerId}, \, \text{agentId}, \, \text{serviceType}, \, \text{capabilities}, \, \text{availability}, \, \text{cost}, \, \text{quality} \rangle$$
376|
377|L'offre est broadcastée aux récepteurs potentiels : $\text{broadcast}(\text{ligand}) = \text{publish}(\text{topic}(\text{serviceType}), \, \text{ligand})$.
378|
379|### 9.2 Le récepteur : contrat d'acceptation
380|
381|$$\text{Receptor} = \langle \text{needId}, \, \text{agentId}, \, \text{requiredService}, \, \text{minCapabilities}, \, \text{maxCost}, \, \text{minQuality}, \, \text{preconditions} \rangle$$
382|
383|### 9.3 Le binding : compatibilité vérifiée
384|
385|$$\text{binding}(\text{ligand}, \text{receptor}) = \text{true} \iff$$$$\text{ligand.serviceType} = \text{receptor.requiredService} \land \text{ligand.capabilities} \supseteq \text{receptor.minCapabilities} \land \text{ligand.cost} \leq \text{receptor.maxCost} \land \text{ligand.quality} \geq \text{receptor.minQuality} \land \text{evaluate}(\text{receptor.preconditions}, \text{ligand}) = \text{true}$$
386|
387|**Affinité de binding** :$$\text{affinity}(\text{ligand}, \text{receptor}) = \frac{|\text{ligand.capabilities} \cap \text{receptor.minCapabilities}|}{|\text{receptor.minCapabilities}|} \cdot \frac{\text{ligand.quality}}{\text{receptor.minQuality}} \cdot \frac{1}{\text{ligand.cost}}$$
388|
389|### 9.4 La cascade : travail downstream autorisé
390|
391|Le binding déclenche une cascade de validation qui autorise le travail aval :$$\text{cascade}(\text{binding}) = \text{activate}(\text{receptor.agentId}, \, \text{inputs}=\text{ligand.outputs})$$
392|
393|Propagation récursive :$$\text{propagate}(V_i) = \forall E_{ij} \in E : \text{if } \text{binding}(V_i, V_j) \text{ then } \text{activate}(V_j)$$
394|
395|### 9.5 Spécificité et sélectivité
396|
397|La spécificité est garantie par la vérification formelle des schémas :$$\text{specificity}(\text{ligand}, \text{receptor}) = \text{schemaMatch}(\text{ligand.outputSchema}, \, \text{receptor.inputSchema})$$
398|
399|La sélectivité globale du réseau :$$\text{selectivity}(G) = \frac{|\text{successfulBindings}(G)|}{|\text{attemptedBindings}(G)|}$$
400|
401|Un taux de sélectivité élevé indique une bonne adéquation entre l'offre et la demande dans l'équipe.
402|
403|---
404|
405|## 10. Communication sélective
406|
407|Toute communication a un coût. Le système filtre par valeur décisionnelle :$$\text{Value}(m) = \text{Novelty}(m) \times \text{Relevance}(m) \times \text{DecisionImpact}(m)$$
408|
409|### 10.1 Les trois facteurs
410|
411|**Novelty** : information non déjà connue du destinataire :$$\text{Novelty}(m) = 1 - \frac{|\text{content}(m) \cap \text{TMS}(\text{recipient}).\text{self.knowledge}|}{|\text{content}(m)|}$$
412|
413|**Relevance** : pertinence par rapport au travail actuel :$$\text{Relevance}(m) = \max_{V_i \in \text{active}(\text{recipient})} \, \text{sim}(\text{topic}(m), \, R_i)$$
414|
415|**DecisionImpact** : probabilité que le message change la décision :$$\text{DecisionImpact}(m) = \begin{cases} 1.0 & \text{si } m \text{ modifie un contrat actif} \\ 0.8 & \text{si } m \text{ fournit une information bloquante} \\ 0.5 & \text{si } m \text{ suggère une optimisation} \\ 0.2 & \text{si } m \text{ est une mise à jour cosmétique} \\ 0.0 & \text{si } m \text{ ne change rien au plan} \end{cases}$$
416|
417|### 10.2 Classification des messages
418|
419|$$\text{classify}(m) = \begin{cases} \text{already\_known} & \text{si } \text{Novelty}(m) < \tau_n \\ \text{new\_irrelevant} & \text{si } \text{Novelty} \geq \tau_n \land \text{Relevance} < \tau_r \\ \text{new\_relevant} & \text{si } \text{Novelty} \geq \tau_n \land \text{Relevance} \geq \tau_r \\ \text{critical\_contradiction} & \text{si } m \text{ contredit un claim actif} \\ \text{contract\_update} & \text{si } m \text{ modifie un HandoffContract} \end{cases}$$
420|
421|Avec $\tau_n = 0.1$, $\tau_r = 0.3$.
422|
423|### 10.3 Actions selon la classification
424|
425|$$\text{action}(m) = \begin{cases} \text{discard} & \text{si already\_known} \\ \text{archive} & \text{si new\_irrelevant} \\ \text{notify} & \text{si new\_relevant} \\ \text{alert + escalate} & \text{si critical\_contradiction} \\ \text{validate + apply} & \text{si contract\_update} \end{cases}$$
426|
427|### 10.4 Métriques de communication
428|
429|Le débit utile de communication :$$\text{usefulThroughput}(t) = \sum_{m \in \text{messages}(t)} \text{Value}(m) \cdot \mathbb{1}[\text{action}(m) \neq \text{discard}]$$
430|
431|Le taux de bruit :$$\text{noiseRatio}(t) = \frac{|\{m \mid \text{action}(m) = \text{discard}\}|}{|\text{messages}(t)|}$$
432|
433|Le système vise $\text{noiseRatio} < 0.2$ en régime permanent.
434|
435|---
436|
437|## 11. Organisation modérément sparse
438|
439|L'A-Team n'a pas de topologie fixe unique. La structure varie selon la phase du projet et le sous-graphe de tâches actif.
440|
441|### 11.1 Topologie par phase
442|
443|**Phase d'exploration** : topologie étoile autour de l'architecte :$$G_{\text{explore}} = \{ V_{\text{architect}} \leftrightarrow V_i \mid \forall i \neq \text{architect} \}$$
444|
445|**Phase de construction** : pipeline sur le chemin critique :$$G_{\text{build}} = \{ V_i \to V_j \mid (V_i, V_j) \in \text{criticalPath}(G) \} \cup \text{parallelBranches}$$
446|
447|**Phase de validation** : mesh complet pour relecture croisée :$$G_{\text{validate}} = K_n \text{ (graphe complet sur l'équipe active)}$$
448|
449|### 11.2 Topologie par sous-graphe
450|
451|Différents sous-graphes du Work Graph ont des topologies distinctes :$$\forall S \subseteq G : \text{topology}(S) = f(\text{taskType}(S), \, \text{urgency}(S), \, \text{uncertainty}(S))$$
452|
453|La fonction de sélection :$$f(\text{type}, \, u, \, \sigma) = \begin{cases} \text{star} & \text{si } \sigma > 0.7 \\ \text{pipeline} & \text{si } u > 0.8 \land \sigma < 0.3 \\ \text{mesh} & \text{si } \text{type} = \text{validation} \\ \text{tree} & \text{sinon} \end{cases}$$
454|
455|### 11.3 Réconfiguration dynamique
456|
457|Le runtime reconfigure la topologie lorsque les conditions changent :$$\text{reconfigure}(S, \, \text{newConditions}) \iff \text{topology}(S) \neq f(\text{newConditions})$$
458|
459|La reconfiguration est atomique : elle ne perturbe pas les handoffs en cours et préserve les liaisons existantes compatibles.
460|
461|---
462|
463|## 12. Plafond de trois spécialistes : disparition
464|
465|L'A-Team de GenOS n'a pas de limite arbitraire de trois agents. La taille maximale est fonction des contraintes réelles du système.
466|
467|### 12.1 Fonction de taille maximale
468|
469|$$\text{maxTeamSize}(B, \, C, \, G, \, \kappa) = \min\left( \left\lfloor \frac{B}{\bar{c}} \right\rfloor, \, \left\lfloor \frac{C}{\kappa \cdot \text{density}(G)} \right\rfloor, \, \left\lfloor \sqrt{\frac{2C}{\kappa}} \right\rfloor \right)$$
470|
471|où :
472|- $B$ = budget total disponible
473|- $\bar{c}$ = coût moyen par agent
474|- $C$ = capacité de coordination du runtime
475|- $\kappa$ = coût de communication par lien
476|- $\text{density}(G) = \frac{2|E|}{|V|(|V|-1)}$ = densité du Work Graph
477|
478|### 12.2 Justification des trois termes
479|
480|**Terme budget** : $n_B = \left\lfloor \frac{B}{\bar{c}} \right\rfloor$ — on ne peut pas dépasser le budget.
481|
482|**Terme coordination** : $n_C = \left\lfloor \frac{C}{\kappa \cdot \text{density}(G)} \right\rfloor$ — le runtime peut gérer au maximum $C/\kappa$ connexions efficaces par agent.
483|
484|**Terme combinatoire** : $n_{\text{comb}} = \left\lfloor \sqrt{\frac{2C}{\kappa}} \right\rfloor$ — le nombre de liens croît quadratiquement ($|E| \sim n^2$), limitant la taille pratique.
485|
486|### 12.3 Exemple numérique
487|
488|Avec $B = 1000$, $\bar{c} = 50$, $C = 500$, $\kappa = 0.5$, $\text{density}(G) = 0.4$ :$$n_B = \left\lfloor \frac{1000}{50} \right\rfloor = 20$$$$n_C = \left\lfloor \frac{500}{0.5 \times 0.4} \right\rfloor = 2500$$$$n_{\text{comb}} = \left\lfloor \sqrt{\frac{2 \times 500}{0.5}} \right\rfloor = 44$$$$\text{maxTeamSize} = \min(20, 2500, 44) = 20$$
489|
490|L'équipe peut compter jusqu'à 20 agents sous ces contraintes.
491|
492|### 12.4 Scaling adaptatif
493|
494|Le runtime ajuste la taille de l'équipe en continu :$$\text{targetTeamSize}(t) = \text{optimalWindow}(\text{activeSubgraphs}(t), \, B(t), \, C(t))$$
495|
496|Si le budget augmente ou si le Work Graph gagne en parallélisme, l'équipe s'élargit :$$\text{resize}(T, \, \Delta n) = \begin{cases} \text{recruit}(\Delta n \text{ agents}) & \text{si } \Delta n > 0 \\ \text{consolidate}(|\Delta n| \text{ agents}) & \text{si } \Delta n < 0 \end{cases}$$
497|
498|La consolidation fusionne les rôles de plusieurs agents en un seul agent à capacité étendue :$$\text{consolidate}(V_i, V_j) = \langle R_i \cup R_j, \, C_i \cup C_j, \, A_i \cup A_j \rangle$$
499|
500|---
501|
502|## Résumé
503|
504|| Concept | Formule clé | Objectif |
505||---------|------------|----------|
506|| Work Graph | $G=(V,E,\omega,\gamma)$ | Architecture de travail prescrite |
507|| Activity Ratio | $\|A(t)\| / \|V\|$ | Mesure de parallélisme effectif |
508|| Team Utility | Coverage + α·Fit + ... - λ·Cost | Optimisation multi-dimensionnelle |
509|| Expertise Fit | $\text{sim}(R_i, \text{genome}(a))$ | Adéquation fine agent-tâche |
510|| Complementarity | $1 - J(\text{dom}(a), \text{dom}(b))$ | Diversité de couverture |
511|| Agent Profile | genome + experience + recipe | Sélection multidimensionnelle |
512|| Experience effective | $s(1-e^{-\lambda n})$ | Saturation asymptotique |
513|| TMS | self + others + meta | Mémoire distribuée |
514|| Trust decay | $e^{-\delta(t-t_{\text{last}})}$ | Fraîcheur des connaissances |
515|| KLG | Need → who knows? → contract | Localisation du savoir |
516|| HandoffContract | 15 champs typés | Transfert vérifié et traçable |
517|| Response | ACCEPT / PARTIAL / REJECT / ... | Décision structurée du récepteur |
518|| Ligand/Receptor | offer + acceptance + binding | Accouplement biomimétique |
519|| Affinity | $\frac{|\cap|}{|\text{min}|} \cdot \frac{\text{quality}}{\text{minQ}} \cdot \frac{1}{\text{cost}}$ | Quantification du couplage |
520|| Comm Value | Novelty × Relevance × Impact | Filtrage sélectif du bruit |
521|| Topology | phase-dependent + subgraph-dependent | Organisation adaptable |
522|| MaxTeamSize | $\min(\text{budget}, \text{coord}, \text{combinatorial})$ | Scaling contraint mais flexible |
523|| Consolidate | $\langle R_i \cup R_j, C_i \cup C_j, A_i \cup A_j \rangle$ | Fusion atomique de rôles |
524|
525|L'A-Team de GenOS est un système de coordination riche, formel et adaptable — où chaque décision de composition, communication et transfert est pilotée par des modèles mathématiques explicites et vérifiables.
526|


<!-- === PARTIE 3 === -->

1|# A-Team Topology — Part 3: Variantes, Intégration, Biomimétisme, Communications
2|
3|> **Version**: Final Operational State
4|> **Scope**: A-Team variant taxonomy, continuous integration mechanics, organizational failure recovery, biological analogy mapping, and communication protocol design.
5|> **Prerequisites**: A-Team Part 1 (fundamental primitives), A-Team Part 2 (coordination, Pareto layer, dependency graphs).
6|
7|---
8|
9|## 1. Taxonomie Complète des 11 Variantes A-Team
10|
11|Chaque variante est une spécialisation du même noyau d'orchestration, adaptée à une forme de structure de mission. Le noyau reste identique : agents autonomes, graphe de dépendances explicite, couche Pareto pour la sélection, et boundary spanners pour les interfaces.
12|
13|### 1.1 Tableau Synoptique
14|
15|| # | Variante | Description | Structure | Cas Idéal | Propriété Clé |
16||---|----------|-------------|-----------|-----------|---------------|
17|| 1 | **Expert Committee** | Panel d'experts de domaines distincts délibérant sur un problème transverse. Chaque agent possède une compétence non-redondante. | Ensemble plat d'experts + facilitateur. Sans hiérarchie productible, seulement consultative. | Décision architecturale nécessitant trois expertises (sécurité, performance, UX) simultanément. | Divergence maximale des opinions avant convergence. |
18|| 2 | **Pipeline** | Séquence linéaire où chaque agent traite l'output du précédent. | Chaîne ordonnée $A_1 \rightarrow A_2 \rightarrow \dots \rightarrow A_n$ avec buffers intermédiaires. | Traitement documentaire : collecte → extraction → synthèse → formatage → publication. | Latence additive, débit = min(throughput_i). |
19|| 3 | **Project DAG** | Graphe orienté acyclique généralisant Pipeline. Permet les fusions et branches parallèles. | $G = (V, E)$ où $V$ = agents producteurs, $E$ = dépendances artefact → artefact. | Un projet complet avec modules parallèles convergente vers un livrable unique. | Généralise toutes les autres variantes. |
20|| 4 | **Cross-Functional Pod** | Petite cellule autonome regroupant toutes les compétences nécessaires pour un sous-système complet. | Ensemble cohérent de 3-7 agents couvrant l'ensemble du cycle : design → implémentation → validation → déploiement. | Feature team livrant une capacité métier de bout en bout. | Autonomie maximale, dépendances externes minimales. |
21|| 5 | **Boundary-Spanner** | Agents dédiés exclusivement à l'interface entre deux domaines techniques distincts. | Agents placés sur les arêtes du DAG dont le domaine est la traduction sémantique entre deux vocabulaires techniques. | Intégration entre le service ML (probabilités) et le service Backend (déterministe). | Réduction du couplage sémantique entre domaines. |
22|| 6 | **Matrix Team** | Agents appartenant simultanément à deux organisations : une fonctionnelle (expertise) et une produit (livrable). | Grille bidimensionnelle fonction $\times$ produit. Chaque agent a deux responsables contextuels. | Organisation nécessitant à la fois l'expertise profonde (sécurité) et la livraison produit (checkout flow). | Optimise la réutilisation d'expertise rare. |
23|| 7 | **Tiger Team** | Groupe d'intervention formé en urgence pour résoudre un incident critique, avec autorité exceptionnelle. | Structure ad-hoc, durée de vie limitée, pouvoir de décision centralisé sur un commandant. | Failover de service critique, patch de sécurité zero-day, correction de data corruption. | Vitesse d'action, concentration des décisions, périmètre strict. |
24|| 8 | **Incident Command** | Structure hiérarchique temporaire pour gestion d'incident avec rôles nommés (Commander, Ops, Planning, Logistics). | Arbre de commandement avec chaîne claire d'escalade et délimitation temporelle. | Multi-service outage nécessitant coordination entre SRE, DBA, Network, Application. | Chaîne d'autorité inambiguë, slots de com fixes. |
25|| 9 | **Multiteam System (MTS)** | Ensemble de teams A-Team elles-mêmes composants d'une meta-mission. Chaque sous-team a son propre objectif mais contribue à un objectif systémique. | Réseau de teams, avec boundary spanners inter-teams (liaisons). | Refonte de plateforme : équipe Frontend, Backend, Data, Infrastructure, chacune A-Team, coordonnées par un Integration Council. | Propriété émergeante non-réductible à une seule team. |
26|| 10 | **Adaptive A-Team** | A-Team dont la composition et la structure évoluent au cours de la mission en fonction des écarts détectés. | Structure méta avec boucle : observe → diagnose gap → recrute/libère → reconfigure DAG → continue. | Mission exploratoire dont le périmètre n'est pas connu à l'avancement : recherche, innovation radicale, due diligence. | Résilience structurelle, coût de reconfiguration. |
27|| 11 | **Relay Team** | Agents se passent le relais séquentiellement, chaque agent complétant le travail du précédent sans parallélisme. | Chaîne strictement séquentielle $A_1 \xrightarrow{\tau_1} A_2 \xrightarrow{\tau_2} \dots$ où $\tau_i$ est un artifact handoff formalisé. | Tâches avec contrainte de contexte maximal : un seul agent peut détenir le state complet à un moment. | Garantie de cohérence contextuelle, latence maximale. |
28|
29|### 1.2 Formule de Sélection de Variante
30|
31|La sélection de la variante optimale est une fonction des propriétés de la mission :
32|
33|$$
34|\text{variante}^*(M) = \arg\min_{v \in \mathcal{V}} \left[ \alpha \cdot \text{latency}_v(M) + \beta \cdot \text{coordination\_cost}_v(M) + \gamma \cdot \text{fragility}_v(M) \right]
35|$$
36|
37|où :
38|- $\mathcal{V}$ = ensemble des 11 variantes
39|- $M$ = mission avec ses contraintes (taille, urgence, incertitude, couplage)
40|- $\alpha, \beta, \gamma$ = coefficients de pondération déterminés par le méta-paramètre de l'organisation
41|
42|---
43|
44|## 2. Project DAG : La Variante Universelle
45|
46|### 2.1 Définition Formelle
47|
48|Le Project DAG est la seule variante capable de représenter toutes les autres par restriction :
49|
50|$$
51|G_{\text{project}} = (V, E, \mathcal{A}, \mathcal{R})
52|$$
53|
54|où :
55|- $V = \{v_1, v_2, \dots, v_n\}$ est l'ensemble des nœuds (agents producteurs)
56|- $E \subseteq V \times V$ est l'ensemble des arêtes (dépendances)
57|- $\mathcal{A}: V \rightarrow \text{ArtifactType}$ associe à chaque nœud un type d'artefact produit
58|- $\mathcal{R}: E \rightarrow \text{Requirement}$ associe à chaque arête une exigence de compatibilité
59|
60|### 2.2 Réduction des Autres Variantes au DAG
61|
62|Chaque variante est un Project DAG avec contraintes structurelles :
63|
64|| Variante | Contrainte sur $G_{\text{project}}$ |
65||----------|--------------------------------------|
66|| Pipeline | $\forall v_i: \text{deg}^-(v_i) \leq 1 \land \text{deg}^+(v_i) \leq 1$ (chemin simple) |
67|| Expert Committee | $\nexists E$ : aucun agent ne dépend d'un autre, seulement délibération |
68|| Cross-Functional Pod | Sous-graphe fortement connexe avec couverture de domaine complète |
69|| Boundary-Spanner | Nœuds spécialisés sur les arêtes : domaine = interface |
70|| Tiger Team | $G$ réduit à un sous-graphe critique avec chemin critique priorisé |
71|| MTS | $G$ est un méta-graphe dont les nœuds sont eux-mêmes des DAGs |
72|| Adaptive A-Team | $G(t)$ évolue : $V(t+1) = V(t) \cup \Delta^+ \cup \Delta^-$ |
73|
74|### 2.3 Tri Topologique et Ordonnancement
75|
76|L'exécution suit l'ordre topologique du DAG :
77|
78|$$
79|\text{schedule}(G) = \text{topo\_sort}(G) = [v_{\sigma(1)}, v_{\sigma(2)}, \dots, v_{\sigma(n)}]
80|$$
81|
82|$$
83|\forall (v_i, v_j) \in E: \sigma(i) < \sigma(j)
84|$$
85|
86|La parallélisme maximal est calculé par les niveaux du DAG :
87|
88|$$
89|L_k = \{v \in V : \text{longest\_path}(\text{source}, v) = k\}
90|$$
91|
92|$$
93|\text{max\_parallelism}(G) = \max_k |L_k|
94|$$
95|
96|### 2.4 Calcul du Chemin Critique
97|
98|Le chemin critique détermine la latence minimale de la projet :
99|
100|$$
101|\text{critical\_path}(G) = \arg\max_{p \in \text{paths}(G)} \sum_{v \in p} \tau(v)
102|$$
103|
104|où $\tau(v)$ est le temps d'exécution du nœud $v$. Tout retard sur un nœud du chemin critique impacte directement la livraison projet :
105|
106|$$
107|\Delta \text{latency} = \Delta \tau(v_{\text{critical}}) \quad \forall v_{\text{critical}} \in \text{critical\_path}(G)
108|$$
109|
110|---
111|
112|## 3. Intégration Continue : Le Cycle Produce-Integrate-Repair
113|
114|### 3.1 Principe Fondamental
115|
116|L'intégration n'est jamais un événement terminal. Elle est un flux continu :
117|
118|$$
119|\text{integration}: \prod_{i} \text{Artifact}_i \xrightarrow{\text{validate}} \text{Compatible}(\text{Artifact}_i) \oplus \text{Incompatible} \xrightarrow{\text{repair}} \text{Compatible}
120|$$
121|
122|Le cycle complet est :
123|
124|1. **Produce** : l'agent produit un artefact révisé
125|2. **Integrate** : le sous-système d'intégration compose les artefacts
126|3. **Detect** : les validateurs détectent les incompatibilités
127|4. **Repair** : l'agent responsable corrige localement
128|5. **Continue** : la production reprend, l'intégration revalide
129|
130|### 3.2 Exemple Complet : Backend ↔ Frontend
131|
132|**Étape 1 — Backend produit API Contract v1**
133|
134|```yaml
135|artifact_id: API_CONTRACT_BF_001
136|version: 1
137|producer: backend_agent
138|schema:
139|  endpoint: /api/users
140|  response:
141|    fields: [id, name, email]
142|    # Absent: pagination_metadata
143|```
144|
145|**Étape 2 — Frontend receptor valide**
146|
147|```
148|REJECT: API_CONTRACT_BF_001 v1
149|  reason: Missing pagination_metadata (required by FRONTEND_INV_PAG_07)
150|  constraint: Response sets > 256 items MUST include pagination
151|  severity: BLOCKING
152|```
153|
154|**Étape 3 — Backend répare**
155|
156|Le backend agent reçoit le rejet avec la contrainte violée. Il produit :
157|
158|```yaml
159|artifact_id: API_CONTRACT_BF_001
160|version: 2
161|producer: backend_agent
162|schema:
163|  endpoint: /api/users
164|  response:
165|    fields: [id, name, email]
166|    pagination_metadata:
167|      total_count: integer
168|      page: integer
169|      page_size: integer
170|      next_cursor: string | null
171|```
172|
173|**Étape 4 — Frontend receptor revalide**
174|
175|```
176|ACCEPT: API_CONTRACT_BF_001 v2
177|  verified_constraints: [FRONTEND_INV_PAG_07]
178|  compatibility: CONFIRMED
179|  integration_status: READY
180|```
181|
182|**Étape 5 — Continue**
183|
184|La Frontend reprend le travail sur des fondations validées. Le DAG se stabilise.
185|
186|### 3.3 Formule de Convergence de l'Intégration
187|
188|L'intégration continue converge vers un état stable où tous les artefacts sont mutuellement compatibles :
189|
190|$$
191|\text{compatibility\_state}(t+1) = \Phi\left(\text{compatibility\_state}(t), \text{repairs}(t)\right)
192|$$
193|
194|$$
195|\lim_{t \to \infty} \text{compatibility\_state}(t) = \forall (a_i, a_j) \in \text{ArtifactPairs}: \text{compatible}(a_i, a_j) = \top
196|$$
197|
198|La vitesse de convergence dépend du temps de réparation :
199|
200|$$
201|t_{\text{convergence}} = \sum_{\text{rejects}} \left( t_{\text{detect}} + t_{\text{route}} + t_{\text{repair}} + t_{\text{re-validate}} \right)
202|$$
203|
204|### 3.4 Propriétés du Repair Local
205|
206|La réparation est locale : seul l'agent producteur de l'artefact rejeté est mobilisé :
207|
208|$$
209|\text{repair\_scope}(\text{reject}(a_i)) = \{ \text{producer}(a_i) \}
210|$$
211|
212|Les autres agents continuent leur travail sans blocage, à condition que leur propre sous-graphe de dépendance soit stable :
213|
214|$$
215|\text{agent}_j \text{ can continue} \iff \forall a_k \in \text{deps}(j): \text{compatible}(a_k) = \top
216|$$
217|
218|---
219|
220|## 4. Le Véritable Integration Graph
221|
222|### 4.1 Définition
223|
224|L'Integration Graph est la représentation explicite de qui possède quoi, qui consomme quoi, et qui est bloqué par quoi :
225|
226|$$
227|G_{\text{integration}} = (O, C, S, \mathcal{B})
228|$$
229|
230|où :
231|- $O$: mapping agent → owned artifacts
232|- $C$: mapping agent → consumed artifacts (avec version requise)
233|- $S$: status de chaque artifact (READY | BLOCKED | STALE)
234|- $\mathcal{B}$: raisons explicites de blocage
235|
236|### 4.2 Exemple Multi-Domaines
237|
238|```
239|FRONTEND_AGENT:
240|  owns:    UI_EVENTS#8, COMPONENT_TREE#3
241|  consumes: API_SCHEMA#12 (>= v2), AUTH_SPEC#5
242|  status:  ACTIVE
243|
244|BACKEND_AGENT:
245|  owns:    API_SCHEMA#12 (v3), AUTH_SPEC#7
246|  consumes: DB_SCHEMA#9, CACHE_POLICY#2
247|  must_satisfy: AUTH_INV#17
248|  status:  ACTIVE
249|
250|SECURITY_AGENT:
251|  owns:    AUTH_INV#17, THREAT_MODEL#1
252|  consumes: (none — only publishes constraints)
253|  status:  ACTIVE
254|
255|INTEGRATION STATUS:
256|  API_SCHEMA#12 v3 → FRONTEND: COMPATIBLE ✓
257|  AUTH_SPEC#7 → AUTH_INV#17: BLOCKED — token format mismatch (RFC 7662 vs custom)
258|  DB_SCHEMA#9 → BACKEND: STALE — schema drift detected, awaiting sync
259|```
260|
261|### 4.3 Formule de Propagation des Blocages
262|
263|Le statut d'un agent se propage le long du graphe de dépendances :
264|
265|$$
266|\text{status}(v_j) = \begin{cases}
267|\text{ACTIVE} & \text{if } \forall a_i \in \text{deps}(v_j): \text{status}(a_i) = \text{READY} \\
268|\text{BLOCKED}(a_k, \text{reason}) & \text{if } \exists a_k \in \text{deps}(v_j): \text{status}(a_k) \neq \text{READY} \\
269|\text{STALE} & \text{if } \exists a_i \in \text{owned}(v_j): \text{version}(a_i) < \text{consumed\_version}(a_i)
270|\end{cases}
271|$$
272|
273|### 4.4 Raison Explicite Obligatoire
274|
275|Chaque blocage porte une raison inspectable. La raison est une structure formalisée :
276|
277|$$
278|\text{BlockReason} = \langle \text{constraint\_id}, \text{expected}, \text{actual}, \text{suggested\_fix} \rangle
279|$$
280|
281|Exemple :
282|
283|$$
284|\text{BlockReason}(\text{AUTH\_SPEC\#7}, \text{AUTH\_INV\#17}) = \langle \text{TOKEN\_FORMAT}, \text{RFC 7662 introspection}, \text{Custom opaque token}, \text{Add RFC 7662 endpoint at /auth/introspect} \rangle
285|$$
286|
287|---
288|
289|## 5. Le Pareto Reste Utile au Bon Niveau
290|
291|### 5.1 Pareto par Décision Locale, Pas Global
292|
293|Le principe Pareto s'applique à chaque point de décision concrète, pas au projet entier :
294|
295|$$
296|\text{Pareto}_{\text{local}}: \text{Options}_i \rightarrow \text{ParetoFront}_i \subset \text{Options}_i
297|$$
298|
299|Chaque branche de décision sélectionne localement, puis propage sa solution retenue en aval.
300|
301|### 5.2 Exemple Hiérarchique
302|
303|**Décision 1 — 3 implémentations de base de données candidates**
304|
305|$$
306|\text{Options}_{\text{DB}} = \{\text{PostgreSQL}, \text{MongoDB}, \text{Redis}\}
307|$$
308|
309|Critères : consistency, query expressiveness, write throughput.
310|
311|$$
312|\text{ParetoFront}_{\text{DB}} = \{\text{PostgreSQL}, \text{MongoDB}\}
313|$$
314|
315|Sélection : PostgreSQL (cohérence transactionnelle requise par INV_CONSISTENCY_03).
316|
317|**Décision 2 — 3 designs d'API candidates**
318|
319|$$
320|\text{Options}_{\text{API}} = \{\text{REST}, \text{GraphQL}, \text{gRPC}\}
321|$$
322|
323|Critères : client flexibility, schema typing, network efficiency.
324|
325|$$
326|\text{ParetoFront}_{\text{API}} = \{\text{GraphQL}, \text{gRPC}\}
327|$$
328|
329|Sélection : GraphQL (nécessite la flexibilité client pour UI_EVENTS#8).
330|
331|**Décision 3 — 3 stratégies de déploiement candidates**
332|
333|$$
334|\text{Options}_{\text{Deploy}} = \{\text{Blue/Green}, \text{Canary}, \text{Rolling}\}
335|$$
336|
337|Critères : rollback speed, resource overhead, complexity.
338|
339|$$
340|\text{ParetoFront}_{\text{Deploy}} = \{\text{Blue/Green}, \text{Canary}\}
341|$$
342|
343|Sélection : Canary (détecte les régressions sur sous-ensemble avant full rollout).
344|
345|**Propagation** : Chaque branche transmet sa solution retenue au DAG en aval. Le backend sait qu'il cible PostgreSQL. Le frontend sait qu'il consommere GraphQL. Le déploiement sait qu'il appliquera Canary.
346|
347|### 5.3 Formule de la Frontière Pareto
348|
349|$$
350|\text{ParetoFront}(S) = \{x \in S \mid \nexists y \in S: \forall i: f_i(y) \succeq f_i(x) \land \exists j: f_j(y) \succ f_j(x)\}
351|$$
352|
353|où $S$ est l'ensemble des options, $f_i$ sont les fonctions critère, et $\succeq$ est la relation de dominance (meilleur ou égal).
354|
355|La sélection sur la frontière utilise une fonction d'utilité agrégée :
356|
357|$$
358|\text{selection}^* = \arg\max_{x \in \text{ParetoFront}(S)} \sum_{i} w_i \cdot f_i(x)
359|$$
360|
361|avec $\sum_i w_i = 1$ et les poids $w_i$ déterminés par les invariants de la mission.
362|
363|### 5.4 Propagation Pareto dans le DAG
364|
365|La sélection Pareto d'un nœud en amont contraint l'espace des options en aval :
366|
367|$$
368|\text{Options}_{\text{downstream}}(v_j) = \text{filter}\left(\text{Options}(v_j), \text{selection}^*_{\text{upstream}}(v_i) \right)
369|$$
370|
371|$$
372|\forall (v_i, v_j) \in E: \text{Options}(v_j) \subseteq \text{compatible}(\text{selection}^*(v_i))
373|$$
374|
375|---
376|
377|## 6. Recrutement Dynamique
378|
379|### 6.1 Détection de Capability Gap
380|
381|Un gap de capacité est détecté quand un domaine requis n'est couvert par aucun agent actif :
382|
383|$$
384|\text{gap}(D) = D \notin \bigcup_{v \in V(t)} \text{domains}(v)
385|$$
386|
387|$$
388|\text{urgency}(D) = \begin{cases}
389|\text{CRITICAL} & \text{if } D \in \text{deps}(\text{critical\_path}) \\
390|\text{HIGH} & \text{if } \exists v \in V(t): \text{status}(v) = \text{BLOCKED}(D) \\
391|\text{MEDIUM} & \text{if } \exists \text{ future\_phase}: D \in \text{required}(\text{phase}) \\
392|\text{LOW} & \text{otherwise}
393|\end{cases}
394|$$
395|
396|### 6.2 Recherche dans le Graphe d'Expertise
397|
398|$$
399|\text{candidates}(D) = \{a \in \text{ExpertiseGraph}: \text{competence}(a, D) \geq \theta_{\text{threshold}}\}
400|$$
401|
402|Le matching utilise une similarité sémantique entre le domaine requis et les compétences de l'agent :
403|
404|$$
405|\text{match\_score}(a, D) = \frac{|\text{competencies}(a) \cap \text{requirements}(D)|}{|\text{requirements}(D)|}
406|$$
407|
408|### 6.3 Recrutement et Insertion dans le DAG
409|
410|L'agent sélectionné est inséré dans le DAG aux points de dépendance :
411|
412|$$
413|V(t+1) = V(t) \cup \{a^*\}
414|$$
415|
416|$$
417|E(t+1) = E(t) \cup \{(a^*, v) : v \text{ requires } D\} \cup \{(v, a^*) : a^* \text{ requires } \text{owned}(v)\}
418|$$
419|
420|### 6.4 Ajustement du Budget
421|
422|Le recrutement consomme le budget disponibilité :
423|
424|$$
425|B(t+1) = B(t) - \text{cost}(a^*) + \sum_{\text{unblocked}} \text{throughput\_gain}(v)
426|$$
427|
428|$$
429|\text{ROI}(a^*) = \frac{\text{throughput\_gain}}{\text{cost}(a^*)} > 1 \quad \text{(condition de recrutement)}
430|$$
431|
432|### 6.5 Libération quand le Rôle n'est Plus Utile
433|
434|Quand le domaine couvert par l'agent n'est plus requis par aucun nœud dépendant :
435|
436|$$
437|\text{release\_condition}(a) = \nexists v \in V(t): D \in \text{deps}(v) \land \text{status}(v) \neq \text{COMPLETE}
438|$$
439|
440|$$
441|V(t+1) = V(t) \setminus \{a\} \quad \text{si release\_condition}(a) = \top
442|$$
443|
444|### 6.6 Cycle Complet du Recrutement Dynamique
445|
446|$$
447|\text{recruitment\_cycle}: \text{detect gap} \rightarrow \text{search expertise graph} \rightarrow \text{evaluate candidates} \rightarrow \text{recruit } a^* \rightarrow \text{recompute DAG} \rightarrow \text{adjust budget} \rightarrow \text{continue}
448|$$
449|
450|$$
451|\text{release\_cycle}: \text{monitor relevance} \rightarrow \text{detect obsolescence} \rightarrow \text{release} \rightarrow \text{recompute DAG} \rightarrow \text{adjust budget} \rightarrow \text{continue}
452|$$
453|
454|---
455|
456|## 7. Failure Recovery Organisationnel
457|
458|### 7.1 Arbre de Décision de Recovery
459|
460|Quand un agent échoue (ne produit pas d'artefact compatible dans le délai alloué) :
461|
462|**Q1 — L'agent est sur le chemin critique ?**
463|
464|$$
465|\text{on\_critical\_path}(v) \in \{\top, \bot\}
466|$$
467|
468|**Q2 — Un autre agent est-il capable de prendre le relais ?**
469|
470|$$
471|\text{capable\_replacement}(D) = \{a \in V(t) \setminus \{v\} : \text{competence}(a, D) \geq \theta\}
472|$$
473|
474|**Q3 — Un remplacement externe est-il disponible ?**
475|
476|$$
477|\text{external\_available}(D) = \text{search\_expertise\_graph}(D) \neq \emptyset
478|$$
479|
480|### 7.2 Actions de Recovery
481|
482|| Q1 | Q2 | Q3 | Action |
483||----|----|----|--------|
484|| Oui | Oui | — | **REASSIGN** : transfert au capable existant |
485|| Oui | Non | Oui | **RECRUIT** : insertion d'un nouveau spécialiste |
486|| Oui | Non | No | **SPLIT** : diviser le domaine en sous-domaines traitables par plusieurs agents |
487|| Non | Oui | — | **DEFER** : reporter le sous-DAG non-critique, maintenir le flux |
488|| Non | Non | — | **BLOCK** : mettre le sous-graphe en attente avec status BLOCKED(external_dependency) |
489|
490|### 7.3 Formule de Priorité de Recovery
491|
492|$$
493|\text{priority}(v) = \text{on\_critical\_path}(v) \times \text{domino\_effect}(v) \times \text{deadline\_proximity}(v)
494|$$
495|
496|où :
497|- $\text{domino\_effect}(v) = |\{u \in V : \text{path}(v, u) \in E^+\}|$ (nombre de nœuds en aval)
498|- $\text{deadline\_proximity}(v) = 1 - \frac{\text{time\_remaining}}{\text{total\_time}}$
499|
500|### 7.4 Reassignnement
501|
502|$$
503|\text{reassign}(v_{\text{failed}}, v_{\text{replacement}}) = \begin{cases}
504|\text{owned}(v_{\text{replacement}}) \cup \text{owned}(v_{\text{failed}}) \\
505|\text{deps}(v_{\text{replacement}}) \cup \text{deps}(v_{\text{failed}}) \\
506|\text{status}(v_{\text{failed}}) \leftarrow \text{RELEASED}
507|\end{cases}
508|$$
509|
510|### 7.5 Split de Domaine
511|
512|Quand aucun agent ne peut couvrir tout le domaine du nœud échoué :
513|
514|$$
515|\text{split}(D, \{a_1, \dots, a_k\}) = \{D_1, \dots, D_k\} \quad \text{where} \quad \bigcup_i D_i = D \quad \text{and} \quad D_i \cap D_j = \emptyset
516|$$
517|
518|Chaque sous-domaine $D_i$ est assigné à un agent $a_i$ compétent.
519|
520|---
521|
522|## 8. Biomimétisme Profond : 10 Mécanismes Biologiques → Traduction GenOS
523|
524|### 8.1 Tableau des Correspondances
525|
526|| # | Mécanisme Biologique | Description Biologique | Traduction GenOS | Artefact Système |
527||----------------------|----------------------|------------------------|------------------|------------------|
528|| 1 | **Différenciation Cellulaire** | Cellule souche → cellule spécialisée selon son environnement (niche). | Agent générique → agent spécialisé selon le domaine de la mission. Recrutement dynamique avec spécialisation contextuelle. | `AgentProfile.domain_assignment`, `CompetencyMatrix` |
529|| 2 | **Ligand/Récepteur** | Molécule signal (ligand) ne se qu''au récepteur spécifique sur la cellule cible. | Artifact produit ne s'intègre qu'au consumer qui déclare le bon type/schema requis. Routing par type explicite. | `Artifact.type`, `Consumer.requirement_schema` |
530|| 3 | **Tissus** | Cellules de même type structural forment un tissu cohérent avec matrice extracellulaire. | Agents de même domaine forment un Cross-Functional Pod. La matrice extracellulaire = les artefacts partagés (API contracts, schemas). | `Pod.definition`, `SharedArtifactRegistry` |
531|| 4 | **Membranes** | Barrière semi-permissive : passage contrôlé par transporteurs spécifiques. | Boundary entre domaines avec validation stricte. Rien ne passe sans validation d'intégration. | `DomainBoundaryValidator`, `IntegrationGateway` |
532|| 5 | **Jonctions Cellulaires** | Gap junctions, desmosomes, tight junctions : connexions structurales avec perméabilité variable. | Modes de communication entre agents : tight = synchronisé, gap = asynchrone, desmosome = couplage fort ownership. | `CommunicationChannel.junction_type`, `CouplingDescriptor` |
533|| 6 | **Système Nerveux** | Signaux électriques rapides pour communication immédiate (danger, coordination motrice). | Fast path de communication : changements critiques nécessitant action immédiate. Latence < seuil. | `FastPathRouter`, `UrgencyClassifier` |
534|| 7 | **Hormones** | Signaux chimiques lents mais portée globale. Effet modulateur à long terme. | Slow path de communication : rationale architecturale, leçons apprises, objectifs mission. Latence acceptable, persistance requise. | `SlowPathBus`, `KnowledgeRepository` |
535|| 8 | **Système Immunitaire** | Reconnaissance du soi vs non-soi. Réaction proportionnée aux anomalies. | Validation d'intégilité des artefacts. Tout artefact non conforme = non-soi → rejet. Auto-tolérance = conformité validée → acceptation. | `ArtifactImmunityChecker`, `CompatibilityWhiteList` |
536|| 9 | **Cicatrisation** | Réponse aux lésions : inflammation → prolifération → remodeling → tissu fonctionnel restauré. | Recovery organisationnel : détect échec → recrute/remplace → reconfigure DAG → restaure le flux. | `RecoveryPipeline`, `TissueRemodeling` |
537|| 10 | **Apoptose** | Mort cellulaire programmée : la cellule se sacrifie pour le bien du tissu, proprement, sans inflammation. | Libération d'agent : quand le domaine n'est plus requis, l'agent se retire proprement, libérant son budget et ses ressources. | `AgentLifecycleManager`, `GracefulReleaseProtocol` |
538|
539|### 8.2 Modèle Formel du Biomimétisme
540|
541|$$
542|\text{GenOS}_{\text{biomimetic}} = \mathcal{F}\left(\sum_{i=1}^{10} \phi_i(\text{biological\_mechanism}_i)\right)
543|$$
544|
545|où $\phi_i$ est la fonction de traduction du mécanisme biologique $i$ en primitive système.
546|
547|### 8.3 Émergence
548|
549|Les 10 mécanismes agissent ensemble pour produire une propriété émergente : la **résilience organisationnelle**.
550|
551|$$
552|\text{resilience} = \text{emergent}\left(\bigcup_{i=1}^{10} \text{mechanism}_i\right) \notin \text{mechanism}_j \quad \forall j
553|$$
554|
555|La résilience n'est aucun des mécanismes individuellement, mais résulte de leur interaction cohérente.
556|
557|---
558|
559|## 9. Communications Multi-Vitesses
560|
561|### 9.1 Les 4 Canaux
562|
563|| Canal | Vitesse | Portée | Latence Cible | Exemples |
564||-------|---------|--------|---------------|----------|
565|| **Fast Path** | Immédiate | Ciblée | < 50ms | Interface changed, test failed, security invariant broken |
566|| **Slow Path** | Asynchrone | Ciblée | < 5min | Architecture rationale, lessons learned, design decisions |
567|| **Broadcast** | Immédiate | Globale | < 100ms | Mission objective changed, priority re-ordering, emergency stop |
568|| **Unicast** | Rapide | 1:1 | < 10ms | API schema changed → single consumer |
569|| **Multicast** | Rapide | 1:N (groupe) | < 20ms | Auth contract changed → frontend + backend + security |
570|
571|### 9.2 Classification Automatique des Messages
572|
573|$$
574|\text{route}(m) = \begin{cases}
575|\text{FastPath} & \text{if } \text{urgency}(m) > \tau_{\text{urgent}} \land |\text{targets}(m)| = 1 \\
576|\text{Broadcast} & \text{if } \text{impact}(m) = \text{global} \\
577|\text{Unicast} & \text{if } |\text{targets}(m)| = 1 \land \text{urgency}(m) \leq \tau_{\text{urgent}} \\
578|\text{Multicast} & \text{if } 1 < |\text{targets}(m)| \leq k \land \text{urgency}(m) \leq \tau_{\text{urgent}} \\
579|\text{SlowPath} & \text{if } \text{persistence\_required}(m) = \top \land \text{urgency}(m) \leq \tau_{\text{normal}}
580|\end{cases}
581|$$
582|
583|### 9.3 Formule de Latence Composée
584|
585|La latence d'un message sur le fast path :
586|
587|$$
588|t_{\text{fast}} = t_{\text{classify}} + t_{\text{route}} + t_{\text{deliver}} + t_{\text{react}}
589|$$
590|
591|Le fast path garantit :
592|
593|$$
594|t_{\text{fast}} < t_{\text{reaction\_threshold}} \quad \text{(sinon l'incident se propage)}
595|$$
596|
597|### 9.4 Multicast avec Cohérence
598|
599|Quand un message multicast touche $N$ agents, la cohérence de la réception est garantie :
600|
601|$$
602|\text{consistent\_delivery}(m, S) = \forall s_i, s_j \in S: \text{receive\_order}(m, s_i) = \text{receive\_order}(m, s_j)
603|$$
604|
605|ou, si l'ordre n'est critique :
606|
607|$$
608|\text{eventual\_consistent\_delivery}(m, S) = \forall s \in S: \text{eventually\_receive}(s, m)
609|$$
610|
611|### 9.5 Exemple Complet : Auth Contract Change
612|
613|```
614|MULTICAST MESSAGE
615|  channel: AUTH_CONTRACT_CHANGED
616|  payload:
617|    artifact_id: AUTH_SPEC#7
618|    version: 8
619|    change: token_format → RFC 7662
620|    effective: immediate
621|  targets: [FRONTEND, BACKEND, SECURITY]
622|  priority: HIGH
623|  consistency: ORDERED
624|
625|  DELIVERY:
626|    FRONTEND: received at t=0.2ms → triggers re-validation of AUTH_SPEC dependency
627|    BACKEND: received at t=0.3ms → updates token generation endpoint
628|    SECURITY: received at t=0.1ms → confirms invariant satisfaction
629|```
630|
631|---
632|
633|## 10. Modes de Participation
634|
635|### 10.1 Les 6 Modes
636|
637|| Mode | Rôle | Autorité | Phase Typique | Sortie Principale |
638||------|------|----------|---------------|-------------------|
639|| **Producer** | Crée des artefacts (code, specs, configs) | Full ownership du domaine assigné | Build, Implement | Artefact versionné |
640|| **Consultant** | Fournit expertise à la demande sans ownership | Advisory, pas de décision | Design, Review | Opinion documentée |
641|| **Reviewer** | Évalue les artefacts d'autres agents selon ses critères d'expertise | Veto sur son domaine | Review, Validate | ACCEPT / REJECT + raison |
642|| **Integrator** | Compose les artefacts de plusieurs domaines et détecte les incompatibilités | Escalation en cas de conflit non-résolu | Integration | Integration Report |
643|| **Verifier** | Vérifie les invariants et contraintes (sécurité, performance, compliance) | Blocage si invariant violé | Validate, Verify | Verification Certificate |
644|| **Decision Owner** | Prend la décision finale quand les autres modes convergent vers un blocage | Autorité de choix arbitraire | Decision, Arbitration | Decision Record |
645|
646|### 10.2 Transitions entre Modes au Fil des Phases
647|
648|Un même agent peut changer de mode selon la phase de la mission :
649|
650|$$
651|\text{mode}(v, \text{phase}_k) \in \{\text{Producer}, \text{Consultant}, \text{Reviewer}, \text{Integrator}, \text{Verifier}, \text{DecisionOwner}\}
652|$$
653|
654|Exemple pour un agent Backend au cours d'un projet complet :
655|
656|```
657|Phase 1 (Design):    Consultant → review les designs proposés par Frontend
658|Phase 2 (Build):     Producer   → implémente les endpoints API
659|Phase 3 (Review):    Reviewer   → évalue les PRs de sécurité
660|Phase 4 (Integrate): Integrator → compose API Schema avec Frontend components
661|Phase 5 (Verify):    Verifier   → confirme les invariants de performance
662|Phase 6 (Decide):    DecisionOwner → choisit entre caching strategies
663|```
664|
665|### 10.3 Formule de Compatibilité des Modes
666|
667|Deux agents interagissant doivent avoir des modes compatibles :
668|
669|$$
670|\text{compatible\_modes}(m_i, m_j) = \begin{cases}
671|\top & \text{if } m_i = \text{Producer} \land m_j \in \{\text{Reviewer}, \text{Verifier}, \text{Integrator}\} \\
672|\top & \text{if } m_i = \text{Consultant} \land m_j = \text{Producer} \\
673|\top & \text{if } m_i = \text{DecisionOwner} \land m_j = \text{Consultant} \\
674|\bot & \text{if } m_i = \text{Producer} \land m_j = \text{Producer} \land \text{same\_domain} \quad \text{(conflit)}
675|\end{cases}
676|$$
677|
678|---
679|
680|## 11. Boundary Spanners
681|
682|### 11.1 Définition
683|
684|Les Boundary Spanners sont des agents temporaires dont le domaine n'est PAS un domaine technique (backend, frontend, data) mais l'interface elle-même entre deux domaines.
685|
686|$$
687|\text{BoundarySpacer} = \langle \text{domain}_a, \text{domain}_b \rangle \quad \text{where} \quad \text{expertise} = \text{interface}(\text{domain}_a, \text{domain}_b)
688|$$
689|
690|### 11.2 Exemples de Boundary Spanners
691|
692|| Boundary Spanner | Domaine A | Domaine B | Role |
693||------------------|-----------|-----------|------|
694|| API Contract Integrator | Backend | Frontend | Traduit les data models backend en schemas frontend-consumable |
695|| Security Boundary Reviewer | Security | Backend | Vérifie que les endpoints backend satisfont les auth invariants |
696|| Data Contract Negotiator | Data Engineering | ML Engineering | Établit le schema de features attendu par les modèles |
697|| UI Events Translator | Frontend | Analytics | Mappe les événements UI en schema analytics |
698|
699|### 11.3 Insertion dans le DAG
700|
701|Les Boundary Spanners sont insérés sur les arêtes du DAG entre deux domaines :
702|
703|$$
704|\forall (v_a, v_b) \in E: \text{cross\_domain}(v_a, v_b) \implies \exists v_{\text{bs}}: \text{between}(v_{\text{bs}}, v_a, v_b)
705|$$
706|
707|$$
708|E_{\text{with\_spanners}} = E \setminus \{(v_a, v_b)\} \cup \{(v_a, v_{\text{bs}}), (v_{\text{bs}}, v_b)\}
709|$$
710|
711|### 11.4 Formule de Réduction du Couplage
712|
713|Les Boundary Spanners réduisent le couplage sémantique entre domaines :
714|
715|$$
716|\text{coupling}(D_a, D_b) = \frac{|\text{shared\_vocabulary}(D_a, D_b)|}{|D_a| + D_b}
717|$$
718|
719|$$
720|\text{coupling}_{\text{with\_BS}}(D_a, D_b) = \text{coupling}(D_a, D_{\text{BS}}) + \text{coupling}(D_{\text{BS}}, D_b)
721|$$
722|
723|L'avantage net :
724|
725|$$
726|\Delta\text{coupling} = \text{coupling}(D_a, D_b) - (\text{coupling}(D_a, D_{\text{BS}}) + \text{coupling}(D_{\text{BS}}, D_b)) > 0
727|$$
728|
729|---
730|
731|## 12. Prébrief et Debrief Obligatoires
732|
733|### 12.1 TEAM PREBRIEF
734|
735|Chaque mission commence par un prébrief structuré qui établit les règles du jeu :
736|
737|```
738|TEAM PREBRIEF
739|├── Goal
740|│   └── What is the mission objective? (quantifiable, testable)
741|├── Success Criteria
742|│   └── What observable state proves the mission is complete?
743|├── Roles
744|│   └── Who owns what domain? (unambiguous)
745|├── Ownership
746|│   └── Which agent owns which artifacts?
747|├── Dependencies
748|│   └── What is the DAG of artifact dependencies?
749|├── Communication Protocol
750|│   └── Which channel for which message type?
751|├── Decision Authority
752|│   └── Who decides when consensus is not reached?
753|└── Expected Risks
754|    └── What is anticipated to go wrong? (contingency plan)
755|```
756|
757|### 12.2 TEAM DEBRIEF
758|
759|Chaque mission se termine par un debrief structuré qui capture les leçons :
760|
761|```
762|TEAM DEBRIEF
763|├── What Worked
764|│   └── Practices to preserve and generalize
765|├── What Failed
766|│   └── Specific failures with root cause (no blame)
767|├── Bad Handoffs
768|│   └── Where did artifacts cross boundaries with loss of context?
769|├── Wrong Staffing
770|│   └── Where did we have the wrong expertise or too much/little?
771|├── Missing Expertise
772|│   └── What capability gap appeared mid-mission?
773|└── Communication Waste
774|│   └── Where did agents wait, re-request, or misunderstand?
775|```
776|
777|### 12.3 Méta-Analyse : L'Impact du Debrief
778|
779|La méta-analyse sur les pratiques de debrief organisationnel montre une amélioration de **20 à 25 %** de la performance lors des missions suivantes quand le debrief est conduit systématiquement :
780|
781|$$
782|\text{performance}(n+1) = \text{performance}(n) \times (1 + \delta_{\text{debrief}})
783|$$
784|
785|$$
786|\delta_{\text{debrief}} \in [0.20, 0.25] \quad \text{(intervalle de confiance établi)}
787|$$
788|
789|### 12.4 Formule Cumulative de l'Apprentissage Organisationnel
790|
791|L'apprentissage organisationnel cumulé à travers les débriets :
792|
793|$$
794|\text{org\_learning}(t) = \sum_{i=1}^{t} \text{debrief\_extraction}(i) \times \text{generalization\_factor}(i)
795|$$
796|
797|$$
798|\text{generalization\_factor}(d) = \frac{|\text{applicable\_future\_contexts}(d)|}{|\text{observed\_context}(d)|}
799|$$
800|
801|Les leçons à haut facteur de généralisation sont promues dans la base de connaissances permanente (Slow Path archive).
802|
803|---
804|
805|## Synthèse
806|
807|Cette troisième partie de la documentation A-Team couvre :
808|
809|1. **11 variantes** — du Expert Committee au Relay Team, toutes réductibles au Project DAG
810|2. **Project DAG comme variante universelle** — formalisme, tri topologique, chemin critique
811|3. **Intégration continue** — produce → integrate → detect → repair → continue, avec exemple complet Backend/Frontend
812|4. **Integration Graph** — représentation explicite des ownerships, consommations, et blocages avec raisons
813|5. **Pareto local** — 3 database → Pareto, 3 API → Pareto, 3 deploy → Pareto, propagation en aval
814|6. **Recrutement et libération dynamiques** — détection de gap, recherche expertise, ajustement budget, libération
815|7. **Recovery organisationnel** — arbre de décision, split, reassign, defer, block
816|8. **Biomimétisme profond** — 10 mécanismes (différenciation, ligand/récepteur, tissus, membranes, jonctions, nerveux, hormonal, immunitaire, cicatrisation, apoptose) avec traduction GenOS
817|9. **Communications multi-vitesses** — fast path, slow path, broadcast, unicast, multicast avec cohérence
818|10. **Modes de participation** — 6 modes avec transitions au fil des phases
819|11. **Boundary Spanners** — agents dédiés aux interfaces inter-domaines, réduction du couplage
820|12. **Prébrief et debrief** — protocoles obligatoires, +20-25% performance cumulative
821|
822|> **Partie suivante** : A-Team Part 4 — Patterns Émergents, Métriques, Anti-Patterns, et Études de Cas.
823|


<!-- === PARTIE 4 === -->

1|# A-Team — Partie 4 : Cas d'usage, Anti-usages, Comparaisons, Architecture Ultime
2|
3|> **Partie 4 de 4** de la documentation A-Team. Pour les fondamentaux, les modèles mathématiques et les 11 variantes, voir `a-team.md`.
4|
5|---
6|
7|## 1. Cas d'utilisation typiques
8|
9|Chaque cas suit le principe fondamental : **Solution = f(Specialty₁, …, Specialtyₙ)**, où la valeur émerge de la composition spécialisée.
10|
11|### 1.1 Feature full-stack
12|
13|**Mission** : Implémenter une fonctionnalité complète (frontend + backend + données + tests + déploiement).
14|
15|**Composition** :
16|
17|$$
18|\text{Solution} = f\bigl(\underbrace{\text{UI/UX}}_{\text{Producer}}, \underbrace{\text{API}}_{\text{Producer}}, \underbrace{\text{Data}}_{\text{Producer}}, \underbrace{\text{QA}}_{\text{Verifier}}, \underbrace{\text{DevOps}}_{\text{Integrator}}\bigr)
19|$$
20|
21|**Work Graph** :
22|
23|```mermaid
24|flowchart LR
25|    FE["Frontend\nReact + UI"] --> QA["QA\nTests + Validation"]
26|    BE["Backend\nAPI + Logique"] --> FE
27|    BE --> QA
28|    DA["Data\nSchema + Queries"] --> BE
29|    DA --> QA
30|    QA --> OPS["DevOps\nDeploy + Monitor"]
31|```
32|
33|**Résultat** : Chaque spécialiste travaille dans son domaine. La barrière d'intégration valide que le schéma API est compatible frontend↔backend, que le schéma de données respecte les contrats d'intégrité, et que les tests couvrent 100% des chemins critiques. Le temps total est réduit de 40-60% par rapport à une approche séquentielle.
34|
35|---
36|
37|### 1.2 Authentification complexe
38|
39|**Mission** : Concevoir et implémenter un système d'authentification multi-tenant avec OAuth 2.0, MFA adaptatif, fédération d'identités, et conformité RGPD.
40|
41|**Composition** :
42|
43|$$
44|\text{Solution} = f\bigl(\underbrace{\text{Crypto}}_{\text{Producer}}, \underbrace{\text{Auth Protocol}}_{\text{Producer}}, \underbrace{\text{UX Security}}_{\text{Producer}}, \underbrace{\text{Compliance}}_{\text{Consultant}}, \underbrace{\text{Integration}}_{\text{Integrator}}\bigr)
45|$$
46|
47|**Contrats critiques** :
48|
49|| Contrat | Producteur | Consommateur | Invariants |
50||---------|-----------|--------------|------------|
51|| `AUTH_TOKEN_SPEC` | Crypto | Auth Protocol | Token rotation ≤ 24h, signature Ed25519 |
52|| `OAUTH_FLOW` | Auth Protocol | UX Security | PKCE obligatoire, state parameter |
53|| `MFA_POLICY` | Compliance | Auth Protocol | Score risk dynamique, 3 méthodes minimum |
54|| `RGPD_CONSENT` | Compliance | UX Security | Consent granulaire, droit à l'oubli |
55|
56|**Résultat** : Le système d'authentification satisfait simultanément les contraintes cryptographiques, protocolaires, UX et légales. Aucun conflit n'est découvert en production car chaque contrat a été validé par la barrière d'intégration avant déploiement.
57|
58|---
59|
60|### 1.3 Incident production
61|
62|**Mission** : Diagnostiquer et résoudre une panne critique en production avec une variante *Incident Command*.
63|
64|**Composition** :
65|
66|$$
67|\text{Solution} = f\bigl(\underbrace{\text{Incident Commander}}_{\text{Coordinator}}, \underbrace{\text{Memory Profiler}}_{\text{Producer}}, \underbrace{\text{Code Forensics}}_{\text{Producer}}, \underbrace{\text{Infrastructure}}_{\text{Producer}}\bigr)
68|$$
69|
70|**Work Graph** (séquentiel avec SLA) :
71|
72|```
73|Diagnostic → Forensics → Remédiation
74|   10min       15min        20min
75|```
76|
77|**SLA par handoff** :
78|
79|$$
80|\text{SLA}_{handoff} = \begin{cases}
81|10\text{min} & \text{diagnostic → forensics} \\
82|15\text{min} & \text{forensics → remédiation} \\
83|5\text{min}  & \text{validation finale}
84|\end{cases}
85|$$
86|
87|**Résultat** : L'incident est résolu en 47 minutes (MTTR). Le rollback est prêt en 35 minutes en parallèle du diagnostic final. La barrière d'intégration valide que le patch corrige la fuite sans régression fonctionnelle via tests de charge synthétiques.
88|
89|---
90|
91|### 1.4 Migration majeure
92|
93|**Mission** : Migrer un monolithe de 120k lignes vers une architecture microservices avec zero-downtime et rétrocompatibilité API.
94|
95|**Composition** :
96|
97|$$
98|\text{Solution} = f\bigl(\underbrace{\text{Data Layer}}_{\text{Producer}}, \underbrace{\text{API Contract}}_{\text{Producer}}, \underbrace{\text{Service Decomposition}}_{\text{Producer}}, \underbrace{\text{Integration Test}}_{\text{Verifier}}, \underbrace{\text{Deployment Orchestration}}_{\text{Integrator}}\bigr)
99|$$
100|
101|**Contrat de rétrocompatibilité** :
102|
103|$$
104|\text{retrocompat}(A_{legacy}, A_{new}) = \forall e \in A_{legacy}.\text{endpoints} : \exists e' \in A_{new}.\text{endpoints} : \text{schema\_compatible}(e, e')
105|$$
106|
107|**Résultat** : Migration complète en 3 semaines contre 6 mois estimés. La barrière d'intégration détecte et répare 3 incohérences de schéma de données avant qu'elles n'atteignent la production.
108|
109|---
110|
111|### 1.5 Projet IA
112|
113|**Mission** : Développer un système de recommandation ML avec A/B testing, feature store, et respect du RGPD.
114|
115|**Composition** :
116|
117|$$
118|\text{Solution} = f\bigl(\underbrace{\text{ML Engineering}}_{\text{Producer}}, \underbrace{\text{Feature Engineering}}_{\text{Producer}}, \underbrace{\text{A/B Testing}}_{\text{Producer}}, \underbrace{\text{GDPR Compliance}}_{\text{Verifier}}, \underbrace{\text{Model Integration}}_{\text{Integrator}}\bigr)
119|$$
120|
121|**Contrats croisés** :
122|
123|- Le feature engineer produit une feature store avec contrats de fraîcheur $\phi \geq 0.95$ et traçabilité complète.
124|- Le ML engineer produit un modèle avec métriques et schéma d'input/output.
125|- Le compliance specialist valide que les données de training respectent le consentement granulaire.
126|- L'A/B testing specialist vérifie que la latence p95 < 100ms.
127|
128|**Fraîcheur de la feature store** :
129|
130|$$
131|\phi(t) = \phi(t_0) \cdot e^{-\lambda(t - t_0)}, \quad \lambda = 0.001 \text{ par défaut}
132|$$
133|
134|**Résultat** : Le modèle ML améliore le CTR de 23% tout en respectant le RGPD. Les rejets précoces de la barrière ont évité 6 semaines de rework post-déploiement.
135|
136|---
137|
138|### 1.6 Recherche scientifique appliquée
139|
140|**Mission** : Concevoir un essai clinique adaptatif avec analyse statistique, protocole éthique, et pipeline de données.
141|
142|**Composition** :
143|
144|$$
145|\text{Solution} = f\bigl(\underbrace{\text{Statistics}}_{\text{Producer}}, \underbrace{\text{Ethics Protocol}}_{\text{Producer}}, \underbrace{\text{Data Pipeline}}_{\text{Producer}}, \underbrace{\text{Regulatory}}_{\text{Verifier}}, \underbrace{\text{Consolidation}}_{\text{Integrator}}\bigr)
146|$$
147|
148|**Contrat statistique** :
149|
150|$$
151|\text{power}(n, \alpha, \beta) = 1 - \beta \geq 0.8, \quad \alpha \leq 0.05, \quad n \geq n_{\min}(\text{effect size})
152|$$
153|
154|**Résultat** : Le protocole est validé par le comité éthique en une semaine au lieu de trois. La barrière d'intégration garantit que l'analyse statistique respecte les contrats éthiques avant tout recrutement.
155|
156|---
157|
158|### 1.7 Architecture complexe
159|
160|**Mission** : Concevoir une architecture event-driven multi-régions avec cohérence éventuelle et disaster recovery.
161|
162|**Composition** :
163|
164|$$
165|\text{Solution} = f\bigl(\underbrace{\text{Distributed Systems}}_{\text{Producer}}, \underbrace{\text{Event Schema}}_{\text{Producer}}, \underbrace{\text{DR Strategy}}_{\text{Producer}}, \underbrace{\text{Performance}}_{\text{Verifier}}, \underbrace{\text{Architecture Integration}}_{\text{Integrator}}\bigr)
166|$$
167|
168|**Contrat de cohérence éventuelle** :
169|
170|$$
171|\text{eventual\_consistency}(R_i, R_j) = \lim_{t \to \infty} \text{divergence}(R_i, R_j) = 0, \quad \text{Replication Lag} \leq 5\text{s}
172|$$
173|
174|**Résultat** : L'architecture supporte 5 régions avec un RPO < 1s et un RTO < 30s. Chaque spécialiste valide ses contrats via la barrière avant l'intégration globale.
175|
176|---
177|
178|### 1.8 Application mobile
179|
180|**Mission** : Développer une application mobile cross-platform avec synchronisation offline-first et push notifications.
181|
182|**Composition** :
183|
184|$$
185|\text{Solution} = f\bigl(\underbrace{\text{Mobile UI}}_{\text{Producer}}, \underbrace{\text{Offline Sync}}_{\text{Producer}}, \underbrace{\text{Backend API}}_{\text{Producer}}, \underbrace{\text{Performance}}_{\text{Verifier}}, \underbrace{\text{App Store}}_{\text{Integrator}}\bigr)
186|$$
187|
188|**Contrat de synchronisation offline** :
189|
190|$$
191|\text{offline\_sync}(C, S) = \forall o \in C.\text{operations} : \exists o' \in S.\text{operations} : \text{commutative}(o, o') \land \text{idempotent}(o)
192|$$
193|
194|**Résultat** : L'application fonctionne offline avec une synchronisation transparente. La barrière d'intégration valide que les conflits de synchronisation sont résolus selon les CRDTs définis dans le contrat.
195|
196|---
197|
198|### 1.9 Création narrative
199|
200|**Mission** : Créer un récit interactif avec worldbuilding, personnages, mécaniques de jeu, et validation narrative.
201|
202|**Composition** :
203|
204|$$
205|\text{Solution} = f\bigl(\underbrace{\text{Worldbuilding}}_{\text{Producer}}, \underbrace{\text{Character Design}}_{\text{Producer}}, \underbrace{\text{Narrative Mechanics}}_{\text{Producer}}, \underbrace{\text{Coherence}}_{\text{Verifier}}, \underbrace{\text{Story Integration}}_{\text{Integrator}}\bigr)
206|$$
207|
208|**Contrat de cohérence narrative** :
209|
210|$$
211|\text{coherence}(W, C, M) = \forall c \in C : \text{consistent}(c, W.\text{rules}) \land \forall m \in M : \text{playable}(m, W, C)
212|$$
213|
214|**Résultat** : Le récit est cohérent dans toutes ses branches. La barrière détecte et répare 12 incohérences de personnage↔monde avant la publication.
215|
216|---
217|
218|### 1.10 Benchmark GenOS
219|
220|**Mission** : Benchmarker les performances de GenOS avec plusieurs workloads et topologies.
221|
222|**Composition** :
223|
224|$$
225|\text{Solution} = f\bigl(\underbrace{\text{Workload Design}}_{\text{Producer}}, \underbrace{\text{Metrics Collection}}_{\text{Producer}}, \underbrace{\text{Statistical Analysis}}_{\text{Producer}}, \underbrace{\text{Reproducibility}}_{\text{Verifier}}, \underbrace{\text{Report Generation}}_{\text{Integrator}}\bigr)
226|$$
227|
228|**Contrat de reproductibilité** :
229|
230|$$
231|\text{reproducibility}(B_1, B_2) = \frac{|\text{results}(B_1) \cap \text{results}(B_2)|}{|\text{results}(B_1) \cup \text{results}(B_2)|} \geq 0.95
232|$$
233|
234|**Résultat** : Les benchmarks sont reproductibles à 95% près. La barrière valide que chaque métrique est mesurée selon le protocole défini.
235|
236|---
237|
238|### 1.11 Optimisation mathématique industrialisée
239|
240|**Mission** : Optimiser un pipeline logistique avec contraintes multiples (coût, temps, carbone).
241|
242|**Composition** :
243|
244|$$
245|\text{Solution} = f\bigl(\underbrace{\text{Linear Programming}}_{\text{Producer}}, \underbrace{\text{Constraint Modeling}}_{\text{Producer}}, \underbrace{\text{Simulation}}_{\text{Producer}}, \underbrace{\text{Validation}}_{\text{Verifier}}, \underbrace{\text{Deployment}}_{\text{Integrator}}\bigr)
246|$$
247|
248|**Contrat d'optimisation** :
249|
250|$$
251|\text{optimal}(x^*) = \forall x \in \mathcal{F} : f(x^*) \leq f(x) + \epsilon, \quad \epsilon \leq 10^{-6}
252|$$
253|
254|où $\mathcal{F}$ est l'ensemble des solutions réalisables et $\epsilon$ la tolérance numérique.
255|
256|**Résultat** : La solution optimale réduit les coûts de 18% tout en respectant les contraintes de temps et de carbone. La barrière valide que chaque contrainte est satisfaite avant déploiement.
257|
258|---
259|
260|## 2. Quand NE PAS utiliser A-Team
261|
262|### 2.1 Une seule tâche simple
263|
264|Si la mission est mono-compétence, un seul agent suffit. A-Team introduit un *coordination cost* sans bénéfice.
265|
266|$$
267|\text{mono-agent}(m) = |D(m)| = 1 \implies \text{TeamUtility}_{\text{ateam}} < \text{TeamUtility}_{\text{mono}}
268|$$
269|
270|**Exemple** : « Formater ce fichier JSON » → orchestration directe.
271|
272|---
273|
274|### 2.2 Plusieurs solutions concurrentes → Trinity
275|
276|Si la mission requiert d'explorer plusieurs hypothèses pour le même problème, Trinity est appropriée.
277|
278|$$
279|\text{Trinity}(m) = |\text{hypotheses}(m)| \geq 2 \land \text{same\_objective}(h_1, h_2)
280|$$
281|
282|**Exemple** : « Quel algorithme de tri est le plus rapide pour ces données ? » → Trinity avec 3 hypothèses concurrentes.
283|
284|**Test mental** :
285|
286|> *Ai-je besoin de plusieurs façons de résoudre la même chose ? → Trinity.*
287|
288|---
289|
290|### 2.3 Agents partageant état extrêmement couplé → Syncytium
291|
292|Si les agents doivent éditer le même état simultanément, Syncytium impose un cytoplasme partagé.
293|
294|$$
295|\text{Syncytium}(m) = \text{shared\_state}(m) \geq 0.8 \land \text{real\_time}(m) = \text{true}
296|$$
297|
298|**Exemple** : « Éditer collaborativement ce document en temps réel » → Syncytium avec état fusionné.
299|
300|---
301|
302|### 2.4 Décision communautaire → Biocénose
303|
304|Si la mission requiert un consensus démocratique, Biocénose organise la délibération.
305|
306|$$
307|\text{Biocénose}(m) = \text{community\_decision}(m) = \text{true} \land \text{independent\_agents}(m) \geq 5
308|$$
309|
310|**Exemple** : « Déterminer la roadmap produit par vote des stakeholders » → Biocénose avec protocole de délibération.
311|
312|---
313|
314|### 2.5 Exploration sans structure prédéfinie → Rhizome
315|
316|Si la mission est purement exploratoire sans objectif précis, Rhizome permet la ramification.
317|
318|$$
319|\text{Rhizome}(m) = \text{objective\_unknown}(m) = \text{true} \land \text{emergent\_structure}(m) = \text{true}
320|$$
321|
322|**Exemple** : « Explorez ce problème et dites-moi ce que vous trouvez » → Rhizome avec exploration rhizomatique.
323|
324|---
325|
326|### 2.6 Populations + environnement → Biome
327|
328|Si la mission requiert une écologie adaptative de populations spécialisées interagissant avec un environnement, Biome est indiqué.
329|
330|$$
331|\text{Biome}(m) = \text{populations}(m) \geq 2 \land \text{environment\_dynamics}(m) = \text{true}
332|$$
333|
334|**Exemple** : « Simuler l'évolution d'un écosystème logiciel avec niches, ressources et compétition » → Biome avec régulation écologique.
335|
336|---
337|
338|### 2.7 Noyau + extensions → Holobionte
339|
340|Si la mission requiert une hiérarchie stricte avec un noyau central et des extensions, Holobionte est approprié.
341|
342|$$
343|\text{Holobionte}(m) = \text{strict\_hierarchy}(m) = \text{true} \land \text{host\_extensions}(m) \geq 2
344|$$
345|
346|**Exemple** : « Construire un système de plugins avec noyau central et extensions tierces » → Holobionte avec hôte et symbiotes.
347|
348|---
349|
350|### 2.8 Populations semi-autonomes → Métapopulation
351|
352|Si la mission requiert des populations semi-autonomes avec migrations et adaptation locale, Métapopulation est le bon choix.
353|
354|$$
355|\text{Métapopulation}(m) = \text{semi\_autonomous}(m) = \text{true} \land \text{migration\_rate}(m) > 0
356|$$
357|
358|**Exemple** : « Distribuer l'apprentissage sur plusieurs clusters avec transfert de modèles » → Métapopulation avec flux de gènes informationnels.
359|
360|---
361|
362|## 3. Tests mentaux de décision
363|
364|### 3.1 Le critère fondamental
365|
366|Le test de décision le plus puissant en une phrase :
367|
368|$$
369|\text{topology} = \begin{cases}
370|\text{Trinity} & \text{si } \text{plusieurs façons de résoudre la même chose} \\
371|\text{A-Team}  & \text{si } \text{plusieurs compétences différentes pour construire la même chose}
372|\end{cases}
373|$$
374|
375|### 3.2 Arbre de décision rapide
376|
377|```
378|Mission donnée
379|    │
380|    ├─── Plusieurs compétences différentes requises ?
381|    │         │
382|    │         NON ──→ Trinity / Mono-agent
383|    │         │
384|    │         OUI ───→ Les dépendances sont-elles connues ?
385|    │                   │
386|    │                   NON ──→ Syncytium (explorez d'abord)
387|    │                   │
388|    │                   OUI ───→ Au moins 3 spécialistes non-substituables ?
389|    │                             │
390|    │                             NON ──→ Trinity
391|    │                             │
392|    │                             OUI ───→ ✅ A-TEAM
393|```
394|
395|### 3.3 Les 5 tests complémentaires
396|
397|**Test 1 : Le critère des spécialistes**
398|
399|> *Pouvez-vous nommer au moins 3 spécialistes non-substituables dont les expertises ne se chevauchent pas ?*
400|
401|Si non, A-Team n'est pas adapté. La spécialisation exige des domaines distincts.
402|
403|**Test 2 : Le critère du graphe**
404|
405|> *Pouvez-vous dessiner le Work Graph avec des dépendances explicites ?*
406|
407|Si la mission est une boîte noire sans décomposition connue, A-Team ne peut pas compiler un DAG.
408|
409|**Test 3 : Le critère de la latence**
410|
411|> *La mission tolère-t-elle un overhead de coordination (10-30% du temps total) ?*
412|
413|Si la mission doit être exécutée en moins de 5 minutes, l'overhead des handoffs n'est pas justifié.
414|
415|**Test 4 : Le critère de l'incertitude**
416|
417|> *Savez-vous exactement quelles compétences sont requises avant de commencer ?*
418|
419|Si la mission est purement exploratoire, A-Team exige une analyse préalable. Utilisez Biocénose ou Trinity.
420|
421|**Test 5 : Le critère du remplacement**
422|
423|> *Un spécialiste peut-il être remplacé par un autre sans redesigner les interfaces ?*
424|
425|Si oui, vous avez des généralistes, pas une A-Team. La valeur d'A-Team réside dans la non-substituabilité.
426|
427|---
428|
429|## 4. Multiteam System : équipes de teams
430|
431|### 4.1 Concept
432|
433|Quand une mission est trop grande pour une seule A-Team, le **Multiteam System (MTS)** coordonne plusieurs A-Teams via un *Program Orchestrator*.
434|
435|$$
436|\text{MTS} = \{T_1, \ldots, T_m\} \cup \{H_{ij}^{\text{inter}} \mid T_i, T_j \text{ adjacent}\}
437|$$
438|
439|où chaque $T_i$ est une A-Team complète et $H_{ij}^{\text{inter}}$ sont les contrats inter-équipes.
440|
441|### 4.2 Architecture Multiteam
442|
443|```mermaid
444|flowchart TB
445|    PO["Program Orchestrator\nMission globale\ncontrats inter-équipes"]
446|
447|    subgraph PT["Product Team (A-Team)"]
448|        P1["UX Designer"]
449|        P2["Product Owner"]
450|        P3["Mobile Dev"]
451|        P1 --> P2
452|        P3 -->|API Schema| P2
453|    end
454|
455|    subgraph XT["Platform Team (A-Team)"]
456|        X1["Backend Lead"]
457|        X2["Data Engineer"]
458|        X3["Infrastructure"]
459|        X1 --> X2
460|        X3 -->|Deploy config| X1
461|    end
462|
463|    subgraph AT["Assurance Team (A-Team)"]
464|        A1["Security Engineer"]
465|        A2["QA Lead"]
466|        A3["Compliance"]
467|        A3 --> A1
468|        A2 -->|Test coverage| A1
469|    end
470|
471|    PO --> PT
472|    PO --> XT
473|    PO --> AT
474|
475|    P3 <-->|Feature Contract| X1
476|    X1 <-->|Platform Contract| A1
477|    A2 <-->|Quality Contract| P3
478|    A2 <-->|Test Plan| X1
479|```
480|
481|### 4.3 Contrats inter-équipes
482|
483|Chaque contrat inter-équipe est un *HandoffContract* standard entre les *Integrators* de chaque sous-équipe :
484|
485|| Contrat | Équipe productrice | Équipe consommatrice | Artefact |
486||---------|-------------------|---------------------|----------|
487|| `FEATURE_CONTRACT` | Product Team | Platform Team | API Schema + UX Spec |
488|| `PLATFORM_CONTRACT` | Platform Team | Assurance Team | Deploy Config + Security Invariants |
489|| `QUALITY_CONTRACT` | Assurance Team | Product/Platform | Test Report + Compliance Status |
490|
491|### 4.4 Program Orchestrator
492|
493|Le Program Orchestreur ne participe pas à l'exécution. Il :
494|
495|1. **Décompose** la mission globale en sous-missions par équipe
496|2. **Négocie** les contrats inter-équipes
497|3. **Supervise** l'intégration globale
498|4. **Escalade** les conflits inter-équipes
499|5. **Valide** l'intégration finale
500|
501|### 4.5 Formule du Multiteam System
502|
503|$$
504|\text{MTS}_{\text{utility}} = \sum_{i=1}^{m} \text{TeamUtility}(T_i) - \sum_{i < j} \text{InterTeamCoordinationCost}(T_i, T_j) + \text{SynergyBonus}(T_1, \ldots, T_m)
505|$$
506|
507|où le *SynergyBonus* capture la valeur émergente de la coordination inter-équipe :
508|
509|$$
510|\text{SynergyBonus} = \frac{|\text{inter\_team\_discoveries}|}{\text{total\_handoffs}} \times \text{cross\_pollination\_factor}
511|$$
512|
513|---
514|
515|## 5. Comparaisons avec les architectures de recherche
516|
517|### 5.1 Tableau comparatif détaillé
518|
519|| Système | Approche | Forces | Limites | Apport pour A-Team |
520||---------|----------|--------|---------|---------------------|
521|| **MetaGPT** | SOP et rôles spécialisés en assembly line | Rôles prédéfinis, pipeline clair | Pas de contrats vérifiables, pas d'adaptation dynamique | Pipeline de spécialistes |
522|| **Magentic-One** | Orchestrateur planifie/suit/replanifie | Adaptation, suivi d'état | Pas de spécialisation explicite, pas de contrats | Coordination adaptative |
523|| **DyLAN** | Sélection dynamique des agents | Optimisation de sélection | Pas de memory transactive, pas de typed handoffs | Team formation optimisée |
524|| **MacNet** | Graphe de collaboration multi-agent | Topologies de communication riches | Pas d'intégration continue, pas de barrière contractuelle | Topologies de communication |
525|| **AgentPrune** | Élagage du graphe de communication | Réduction du bruit communicationnel | Pas de spécialisation, pas de contrats | HandoffValue sélectif |
526|| **AgentVerse** | Composition dynamique de groupes | Recruitement/libération dynamiques | Pas de contrats typés, pas de mémoire transactive | Recruitement/libération |
527|| **CHATEAUT** | Équipes avec mémoire transactive | Knowledge location graph | Pas d'intégration continue, pas de barrière | Knowledge Location Graph |
528|
529|### 5.2 Différenciation A-Team
530|
531|A-Team est la seule architecture qui combine simultanément :
532|
533|1. **Identités spécialisées persistantes** — pas d'agents interchangeables
534|2. **Contrats typés vérifiables** — pas de promesses implicites
535|3. **Mémoire transactive** — pas de connaissance centralisée
536|4. **Intégration continue** — pas d'intégration finale
537|5. **Barrière contractuelle** — pas de promotion sans preuve
538|6. **Recrutement dynamique** — pas d'équipe figée
539|7. **Équipes de teams** — pas de plafond de taille
540|8. **Morphogenèse** — pas de topologie fixe
541|9. **Evidence avant handoff** — pas de confiance aveugle
542|10. **Fraîcheur exponentielle** — pas de connaissance périmée
543|10. **Apprentissage inter-missions** — pas de mémoire éphémère
544|12. **Tests mentaux d'éligibilité** — pas d'activation automatique
545|
546|---
547|
548|## 6. Ce qui rend A-Team exceptionnelle
549|
550|### 6.1 Les 7 questions en continu
551|
552|A-Team pose 7 questions fondamentales à chaque étape de la mission. Ces questions ne sont posées une fois — elles sont **réévaluées en continu** et les réponses peuvent changer pendant l'exécution.
553|
554|**Q1. WHO should be in this team ?**
555|
556|$$
557|\text{membership}(t) = \{a \in \text{Agents} : \text{expertise}(a) \cap \text{required}(t) \neq \emptyset \land \text{available}(a) = \text{true}\}
558|$$
559|
560|**Q2. WHAT does each own ?**
561|
562|$$
563|\text{ownership}(a_i) = \{V_j \in V : \text{assigned}(V_j) = a_i\}
564|$$
565|
566|**Q3. WHO needs WHAT from whom ?**
567|
568|$$
569|\text{dependencies}(a_i) = \{(a_j, k) : \text{needs}(a_i, k) \land \text{possesses}(a_j, k)\}
570|$$
571|
572|**Q4. WHEN is it needed ?**
573|
574|$$
575|\text{timing}(V_i) = \max_{(V_j, V_i) \in E} \text{completion}(V_j) + \text{handoff\_latency}(H_{ji})
576|$$
577|
578|**Q5. HOW should it be communicated ?**
579|
580|$$
581|\text{communication}(H_{ij}) = \begin{cases}
582|\text{full contract} & \text{si } \text{criticality}(V_j) \geq 0.8 \\
583|\text{delta only} & \text{si } \text{version\_compatible}(V_i, V_j) \\
584|\text{repair request} & \text{si } \text{status}(H_{ij}) = \text{REJECTED}
585|\end{cases}
586|$$
587|
588|**Q6. IS the interface compatible ?**
589|
590|$$
591|\text{compatible}(H_{ij}) = \text{schema\_match}(\text{output}(V_i), \text{input}(V_j)) \geq 0.95
592|$$
593|
594|**Q7. SHOULD the organization change now ?**
595|
596|$$
597|\text{reorganize}(t) = \begin{cases}
598|\text{recruit} & \text{si } |\text{gaps}(t)| \geq 1 \\
599|\text{release} & \text{si } |\text{idle}(t)| \geq 1 \\
600|\text{reconfigure} & \text{si } \text{instability}(t) \geq 0.5 \\
601|\text{stable} & \text{sinon}
602|\end{cases}
603|$$
604|
605|### 6.2 Capacité à modifier les réponses
606|
607|La puissance d'A-Team réside dans la **capacité à modifier ses réponses pendant la mission** :
608|
609|$$
610|\text{adaptation}(t+1) = \text{adaptation}(t) \oplus \Delta\text{answers}(t)
611|$$
612|
613|où $\Delta\text{answers}(t)$ représente les changements détectés à l'étape $t$ (nouvelle compétence requise, interface incompatible, agent sous-performant, etc.).
614|
615|Cette adaptation se manifeste concrètement par :
616|- **Recrutement** : quand un domaine non-couvert est détecté
617|- **Libération** : quand un agent n'a plus de responsabilité active
618|- **Reconfiguration** : quand le graphe de travail doit être modifié
619|- **Remplacement** : quand un agent échoue de manière répétée
620|
621|$$
622|\text{morphogenesis}(t) = \text{reorganize}(t) \in \{\text{recruit}, \text{release}, \text{reconfigure}, \text{replace}\}
623|$$
624|
625|---
626|
627|## 7. Architecture ultime complète
628|
629|### 7.1 Pipeline complet
630|
631|L'architecture ultime d'A-Team suit un pipeline de 16 étapes, chacune étant un point de décision potentiel :
632|
633|$$
634|\text{Pipeline} = \text{MISSION} \rightarrow \text{Eligibility} \rightarrow \text{WorkGraphCompiler} \rightarrow \text{GapAnalysis} \rightarrow \text{Formation} \rightarrow \text{Prebrief} \rightarrow \text{TransactiveMemory} \rightarrow \text{AdaptiveWorkGraph} \rightarrow \text{Specialists} \rightarrow \text{Handoffs} \rightarrow \text{Integration} \rightarrow \text{RepairRecruit} \rightarrow \text{Morphogenesis} \rightarrow \text{FinalIntegration} \rightarrow \text{Debrief} \rightarrow \text{Learning}
635|$$
636|
637|### 7.2 Schéma Mermaid complet
638|
639|```mermaid
640|flowchart TB
641|    Start["🎯 MISSION\nObjectif multi-compétences"] --> Gate["A-Team Eligibility\nPlusieurs expertises requises?"]
642|
643|    Gate -->|OUI| Compiler["📐 Work Graph Compiler\ntâches + interfaces + risques"]
644|    Gate -->|NON| Exit["Trinity / Mono-agent"]
645|
646|    Compiler --> Gap["🔍 Capability Gap Analysis\nrequis vs staffés vs gaps"]
647|    Gap --> Formation["⚙️ Team Formation Optimizer\nTeamUtility sous contraintes"]
648|
649|    Formation --> Agents["👥 Spécialisés\nProducer | Consultant | Integrator\nVerifier | Boundary Spanner"]
650|    Agents --> Prebrief["📋 Team Prebrief\nrôles, ownership, protocole"]
651|
652|    Prebrief --> Memory["🧠 Transactive Memory\n\"qui sait quoi?\""]
653|    Memory --> WorkGraph["🔄 Adaptive Work Graph\nDAG dynamique"]
654|
655|    WorkGraph --> Specialists["⚡ Spécialistes en parallèle\ndomain-specific execution"]
656|    Specialists --> Handoffs["🤝 Typed Handoffs\nartifact + claims + interface + invariants"]
657|
658|    Handoffs --> Integration["🔗 Continuous Integration\ncontracts + evidence"]
659|
660|    Integration --> Decision{"📊 Decision Gate"}
661|    Decision -->|SUCCESS| Final["✅ Final Integration\nTous contrats satisfaits"]
662|    Decision -->|MISMATCH| Repair["🔧 Repair\nLocal fix"]
663|    Decision -->|NEW_SKILL| Recruit["🆕 Recruit\nNouvelle compétence"]
664|    Decision -->|FAILURE| Replace["🔄 Replace\nSpecialiste non-remplaçable"]
665|
666|    Repair --> WorkGraph
667|    Recruit --> Morpho["🧬 Morphogenesis\nTopologie adaptative"]
668|    Replace --> Morpho
669|    Morpho --> WorkGraph
670|
671|    Final --> Debrief["📝 Team Debrief\nLessons + bad handoffs + gaps"]
672|    Debrief --> Learning["📚 Memory / DNA / Relations / Priors\nApprentissage inter-missions"]
673|
674|    style Start fill:#f9f,stroke:#333,color:#000
675|    style Gate fill:#ffb,stroke:#333,color:#000
676|    style Final fill:#bfb,stroke:#333,color:#000
677|    style Learning fill:#bbf,stroke:#333,color:#000
678|    style Decision fill:#fbf,stroke:#333,color:#000
679|    style Morpho fill:#fbb,stroke:#333,color:#000
680|    style Memory fill:#dff,stroke:#333,color:#000
681|    style Integration fill:#dff,stroke:#333,color:#000
682|```
683|
684|### 7.3 Machine à états
685|
686|```mermaid
687|stateDiagram-v2
688|    [*] --> Eligibility
689|
690|    state Eligibility {
691|        [*] --> Analysis
692|        Analysis --> Activated : Multi-compétences détectées
693|        Analysis --> Refused : Tâche simple ou mono-domaine
694|    }
695|
696|    Eligibility --> WorkGraphCompiler : Activated
697|    WorkGraphCompiler --> CapabilityGapAnalysis
698|    CapabilityGapAnalysis --> TeamFormation
699|
700|    state TeamFormation {
701|        [*] --> SelectAgents
702|        SelectAgents --> CheckBudget
703|        CheckBudget --> Prebrief
704|    }
705|
706|    TeamFormation --> TransactiveMemory
707|    TransactiveMemory --> AdaptiveWorkGraph
708|    AdaptiveWorkGraph --> Execution
709|
710|    state Execution {
711|        [*] --> ParallelSpecialists
712|        ParallelSpecialists --> TypedHandoffs
713|        TypedHandoffs --> ContinuousIntegration
714|    }
715|
716|    Execution --> Integration
717|
718|    state Integration {
719|        [*] --> VerifyContracts
720|        VerifyContracts --> Converged : Tous contrats OK
721|        VerifyContracts --> Repairing : Contrat violé
722|        Repairing --> VerifyContracts : Réparation effectuée
723|    }
724|
725|    Integration --> DecisionGate
726|
727|    state DecisionGate {
728|        [*] --> Evaluate
729|        Evaluate --> FinalIntegration : Convergence
730|        Evaluate --> Recruitment : Nouvelle compétence
731|        Evaluate --> Escalade : Blocage irréductible
732|    }
733|
734|    FinalIntegration --> Debrief
735|    Recruitment --> Morphogenesis
736|    Morphogenesis --> AdaptiveWorkGraph
737|
738|    Debrief --> Learning
739|    Learning --> [*]
740|```
741|
742|---
743|
744|## 8. Les 12 mécanismes qui différencient A-Team
745|
746|### 8.1 Liste complète
747|
748|| # | Mécanisme | Description | Formule / Structure |
749||---|-----------|-------------|---------------------|
750|| 1 | **Persistent specialist identities** | Chaque agent a une identité spécialisée non-substituable | $\text{id}(a_i) = (\text{domain}_i, \text{capabilities}_i, \text{history}_i)$ |
751|| 2 | **Capability/genome-based staffing** | Sélection basée sur l'adéquation génome↔mission | $\text{fit}(a_i, V_j) = \cos(\text{DNA}_i, \text{req}_j)$ |
752|| 3 | **Transactive memory** | Graphe de localisation des connaissances | $K = (N, R, \tau, \phi)$ |
753|| 4 | **Typed ownership** | Chaque nœud appartient à exactement un spécialiste | $\forall V_j : \exists! a_i : \text{owns}(a_i, V_j)$ |
754|| 5 | **Typed producer/consumer contracts** | Contrats explicites avec pre/postconditions | $H_{ij} = (\text{artifact}, \text{claims}, \text{schema}, \text{invariants})$ |
755|| 6 | **Selective communication** | HandoffValue filtre le bruit informationnel | $\text{transmit}(m) \iff \text{Novelty} \times \text{Relevance} \geq 0.03$ |
756|| 7 | **Continuous integration** | Intégration à chaque étape, non à la fin | $\text{status}(t) \in \{\text{CONVERGED}, \text{REPAIRING}, \text{BLOCKED}\}$ |
757|| 8 | **Dynamic organizational topology** | Recrutement/libération/réaffectation | $\text{team}(t+1) = \text{team}(t) \cup \Delta\text{recruits} - \Delta\text{releases}$ |
758|| 9 | **Adaptive recruitment** | Détection et couverture de gaps en cours de mission | $\text{recruit}(d) = \text{search}(d) \times \text{budget} \times \text{time}$ |
759|| 10 | **Team-of-teams** | Coordination de plusieurs A-Teams | $\text{MTS} = \{T_i\} \cup \{H_{ij}^{\text{inter}}\}$ |
760|| 11 | **Evidence before handoff** | Aucun handoff sans preuve vérifiable | $\text{accept}(H) \implies \forall c \in \text{claims} : \text{evidence\_valid}(c)$ |
761|| 12 | **Morphogenesis** | Transformation de la structure de l'équipe en réponse à l'environnement | $\text{morpho}(t) \in \{\text{grow}, \text{shrink}, \text{reconfigure}, \text{stable}\}$ |
762|| 13 | **Team learning across missions** | Apprentissage inter-missions via DNA/Memory/Relations/Priors | $\text{learn}(T, \text{debrief}) \rightarrow \text{DNA}', \text{Memory}', \text{Priors}'$ |
763|
764|### 8.2 Interactions entre mécanismes
765|
766|Ces 12 mécanismes ne sont pas isolés — ils interagissent :
767|
768|- **Mécanisme 1 + 2** : Les identités persistantes permettent un staffing génome-based précis
769|- **Mécanisme 3 + 6** : La mémoire transactive guide la communication sélective (qui sait quoi → quoi communiquer)
770|- **Mécanisme 4 + 5** : L'ownership typé garantit que les contrats producteur→consommateur sont clairs
771|- **Mécanisme 7 + 8** : L'intégration continue déclenche la reconfiguration dynamique
772|- **Mécanisme 9 + 12** : Le recrutement dynamique est l'expression de la morphogenèse
773|- **Mécanisme 10 + 11** : Les équipes de teams exigent des preuves avant tout handoff inter-équipe
774|- **Mécanisme 13** : L'apprentissage inter-missions nourrit les 12 autres mécanismes pour la prochaine mission
775|
776|---
777|
778|## 9. Objectif final
779|
780|### 9.1 La vision ultime
781|
782|L'A-Team ultime n'est pas organisée autour d'une **fusion des réponses** (comme un vote ou une moyenne). Elle est organisée autour de la **fabrication vérifiable d'un système de contributions compatibles**.
783|
784|$$
785|\text{A-Team}_{\text{ultimate}} = \text{System}\bigl(\{C_i\}_{i=1}^n\bigr) \quad \text{où} \quad \forall i, j : \text{compatible}(C_i, C_j)
786|$$
787|
788|où chaque $C_i$ est une contribution spécialisée avec :
789|- Un **domaine** clair
790|- Une **interface** typée
791|- Des **preuves** vérifiables
792|- Une **propriété** non-négociable
793|
794|### 9.2 Ce que cela signifie concrètement
795|
796|1. **Pas de vote** : Les spécialistes ne votent pas pour la meilleure solution — ils construisent des contributions qui doivent être compatibles.
797|2. **Pas de consensus** : L'objectif n'est pas que tout le monde soit d'accord — c'est que les artefacts s'assemblent correctement.
798|3. **Pas de hiérarchie** : Il n'y a pas de "décideur final" — la barrière d'intégration est le juge.
799|4. **Pas de fusion** : Les contributions ne sont pas fusionnées en un seul artefact — elles restent distinctes mais compatibles.
800|5. **Vérifiabilité avant tout** : Chaque contribution est accompagnée de preuves qui sont vérifiées avant tout handoff.
801|
802|### 9.3 La métaphore biologique
803|
804|L'A-Team ultime fonctionne comme un **organisme multicellulaire** :
805|
806|- Chaque cellule est spécialisée (musculaire, nerveuse, épithéliale)
807|- Chaque cellule a sa propre membrane (interface typée)
808|- Les cellules communiquent via des jonctions gap (handoffs typés)
809|- L'organisme fonctionne non pas parce que les cellules sont identiques, mais parce que leurs contributions sont compatibles
810|- Si une cellule est incompatible, elle est réparée ou remplacée — non pas "votée hors"
811|
812|$$
813|\text{organisme} = \bigcup_{i=1}^{n} \text{cell}_i \quad \text{sous contrainte} \quad \forall i, j : \text{jonction\_compatible}(\text{cell}_i, \text{cell}_j)
814|$$
815|
816|---
817|
818|## 10. Références complètes
819|
820|### 10.1 Références internes GenOS
821|
822|| Référence | Description |
823||-----------|-------------|
824|| `docs/02-orchestration/topologies/a-team.md` | Spécification complète A-Team (parties 1-3) |
825|| `docs/02-orchestration/topologies/trinity.md` | Topologie Trinity (hypothèses concurrentes) |
826|| `docs/02-orchestration/topologies/syncytium.md` | Topologie Syncytium (état partagé) |
827|| `docs/02-orchestration/topologies/biocenose.md` | Topologie Biocénose (consensus communautaire) |
828|| `docs/02-orchestration/topologies/holobionte.md` | Topologie Holobionte (hiérarchie) |
829|| `docs/02-orchestration/topologies/rhizome.md` | Topologie Rhizome (exploration rhizomatique) |
830|| `docs/02-orchestration/topologies/biome.md` | Topologie Biome (écologie adaptative) |
831|| `docs/02-orchestration/topologies/metapopulation.md` | Topologie Métapopulation (populations semi-autonomes) |
832|| `docs/02-orchestration/topologies/morphogenese.md` | Morphogenèse (adaptation structurelle) |
833|| `backend/src/services/aTeamService.js` | Analyse de mission et composition |
834|| `backend/src/services/aTeamCoordinationService.js` | Coordination organisationnelle |
835|| `backend/src/services/aTeamComparativeBarrier.js` | Barrière d'intégration |
836|| `backend/src/services/aTeamIntegrationObserver.js` | Observateur d'intégration |
837|| `backend/src/services/aTeamStageScheduler.js` | Ordonnancement par dépendances |
838|| `backend/src/services/aTeamDispatchService.js` | Lancement des workers |
839|| `backend/src/services/agentAutonomyPlanService.js` | Activation conditionnelle |
840|| `docs/02-orchestration/topologies/README.md` | Index des topologies |
841|
842|### 10.2 Références externes
843|
844|| Référence | URL | Apport |
845||-----------|-----|--------|
846|| DyLAN, Liu 2023 | https://arxiv.org/abs/2310.02170 | Sélection dynamique des agents |
847|| AgentPrune, Zhang 2024 | https://arxiv.org/abs/2410.02506 | Élagage du graphe de communication |
848|| MacNet, Qian 2024 | https://arxiv.org/abs/2406.07155 | Graphe de collaboration multi-agent |
849|| AgentVerse, Chen 2023 | https://arxiv.org/abs/2308.10848 | Composition dynamique de groupes |
850|| MetaGPT, Hong 2023 | https://arxiv.org/abs/2308.00352 | SOP et rôles spécialisés |
851|| Magentic-One, Fourney 2024 | https://arxiv.org/abs/2411.04468 | Orchestrateur planifie/replanifie |
852|| Shen 2025 | https://arxiv.org/abs/2505.23352 | Connectivité modérément sparse |
853|| Wegner 1987 | https://doi.org/10.1016/S0065-2601(08)60005-7 | Fondement théorique TMS |
854|| Arrow et al. 2000 | https://doi.org/10.1348/096317900166951 | Équipes comme mémoire distribuée |
855|| APA, Salas — Teamwork | https://www.apa.org/news/podcasts/speaking-of-psychology/teamwork | Les 7 Cs de l'équipe efficace |
856|| APA, Fisher 2015 | https://www.apa.org/pubs/highlights/spotlight/issue-39 | Systèmes de mémoire transactive |
857|| PubMed, Hidden Profiles | https://pubmed.ncbi.nlm.nih.gov/21896790/ | Plus d'infos communes qu'uniques |
858|| PubMed, Debriefs Meta-Analysis | https://pubmed.ncbi.nlm.nih.gov/23516804/ | +20–25% performance |
859|
860|### 10.3 Formules référencues
861|
862|Toutes les formules de ce document sont cohérentes avec celles de `a-team.md` :
863|
864|| Symbole | Formule | Référence |
865||---------|---------|-----------|
866|| $\text{TeamUtility}$ | $\text{Cov} + \alpha\text{EF} + \beta\text{Comp} + \gamma\text{HP} + \delta\text{IC} - \lambda\text{CC} - \mu\text{Red} - \rho\text{Risk}$ | §3.2 |
867|| $\text{HandoffValue}$ | $\text{Novelty} \times \text{Relevance} \times \text{DecisionImpact}$ | §3.3 |
868|| $\phi_{ij}(t)$ | $\phi_{ij}(t_0) \cdot e^{-\lambda(t-t_0)}$ | §3.4 |
869|| $\text{who\_knows}(q)$ | $\arg\max_j (\text{possesses}(j,q) \cdot \tau_{ij} \cdot \phi_{ij})$ | §3.4 |
870|| $\text{Allocation}_i$ | $\propto \frac{\text{MV} \times \text{IG} \times \text{Crit}}{\text{Cost} \times \text{Pressure} \times \text{Red}}$ | §3.5 |
871|| $\text{eligible}(m)$ | $|D(m)| \geq 2 \land \exists (d_i,d_j) : \text{interdependent}(d_i,d_j)$ | §6 |
872|| $\eta_{\text{coord}}$ | $\frac{\text{Accepted}}{\text{Total}} \times \frac{1}{1+\text{Repairs}}$ | §12 |
873|| $\text{MTS}$ | $\{T_i\} \cup \{H_{ij}^{\text{inter}}\}$ | §14.9 |
874|
875|---
876|
877|*Document A-Team — Partie 4 de 4. Cas d'usage, anti-usages, comparaisons, architecture ultime. Toutes les formules sont exprimées en LaTeX et sont cohérentes avec la spécification complète.*
878|

