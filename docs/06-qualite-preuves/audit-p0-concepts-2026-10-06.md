# Audit P0 des concepts GenOS

- **Statut** : audit initial réalisé ; qualification des consommateurs et pilotes ouverte.
- **Portée** : 649 références du programme de recherche ; contrats, chemins candidats,
  baseline de tests et conditions d'entrée du socle P1.
- **Dernière revue** : 2026-10-06.

## Périmètre et méthode

L'[audit détaillé](https://chatgpt.com/space/page_631a0f45db2c8191aec6f1391eca8a15)
conserve les 649 références et leur affectation aux lots du
[programme](https://chatgpt.com/space/page_f582a574b6d4819182c266e9d429d922).
Elles correspondent à 617 clés canoniques distinctes ; 54 clés apparaissent
dans plusieurs contextes. Une même clé ne prouve pas l'équivalence des mécanismes.

La première collecte observe le checkout `474b345473f7add78539c8f2f82492500561bf7f`
avec des modifications locales préexistantes. Les empreintes de sources et journaux
restent dans le dossier local `p0-audit` associé à cette conversation ; ils ne sont
pas ajoutés au dépôt. La lecture n'est pas un snapshot atomique du checkout.

Le sondage de `canonicalConceptRegistry.resolveConceptReferences` utilise le
catalogue de capacités existant, sans exécuter les outils résolus. Les indicateurs
`available` et `executable` décrivent des contrats, pas les fonctionnalités de
recherche proposées. Les références littérales et imports fournissent des candidats
à lire ; leur présence ne prouve ni effet causal ni bénéfice empirique.

| État déclaré initial | Références |
| --- | ---: |
| Contrat exécutable | 287 |
| Contrat accessible | 190 |
| Conditionnel ou indisponible | 171 |
| Résolution absente | 1 |

L'entrée absente est MsgPack (`C576`). Le service
`backend/src/services/bioPolymerPersistenceService.js` utilise déjà `msgpackr` :
l'écart initial concerne le registre d'interfaces.

L'audit statique Node examine 2 484 services : 1 936 accessibles par imports
statiques, 261 classés `test-only`, 277 `unresolved` et 10 `dynamic-wiring`.
Ces catégories nécessitent une lecture des consommateurs avant toute décision
sur l'utilisation ou la suppression d'un module.

## Baseline exécutée

Environnement observé : Node 24.18.0, Rust et Cargo 1.97.1, Python embarqué 3.12.14.

| Commande | Résultat initial et limite |
| --- | --- |
| `python scripts/ci/check_code_quality.py` | Échec : 5 236 fichiers contrôlés, 299 violations dont 153 nouvelles ; baseline inchangée. |
| `npm test` | 55 assertions backend passent, puis arrêt sur `@biscuit-auth/biscuit-wasm` absent ; suites suivantes non exécutées. |
| `cargo test --workspace` | Échec de lien PDB `LNK1318 LIMIT (12)` sur `token_bucket` et `topology_transition` ; C: presque saturé. |
| Contrôles ciblés | 14 commandes sur 16 passent ; assertions fonctionnelles, sans comparaison scientifique. |

Les deux échecs ciblés attendent des raccourcis de provenance : tampon système
à partir d'un identifiant `seed-*`, et promotion avec le seul booléen
`independentVerification`. Le code actuel exige des attributs de vérification
pour la mémoire et un reçu vérifié pour la promotion. Leur correction doit
conserver les cas de refus et ajouter des preuves au cas positif.

Après l'échec Rust, seuls les deux PDB incomplets et les symboles de treize exemples
créés pendant cette compilation ont été retirés, sous `target/debug`, avec contrôle
des chemins et dates. Environ 2 Go ont été récupérés. Aucun succès de test Rust
n'est déduit de la compilation partielle.

Le premier appel de checkpoint GenOS a expiré sans fichier. Lors de la reprise P0,
un nouvel appel a réussi et son fichier a été observé. La persistance GenOS des
décisions et expériences demeure distincte de la vérification et de la promotion.

## Qualification à poursuivre

| Priorité | Travail | Critère observable |
| --- | --- | --- |
| B01 | Rétablir la dépendance Biscuit et exécuter la chaîne Node interrompue | Autorité et suites aval réellement exécutées. |
| B02 | Trier les 153 violations nouvelles sans relâcher la baseline | Corrections attribuables, puis gate sans nouvelle dette. |
| B03 | Aligner les deux tests de provenance | Raccourcis refusés, cas positif soutenu par preuve qualifiée. |
| B04 | Raccorder MsgPack et qualifier sa persistance | Référence résolue, aller-retour réel et entrée corrompue contrôlée. |
| B05 | Qualifier les pilotes code, mémoire et raisonnement vérifiable | Oracle réel, état initial épinglé, baseline et cas négatif. |
| B06 | Lire les consommateurs candidats, d'abord L01 à L05 et L22 | Parcours d'exécution identifié et effets relus. |
| B07 | Vérifier la reprise du checkpoint | Appel réussi et fichier relu ; acquis lors de la reprise. |

Les pilotes doivent séparer réussite fonctionnelle et amélioration comparative.
Un reçu signé garantit une provenance selon son contrat, pas la vérité de la tâche.
Le test de transfert GVX utilise un vérificateur injecté retournant `verified: true` ;
il qualifie le cycle sur fixture, pas un gain du receveur. Les campagnes GVX holdout
et les baselines MBH-like/Lipson-like restent à qualifier conformément au
[plan de puissance](../02-orchestration/plan-puissance-benchmark-gvx.md).

P0 conserve sa couverture complète et ses écarts ouverts. Sa clôture exige les
consommateurs qualifiés et les trois pilotes ; aucun gain de recherche ni passage
à P1 n'est annoncé par la seule couverture du catalogue.

## Reprise P0 après le commit documentaire

Le commit `8d2893d2` conserve la baseline ci-dessus. La reprise apporte des
corrections limitées et des qualifications exécutées, sans absorber les autres
changements du checkout.

### Provenance et promotion

Les deux tests anciens sont alignés sur les contrats actuels : un identifiant
`seed-*` seul reste non authentifié ; un booléen d'indépendance ne remplace pas
un reçu vérifié. Les cas positifs ont les attributs attendus et les cas négatifs
contrôlent absence de confiance et signature modifiée.

Un contre-exemple supplémentaire a révélé que le garde philosophique acceptait
des reçus indépendants correctement signés avec statut `refuted` ou `inconclusive`.
Le test échoue avant correction. `hasIndependentSupport` exige maintenant aussi
`status === 'verified'`. Les reçus négatifs du test passent leur validation HMAC
mais restent inéligibles ; le reçu positif reste éligible. Ce contrôle qualifie
le statut de support, pas une preuve d'expérience subjective ni une théorie.

### MsgPack et consommateurs

`msgpack` est ajouté à l'inventaire et raccordé à `bioPolymerPersistenceService`.
Le contrat reste `executable: false`. Le test
`test_ontogenesis_msgpack_interface.js` est découvert par la suite ontogenesis.
Les comptes d'inventaire attendus dans les tests sont ajustés de 704 à 705.

L'aller-retour du codec, l'entrée tronquée, la migration SQLite réelle des six
colonnes BLOB et son idempotence passent. Le consommateur
`biomimeticSignalingBus` est lu et sa suite passe sous `NODE_ENV=test` ;
`agentDnaStore` est identifié comme autre consommateur, sans qualification
supplémentaire de son cycle par cet audit. La sérialisation n'atteste pas à elle
seule l'intégrité cryptographique ou le bénéfice d'un transfert.

### Trois pilotes fonctionnels bornés

Les sondes utilisent `runTestAdapter`, `resolveSandboxTarget` et `runIsolated`.
Les capsules contiennent un script d'oracle épinglé, des données et un candidat.
Elles exécutent la commande autorisée `npm test` ; le premier essai direct
`node oracle.cjs` est refusé et conservé comme résultat inconclusif.

| Pilote | Baseline | Candidat | Oracle retiré |
| --- | --- | --- | --- |
| Code | Soustraction présentée comme addition : réfutée | Addition correcte sur cinq paires : vérifiée | Inconclusif |
| Mémoire | Préfixe seed sans attribut qualifié : réfuté | Attribut `systemSigned` fourni par la fixture de confiance : contrat de scoring vérifié | Inconclusif |
| Raisonnement | Parité impaire de n(n+1) : réfutée | Parité paire sur sept entiers : vérifiée | Inconclusif |

Les neuf contrôles passent et conservent IDs d'exécution, codes de sortie,
durées et empreintes des données, candidats et services. Les candidats sont
écrits à la main et les jeux synthétiques sont finis. Aucun modèle IA, holdout,
réplication ou apprentissage n'est mesuré. La parité n'est pas une preuve Lean
universelle ; l'authentification amont des attributs mémoire reste à qualifier.

### Environnement et dette restante

Biscuit 0.5.0 et treize paquets Sodium/OpenTelemetry manquants sont rétablis
depuis les versions verrouillées. Chaque archive est contrôlée contre son SHA-512
dans le lockfile ; ni manifeste ni lockfile ne sont modifiés par cette opération.
La commande complète `npm test` passe avec un code de sortie 0, après correction
du garde. Les suites aval capsules, OpenTelemetry, workers et Garage sont exécutées.

`cargo test -p genos-store --lib` passe ses 17 tests. Le dernier contrôle global
de qualité trouve 298 violations, dont 153 nouvelles réparties sur 97 fichiers.
La baseline n'est pas relâchée. Le résultat Rust ciblé ne valide pas le workspace
entier précédemment arrêté au lien PDB.

Le gate explicite `--staged` contrôle les huit fichiers sources de cette reprise :
une violation déjà admise par la baseline, aucune nouvelle. Le hook configuré
s'exécute également et accepte les huit fichiers sources. Il exige en outre un
bloc `Receipt:` énumérant exactement les fichiers du commit ; ce bloc est ajouté.

Les preuves de reprise, scripts de sondage et matrices actualisées restent dans
le sous-dossier local `p0-audit/continuation`. Les corrections ne ferment pas les
obligations de holdout, de qualification complète des consommateurs, de provenance
amont mémoire et de correction de la dette globale.
