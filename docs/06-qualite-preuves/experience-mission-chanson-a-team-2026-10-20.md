# Expérience — mission chanson A-Team du 20 octobre 2026

- **Type** : preuve / retour d'expérience
- **Statut** : Implémenté et vérifié dans la portée décrite
- **Portée** : orchestration locale A-Team de trois workers génératifs, transmission
  d'artefacts, clôture commune et garde homéostatique
- **Dernière revue** : 2026-10-21

## Résumé

La mission demandait de produire une chanson française narrative et émotionnelle.
La référence initiale à un artiste vivant a été transformée en contraintes de haut
niveau : texte original, narration accessible, progression vers l'émancipation et
refrain mémorisable. Aucun texte existant ni imitation précise n'a été demandé aux
workers.

Le texte a réellement été généré par une A-Team GenOS composée d'un auteur, d'un
dramaturge et d'un critique. La première clôture globale a cependant affiché un
résultat non vérifié alors que le TeamRun spécialisé avait terminé avec succès. La
cause n'était pas le contenu de la chanson, mais plusieurs ruptures de contrat entre
la génération, les handoffs, la clôture A-Team et la garde globale.

Après correction, la clôture globale a été rejouée sur le TeamRun persistant. Elle a
accepté les preuves sans relancer les modèles ni réécrire la chanson.

## Identité de l'exécution retenue

| Élément | Identifiant ou résultat |
| --- | --- |
| Organisation | `org-local` |
| Projet | `project-org-local` |
| Workspace | `ws-8fc05b5a7ea8` |
| Mission canonique | `mission_e97b894d-79a2-4dab-ae09-8ea1347242f4` |
| Orchestrateur | `mcp_orchestrator_795d8f35-20d3-4e5f-844b-5ec6e6fadb7e` |
| TeamRun A-Team | `ateam_30fb4b6c87ef466a53ac32944dc6e609` |
| Reçu de clôture | `a-team:ateam_30fb4b6c87ef466a53ac32944dc6e609` |
| Empreinte du reçu | `bb5ed4a3477c552865005e31007a19296ca981edf2af9ac665d333723a93c7af` |
| Expérience GenOS | `f78eca50-a901-4d18-a8fe-5d538c13fe76` |

La base SQLite dédiée et ses sauvegardes restent des artefacts locaux hors Git. La
clé d'authentification GVX est fournie par l'environnement et n'est ni documentée ni
versionnée.

## Topologie et résultat

La chaîne spécialisée était séquentielle :

1. `literary_author` produit une première chanson et ses éléments de preuve ;
2. `dramaturg` reçoit l'artefact typé, le resserre et produit la version finale ;
3. `literary_critic` vérifie le résultat et rend un verdict indépendant.

L'état persistant retenu porte les propriétés suivantes :

- statut du TeamRun : `COMPLETED` ;
- intégration acceptée : `true` ;
- verdict commun : `succeeded` ;
- membres requis terminés : 3 sur 3 ;
- `requiredWorkers` : `true` ;
- `invariants` : `true` ;
- `independentOracle` : `true` ;
- `evidence` : `true` ;
- garde homéostatique finale : autorisée ;
- preuves manquantes : aucune ;
- invariants en échec : aucun.

## Artefact final

La version ci-dessous est l'artefact `candidate` du worker dramaturge, relu par le
critique. Elle n'a pas été recomposée dans le compte rendu.

### Je me lève

```text
Couplet 1
J'ai longtemps attendu derrière la vitre,
Les jours passaient sans que je les habite,
Je regardais les autres marcher dehors,
Pendant que je gardais mes peurs au corps.

Refrain
Je me lève, je déplie mes pas,
Je laisse l'ombre derrière moi,
Chaque souffle est une porte qui s'ouvre,
Je ne reviendrai pas.

Couplet 2
Les voix qui disaient « reste à ta place »
S'accrochent encore comme une vieille trace,
Mais je connais le poids de mes chaînes,
Et je sais qu'elles ne tiennent qu'à un fil de laine.

Pont
Il n'y a pas de bruit quand on se libère,
Juste un silence clair après l'hiver,
Et je découvre que j'avais en moi
La carte du chemin et la clé du choix.

Refrain final
Je me lève, je déplie mes pas,
Je laisse l'ombre derrière moi,
Chaque souffle est une porte qui s'ouvre,
Je ne reviendrai pas.
```

## Chronologie des échecs observés

Les tentatives n'ont pas échoué pour une raison unique. Chaque correction a permis
d'atteindre la barrière suivante, qui a révélé un autre défaut de raccordement.

1. **Résolution du workspace** — une entrée relative persistée pouvait être comparée
   à tort à la racine absolue demandée.
2. **Autorité et registre GVX** — la base historique avait été signée avec une clé
   éphémère indisponible. Une base dédiée et une clé d'environnement explicite ont
   été utilisées ; aucune chaîne existante n'a été falsifiée ou réécrite.
3. **Budget et bail** — des scopes de budget et des leases trop courts interrompaient
   des workers encore légitimes.
4. **Fanout A-Team** — le plafonnement générique supprimait des étapes séquentielles
   indispensables de la topologie.
5. **Critères de mission** — les critères de succès n'étaient pas propagés jusqu'au
   prompt et au schéma JSON des workers.
6. **Réponses structurées** — le runtime local acceptait du JSON syntaxiquement valide
   sans toujours appliquer le schéma spécifique transmis au fournisseur.
7. **Handoffs** — les références d'artefact arrivaient au worker suivant, mais pas
   toujours le contenu utile ; lorsqu'un champ `output` existait, il pouvait aussi
   masquer `workerArtifact.content`.
8. **Preuves de handoff** — les références d'une évaluation de handoff réussie
   n'étaient pas incluses dans l'ensemble de preuves utilisables.
9. **Double clôture** — la barrière externe recalculait une clôture générique avec une
   autre identité de mission au lieu de réutiliser la clôture A-Team déjà vérifiée.
10. **Collecte globale** — la collecte de mission ignorait la clôture A-Team persistée.
11. **Homéostasie** — la garde globale exigeait à tort un reçu de worker biologique
    pour une mission A-Team et pouvait écraser un résultat topologique vérifié.
12. **Compatibilité de données** — une base plus ancienne ne possédait pas certaines
    colonnes récentes ; les lectures de reprise devaient rester compatibles.

## Correctifs conservés

Les changements liés à cette expérience suivent quatre principes :

- propager les critères de succès et le délai de barrière jusqu'aux workers ;
- valider les sorties contre le schéma réellement demandé ;
- transporter le contenu, l'identité et les preuves des handoffs ;
- considérer une clôture A-Team persistée uniquement si tous ses contrôles sont vrais.

Une clôture A-Team n'est donc réutilisable que si le TeamRun est `COMPLETED`, si
l'intégration est acceptée, si tous les membres requis sont terminés et si les quatre
contrôles communs sont vrais. Le transport réussi ou la simple présence d'un texte ne
suffisent jamais.

## Vérifications exécutées

| Commande | Résultat |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | 7 145 fichiers, 0 violation nouvelle ou totale |
| `npm test` | succès, code de sortie 0 |
| `cargo test -p genos-cli --test biological_crossover` | 4 tests réussis |
| `cargo test --workspace` | succès, code de sortie 0 |

Les premières exécutions de `npm test` et de deux tests Rust ont rencontré des refus
d'accès du bac à sable aux sockets locaux ou aux checkpoints temporaires. Les mêmes
commandes, relancées avec les permissions locales prévues par leurs protocoles, ont
réussi. Ces incidents d'environnement ne sont pas comptés comme des succès
fonctionnels avant leur réexécution complète.

## Limites et non-claims

- GenOS a orchestré, persisté et vérifié le travail ; les paroles ont été générées par
  des modèles au sein des workers, pas par un algorithme déterministe de composition.
- La dernière validation est un rejeu de la clôture sur le TeamRun persistant. Ce n'est
  pas une nouvelle génération complète après le dernier correctif.
- Le verdict prouve le respect du contrat déclaré et la cohérence de la chaîne de
  preuves. Il ne constitue pas une mesure universelle de qualité artistique.
- Les chemins locaux, bases SQLite, capsules, clés et sauvegardes ne font pas partie du
  commit Git.

## Reproduction bornée

La commande publique d'orchestration reste :

```powershell
node backend/bin/genos-orchestrate.cjs '{"mission":"Écrire une chanson française originale, narrative et émotionnelle","background":true}'
```

Une reproduction exacte nécessite aussi l'identité du tenant, le workspace, le scope
de budget, la configuration du fournisseur de modèle, le lease MCP et la clé GVX du
registre choisi. Leur absence doit produire un refus explicite, jamais un faux succès.
