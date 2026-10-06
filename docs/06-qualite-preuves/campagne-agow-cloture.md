# Campagne AGOW de clôture opérationnelle

- **Statut** : protocole exécutable ; résultats descriptifs locaux.
- **Portée** : simulateur d'actionneur linéaire endommagé et diffusion locale AGOW.
- **Date** : 2026-10-06.
- **Contrats** : [runtime AGOW](../03-reference/runtime-agow.md).

## 1. Protocole

Commande :

```powershell
node benchmarks/agow/run-completion-campaign.cjs
```

Le runner écrit sous `.genos-agent-worlds/agow-completion-campaign-v3/` :
`manifest.json` avant l'exécution, `report.json` après, et les reçus dans
`receipts.sqlite`. Aucun de ces artefacts générés n'est committé.

Trois seeds fixes G/H/I produisent chacun 16 cas disjoints de 24 pas. Les
stratégies partent de la même calibration mesurée (gain = 1). Au pas 8, le gain
de l'actionneur change vers une valeur cachée entre 0,35 et 0,75. Chaque exécution possède un namespace SQLite neuf pour ses agents. Les stratégies
reçoivent les objectifs puis les conséquences observées de leurs commandes ;
le gain futur appartient à l'oracle du simulateur et n'est pas un input de
stratégie. Aucune donnée métier externe ne participe au banc.

La métrique primaire est l'erreur absolue moyenne de contrôle sur les 24 pas.
Le seuil descriptif de réussite par cas, fixé avant le run, est ≤ 0,12.
Les manifestes contiennent les seeds, les hash des corpus, le protocole, les
sources des adaptateurs et noyaux utilisés, Node, plateforme, lockfile et HEAD.
La comparaison est appariée par cas et l'ordre des conditions est déterministe
mais mélangé. Aucun test de significativité ou de puissance n'est revendiqué.

## 2. Conditions réellement exécutées

| Condition | Mécanisme |
| --- | --- |
| `mbh_style` | estimation rapide/lente du gain et correction allostatique intégrale |
| `lipson_style` | auto-modèle du gain, prédiction des conséquences et correction après dommage |
| `genos_timescales` | noyau `predictiveTimescaleService.updateLevel`, T0 et T3 |
| `self_twin_timescales` | noyaux T0/T3 et `selfTwinService.compare`, pondération selon la divergence |
| `self_twin_controlled_links` | `selfTwinEdgeLearningService.updateEdge`, interventions et contrôles isolés du simulateur |
| `precision_learning_ablated` | mêmes niveaux T0/T3, précision fixée à 1 |

Les contrôles des liens alternent l'ordre des commandes 0 et 0,5 selon une
allocation seedée. Le simulateur est une fonction sans état partagé : les
copies appariées ne peuvent pas interférer. Les deux mesures supplémentaires
sont comptées : 72 appels par cas, contre 24 pour les autres conditions.
Ce bras exécute le noyau d'apprentissage causal ; il ne constitue pas une
campagne du cycle GVX complet avec évolution de lignées.

MBH-like et Lipson-like sont les modèles simplifiés demandés dans la feuille
de route. Ce ne sont ni une reproduction d'un MBH-RNN publié, ni une expérience
robotique de Lipson. L'auto-modélisation après dommage est notamment décrite
par le [laboratoire Creative Machines](https://www.creativemachineslab.com/evolutionary-self-modeling.html).

## 3. Ablation et médiation

Seize autres cas comparent `broadcast_delivered` et `broadcast_suppressed`.
Les mêmes objectifs sont soumis au pool local, puis au véritable cycle AGOW,
avec ignition, décision de mode, frame durable, récepteur et reçus.
Le récepteur n'obtient l'objectif qu'à travers le candidat diffusé. La
suppression utilise une liste de récepteurs vide ; elle ne remplace pas le
récepteur par un stub qui retourne un échec préfabriqué.

Une seconde comparaison `full` / `broadcast_ablated` mesure la même intervention.
Ces deux comparaisons partagent leurs cas : elles ne sont pas deux réplications
indépendantes. `skipTransport` borne le banc à la livraison locale et ne valide
pas un transport réseau ni une mission multi-hôte.

## 4. Résultats

Le run du 2026-10-06 contient 48 cas par condition (trois corpus de 16),
288 exécutions de référence et 64 exécutions de contrôle du workspace.

| Condition | Réussites | Erreur absolue moyenne | Appels par cas |
| --- | --- | --- | --- |
| Lipson-like | 48/48 | 0,023875 | 24 |
| Précision apprise ablatée | 48/48 | 0,029130 | 24 |
| MBH-like | 48/48 | 0,039037 | 24 |
| Self-Twin + T0/T3 | 48/48 | 0,053457 | 24 |
| T0/T3 | 48/48 | 0,064819 | 24 |
| Liens contrôlés Self-Twin | 30/48 | 0,111225 | 72 |

La médiation donne **16/16** avec diffusion contre **0/16** sans diffusion.
L'ablation donne également **16/16** pour `full` et **0/16** pour
`broadcast_ablated`. Ces contrôles partagent leurs cas.

Hash du jeu de reçus (`artifactHash`) :
`585e7b60ce47d83e65b61385f914cb7983054584695399c18d6dcea4c4e4c205`.
Le manifest et les reçus détaillés restent dans le répertoire local décrit
plus haut. Le commit source de base et les hash des fichiers exécutés sont
inscrits dans le manifest ; le banc a exécuté les modifications locales avant
leur commit, donc le seul HEAD de base ne décrit pas ces sources.

Ces résultats ne montrent **aucune supériorité générale de GenOS**. La baseline
Lipson-like produit la plus petite erreur sur ce simulateur. Fixer la précision
à 1 fait mieux que son adaptation dans le bras T0/T3 ; l'apprentissage des
liens coûte trois fois plus d'appels et échoue au seuil sur 18 cas. Le seuil
binaire de réussite masque les différences d'erreur entre les cinq bras à
48/48. Le runner n'émet aucune décision de promotion.

### Vérification des contrats logiciels

`npm --prefix backend run test:agow` passe, dont le test de clôture SQLite
sur disque, deux processus, réouverture, bindings propres à l'agent, délai,
coût, outcome nul, décompilation et propositions sans activation.
Le contrôle de qualité des sources AGOW ne présente aucune violation.

La vérification globale du dépôt ne peut pas être annoncée verte : `npm test`
rencontre un timeout de 30 secondes dans la bissection des workspaces ; la gate
globale contient des violations hors de ce périmètre ; `cargo test --workspace
--offline` attend le verrou de compilation partagé et a été interrompu.
Aucun résultat Rust n'est revendiqué pour cette clôture Node.

## 5. Critique et portée

Une première version du banc initialisait inégalement les priors T0/T3 et
pouvait poursuivre après un échec du mode de diffusion. Ses comparaisons ne
sont pas retenues comme validation. La version 3 corrige ces défauts et isole aussi les états SQLite entre réexécutions et emploie
trois nouveaux corpus ; les paramètres des stratégies n'ont pas été optimisés
sur ces corpus finaux.

Les trois réplications utilisent le même hôte et le même simulateur. Elles
établissent une reproductibilité locale descriptive, pas une réplication par
un laboratoire indépendant. Le simulateur est linéaire, sans bruit, avec un
dommage unique ; il favorise potentiellement des adaptateurs simples. Il ne
mesure pas la qualité d'un raisonnement LLM, l'autorisation de changements de
topologie, la conscience ou la validité d'un holdout métier.

La médiation confirme une dépendance locale de l'état du récepteur au
broadcast. Elle ne démontre pas une amélioration générale des décisions.
Les gates de preuve et de promotion restent nécessaires avant toute activation.
