# Morphogenèse automatique et sept protocoles — 4 novembre 2026

## Résultat réel

Deux missions sans scénario ont terminé avec une sélection automatique du membre
à remplacer, une transition Rust/MORPH finalisée, une nouvelle exécution native
et un livrable collectif accepté. Les payloads ne désignent aucun membre ni rôle
de remplacement. Le vérificateur indépendant a contrôlé les sept protocoles
sur chaque mission, sans se limiter à leurs options d'activation.

| Mission | Famille | TeamRun | Transition |
| --- | --- | --- | --- |
| Bilan de stock d'un atelier | `bounded_worker` | `ateam_5d6030cc3ffafc27081538909bb4c421` | `tx-596ddfc0` |
| Planning d'une bibliothèque | `synthesis_worker` | `ateam_11fa9cbc7fa412044cb43a04472bfe70` | `tx-09cc57d3` |

Les deux clôtures sont `COMPLETED`, `success: true`, avec score GQEL 80 et
revues fraîches GLM sur les productions Gemma. Le membre initial remplacé n'a
aucune ligne d'exécution ; le remplaçant possède son propre run, son reçu de
qualité et ses handoffs acceptés. L'ordre temporel source terminée → transition
commise → création du run du remplaçant est contrôlé par le vérificateur.

Le mécanisme reste borné : remplacement d'un membre en attente dans une A-Team
avec dépendance éligible, politique automatique et qualité explicites. Il ne
préempte pas une inférence active et ne démontre pas une reconfiguration
arbitraire de toute topologie.

## Généralité et déclenchement

L'[ancien parcours](morphogenese-live-dernier-sas-2026-11-04.md) ne contenait
aucun titre spécifique, mais exigeait des workers créatifs et des sélecteurs
fournis par l'appelant. L'[ADR 0790](../adr/0790-morphogenese-automatique-guidee-par-observations.md)
ajoute une politique V2 qui choisit une dépendance du graphe à l'exécution :

```json
{
  "version": 2,
  "mode": "automatic",
  "requireTransition": true,
  "budgetPressureRatio": 0.1
}
```

Le seuil de 10 % est le paramètre déclaré de ces qualifications, pas une
recommandation générale. La règle est figée avant toute exécution.
Le signal réel de ces deux missions est une consommation mesurée dans la
session GQEL authentifiée :

| Mission | Consommation source | Plafond GQEL | Ratio observé | Défauts de qualité source |
| --- | ---: | ---: | ---: | --- |
| Stock | 11 758 jetons | 90 000 | 13,0644 % | Aucun |
| Planning | 12 145 jetons | 90 000 | 13,4944 % | Aucun |

Le moteur n'a pas fabriqué de rejet artistique pour provoquer un remplacement.
Le signal porte le code `GQEL_BUDGET_PRESSURE`, les mesures et le seuil, lié au
digest de la session signée. Le consommateur reçoit ces observations. La tâche
et son allocation de 119 999 jetons sont transférées sans allocation additionnelle.
Le plafond natif effectif de qualité reste 90 000 par worker. Les remplaçants
consomment respectivement 15 963 et 20 868 jetons mesurés.

Les essais V4, sans signal budgétaire déclaré et avec qualité acceptée dès la
première version, n'ont pas restructuré l'équipe. Leur qualification stricte
est restée refusée : le moteur ne présente pas une absence de changement comme
une preuve positive. Les brouillons incomplets proposés dans le brief ont été
complétés d'emblée par les modèles ; cette tentative n'est pas présentée comme
une réparation observée. Les défauts de versions GQEL restent un autre signal,
couvert par les tests natifs et par la mission antérieure.

## Sept protocoles observés

MORPH est inclus dans les sept : il porte la transaction de morphogenèse.
Les six autres sont vérifiés sur chacun des quatre runs de workers, MORPH sur
chacune des deux équipes.

| Protocole | Vérification effective |
| --- | --- |
| EVIDENCE | Dossier natif au statut `accepted`, digest recalculé, acteur/mission/tenant exacts ; événements `ASSERT`, `REQUEST_EVIDENCE`, `VERIFY`, `ACCEPT_UNDER_POLICY` |
| CONTINUITY | Propriétaire et génération de fence liés à l'incarnation, état natif du run, six effets d'exécution réellement clôturés par worker |
| MORPH | Autorité Rust `APPLY`, snapshot durable commis, MAC du reçu, commit AgentGit, décisions durables `COMMIT` et `FINALIZE`, roster et WorkGraph réels |
| OMEGA | Reçus de programmes effectivement terminés et résultats `emitted`, empreintes recalculées : 12 programmes sur Stock, 15 sur Planning |
| GQWF | Sessions natives, base et candidat CAS échangés et vérifiés, hashes correspondant aux racines persistées, sessions libérées |
| SYNAPSE | Contexte parent appliqué au worker, valeur du document et digest recomputés, reçu adressé au bon acteur ; `DECLARE_CONTEXT`, `OFFER_DELTA`, `APPLY_DELTA` |
| ALLOSTASIS | Allocation, consommation monotone mesurée et libération finale ; aucune exposition inconnue, aucun budget dépassé, aucun montant encore détenu |

GQWF n'avait aucune session sur les deux workers de l'ancien « Dernier Sas ».
La vérification a trouvé que le payload de délégation perdait cette option :
la transmission est corrigée sur les parcours immédiat et différé. Les nouveaux
essais activent `executionPolicy.gqwfV2: true`. Ils échangent réellement un
workspace de données en lecture seule ; ils ne publient pas de correctif source.
L'absence de publication d'une nouvelle tête de code n'est donc pas maquillée
en opération exécutée. La sonde de refus masque une session GQWF au lecteur
sans toucher à la base et obtient bien un refus de qualification.

ALLOSTASIS mesure 45 410 puis 34 017 ms pour les workers Stock ; 29 202 puis
41 096 ms pour Planning. Ces temps correspondent à la fenêtre du régulateur,
pas à une mesure totale de tous les coûts du contrôle ou de la préparation.

## Livrables et preuves locales

Sous `D:\GenOS-runs\automatic-morphogenesis-20261104` :

- `stock-v5\workspace\RESULTAT.md` : dossier avec A=15, B=11, C=6, total 32 ; SHA-256 `1d8e4bd52df39f77d8ceb0c61efd7e53012ec41b90c50a8de3c9c6e09b345d09`.
- `planning-v5\workspace\RESULTAT.md` : A 09:00–09:45, B décalé à 09:45–10:30, C 10:15–10:45 avec salle et animateur distincts ; SHA-256 `4d1886763a90e2d4858fd9ccdc20db590754394ce4d3fcee4a415947ed4145bf`.
- Pour chaque mission : `mission.request.json`, journaux, `exit.json`, identité publique de l'autorité, `proof\execution-proof.json` et `proof\team-final.json`.

Les clés privées de qualification restent uniquement dans les processus des
essais. Les artefacts et bases ne sont pas ajoutés à Git. Les anciens essais
refusés sont conservés dans leurs dossiers V1 à V4.

Vérification reproductible sur les données persistées :

```powershell
node backend/tests/qualify_automatic_morphogenesis.cjs ateam_5d6030cc3ffafc27081538909bb4c421 D:\GenOS-runs\automatic-morphogenesis-20261104\stock-v5\proof
node backend/tests/qualify_automatic_morphogenesis.cjs ateam_11fa9cbc7fa412044cb43a04472bfe70 D:\GenOS-runs\automatic-morphogenesis-20261104\planning-v5\proof
```

Le vérificateur authentifie les reçus GQEL et l'artefact final, relit les octets
livrés, contrôle l'ordre temporel, l'absence de run de l'ancien consommateur et
les sept protocoles. Un manque fait échouer la commande. Cette relecture
historique n'autorise aucune nouvelle promotion ni livraison après expiration.

## Corrections et contrôles

Outre la sélection V2, la qualification a nécessité de conserver les niches
des spécialistes, de propager GQWF et d'accorder aux trois familles nouvelles un
budget de qualité explicitement alloué et borné. Sans GQEL, leurs plafonds
ordinaires restent inchangés. Une allocation ou un plafond forgé est refusé.
Un domaine explicitement générique ne devient plus un scénario parce que son
brief contient la consigne « pas de scénario ».

`test_ateam_automatic_morphogenesis.cjs` exécute les vrais Rust/MORPH/AgentGit sur
quatre familles avec réponses LLM synthétiques annoncées comme telles. Il couvre
graphe permuté, rôle altéré, absence de signal et de candidat précréé, signal
budgétaire authentifié sans défaut de qualité, contrats de budget et propagation
GQWF sans copie de droits arbitraires. Les missions V5 utilisent les vrais
fournisseurs ; elles ne réutilisent pas ces réponses synthétiques.

Les contrôles ciblés terminent avec le code 0 : les 27 fichiers de la suite
qualité et les 24 fichiers d'intégration des protocoles. `cargo test --workspace`
termine également avec le code 0, 1 196 tests réussis et aucun ignoré. Le gate
global du code examine 8 859 fichiers et ne trouve aucune nouvelle violation.
Les journaux et codes de sortie sont conservés à la racine du dossier de preuves.


## Limite de validation générale

L’invocation locale de `npm test` a été refusée par le verrou de la suite déjà
en cours dans ce checkout (PID 26228). L’observation de ce processus jusqu’à sa
fin donne le code 1 le 4 novembre 2026 à 09:59:59 UTC ; son résultat est conservé
sans le transformer en succès dans `npm-existing-result.json`. Les sorties
complètes de cette invocation partagée ne sont pas disponibles dans ce dossier.
La suite npm générale n’est donc pas déclarée verte.

Une sonde supplémentaire de `test_worker_native_matrix.js` réussit les 20 types.
La sonde indépendante de `test_worker_cooperation.js` termine avec le code 1 et
`EXECUTION_AUTHORITY_EXPIRED` (`cooperation-probe.log`). Cela ne démontre pas que
l’invocation globale a échoué pour la même raison. Le helper de coopération fait
l’objet de changements concurrents exclus de ce commit. Aucun garde d’autorité,
verrou ou délai de validité n’a été désactivé pour obtenir les deux qualifications
V5 : leurs reçus, les sept protocoles et les livraisons ont été vérifiés avant
cette sonde et restent des preuves distinctes.
