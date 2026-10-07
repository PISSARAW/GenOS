# ADR 0349 — Manifeste expérimental GVX et provenance P1

**Statut** : Accepté
**Date** : 2026-10-07
**Domaine** : Expérimentation, contrats et provenance
**Décideurs** : Mainteneurs du socle GenOS
**Lié à** : L01 du programme P1, ADR 0348 et journal de développement GVX

## Contexte

P0 a qualifié les consommateurs et trois pilotes exploratoires. Le protocole
GVX conserve déjà des plans, bras, budgets, contrôles et résultats dans son
journal append-only. Il ne relie pas encore ces plans à un manifeste commun
mission/claim/hypothèse/intervention. Trinity et le ledger scientifique possèdent
leurs propres contrats ; créer une nouvelle base scientifique les dupliquerait.

## Décision

Ajouter `genos.gvx.experiment-manifest/v1`, validé par un schéma JSON strict et
les relations référentielles. Le manifeste est inclus dans l'événement existant
`experiment_started` d'un plan GVX de version 2, avant exécution des bras par
`gvxExperimentalNursery`. Le journal existant assure sa persistance ; aucune
table ni réécriture des anciens événements n'est ajoutée.

Le manifeste relie le scope organisation/projet/entité, la mission et son
contrat, le run, les claims, les hypothèses, les interventions de chaque bras,
les versions déclarées, le lignage, l'unité de coût, le budget, les références
d'artefacts et de reçus. Les hashes désignent des contenus ; leur déclaration
ne prouve ni leur disponibilité ni leur vérité. Les contrôles et versions
demeurent déclarés, sans être présentés comme des observations runtime.

L'encodage canonique `genos-json/v1` réutilise les primitives de provenance
Trinity. Le manifeste possède son SHA-256 ; le hash du plan, la liaison au
scope et les relations sont revérifiés à la relecture. Les états `rejected`
et `retracted` des claims sont conservés. Aucun état `verified` ou `supported`
n'est accepté dans les déclarations initiales.

Une clôture doit présenter exactement le plan enregistré. Un plan remplacé,
un manifeste altéré, une rétrogradation v2 vers v1, un candidat différent ou
un scope étranger sont refusés. `experiment_finished` lie ses résultats et
son assessment au hash du manifeste. Une réussite de transport sans preuve
reste bloquée ; une preuve d'intégrité seule ne devient pas une promotion.

Les plans v1 restent lisibles avec le statut `legacy_unlinked` et aucun
manifeste inventé. Leur format de persistance reste identique. Pour les deux
versions, une nouvelle écriture de clôture exige désormais un plan enregistré.
Les versions inconnues et les déclarations v2 sans provenance sont refusées.

## Conséquences

### Positives

- Première extension L01 intégrée dans le vrai chemin GVX existant.
- Relations durables relues dans un processus distinct ; rejets, rétractations
  et artefacts restent rattachés à leur expérience.
- Compatibilité v1 explicite, sans transformer l'absence de liaison en preuve.
- Le contrôle de clôture empêche de substituer un autre plan après admission.

### Limites

Le SHA-256 et la chaîne du journal détectent des altérations, mais n'authentifient
pas seuls l'origine contre un acteur pouvant tout réécrire. Le HMAC du journal
est vérifiable lorsque sa clé est configurée et conservée hors du candidat.
Les liens de parents et de reçus sont déclaratifs : leur résolution et leur
vérification indépendante relèvent des intégrations suivantes L01/L03/L04.

Les coûts du manifeste sont des budgets déclarés. Les coûts retournés par les
adaptateurs restent dans l'événement de résultat ; aucune mesure de CPU, temps
ou tokens supplémentaire n'est déduite de ce manifeste. La reprise testée
réutilise les bras committés ; elle ne garantit pas exactement une fois pour
les effets externes d'un bras interrompu. Les premiers tests sont des fixtures
de contrat et d'intégrité, pas une campagne IA ni une supériorité scientifique.

L01 et P1 restent partiels : le chemin de mission général, le cycle des claims,
les postconditions métier, l'autorité, le replay causal et le harnais complet
doivent encore être raccordés et qualifiés.

## Alternatives

Créer un second ledger expérimental a été rejeté : il dupliquerait les
événements et les scopes. Renommer les contrats Trinity en contrat général
sans adaptation a été rejeté : leurs invariants ne sont pas interchangeables.
Assimiler les qualifications P0 à l'achèvement de P1 a été rejeté : elles ne
ferment pas les fonctionnalités de recherche proposées.
