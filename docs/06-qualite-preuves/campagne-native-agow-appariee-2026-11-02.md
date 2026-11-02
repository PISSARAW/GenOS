# Campagne native AGOW appariée

- **Date** : 2026-11-02
- **Statut** : premier lot exécuté localement sur D:
- **Socle committé** : `9ed9230d143e3251e8f662f6d9278129f567cc81`
- **Décision** : [ADR](../adr/2026-11-02-campagne-native-agow-appariee.md)
- **Portée** : deux tâches connues, modes `shadow` et `bounded`, aucune promotion

## Protocole

Une base SQLite de délégation est préparée par tâche, fermée et checkpointée,
puis copiée à l'identique pour les deux bras. Les entrées sont communes et
épinglées ; les bases d'exécution et capsules sont distinctes. Le manifeste fixe
méthodes et plafonds avant les missions. Les autorités scellées et liaisons
AGOW sont recoupées après exécution. L'ordre est inversé pour la seconde tâche.

Le hash du manifeste et le créneau cas/mode sont inscrits dans l'objectif du
contrat worker avant son scellement natif. La relecture vérifie cet objectif
et le hash du sujet attesté. Les paramètres de calcul sont communs dans une
paire ; les métadonnées de provenance font varier le texte de l'objectif.

La première tâche demande `subset_sum` sur `[3,5,7]`, cible 10. La seconde utilise
21 valeurs égales à 1, cible 10, au-delà du domaine de l'oracle d'énumération.
Aucun résultat de worker ni réponse d'oracle n'est modifié. Les modes réels
sont exécutés dans quatre processus séparés et les oracles utilisent leurs
deux stratégies indépendantes existantes.

Le worker natif s'exécute dans le processus de son bras ; le superviseur de
processus d'un worker LLM n'est pas qualifié par cette campagne.

## Résultats ciblés

| Mode | Cas | Pertes mesurées | Inconnues | Moyenne connue | Couverture | Processus d'oracle | Temps cumulé des oracles |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `shadow` | 2 | 1 | 1 | 0 | 50 % | 4 | 473 ms |
| `bounded` | 2 | 1 | 1 | 0 | 50 % | 4 | 952 ms |

Le cas résolu donne perte 0 dans les deux modes. Le cas inconclusif reste bloqué
avec perte inconnue dans les deux modes. Les quatre coûts d'oracle sont mesurés,
y compris ceux du cas inconclusif. Le coût financier local reste inconnu et ces
temps ne mesurent pas tout le runtime.

La couverture des paires est **50 %**. La différence moyenne des seules paires
connues, `perte bounded - perte shadow`, vaut **0**. Les bornes sur toutes les
paires sont **[-0,5 ; 0,5]**. Elles sont arithmétiques, sans interprétation en
intervalle de confiance. Ces données ne permettent pas de conclure à un gain.

## Contre-tests et vérification

Les 17 tests de contrat passent. Ils refusent les écarts de base initiale,
entrées, méthode, plafonds et autorité, un manifeste tardif, un run réutilisé,
un bras manquant et une perte numérique sans preuve native.

La qualification et ses sept contre-tests d'archive terminent avec code 0.
Les substitutions de perte, coût, autorité, empreinte initiale et couverture
sont refusées. Un WAL non vide est refusé avant la lecture d'une copie de base.
Les fichiers modifiés par les probes sont restaurés octet pour octet.

Le septième probe modifie le manifeste après exécution et recalcule tous les
hashes annexes. Il révélait une acceptation indue dans le premier lecteur. Le
lien au contrat natif scellé et au sujet attesté le fait désormais refuser.
Le log `paired-manifest-before.log` conserve le test en échec avant correction.

Les preuves courantes sont revalidées dans des copies des bases, avec les
contraintes natives de fraîcheur et d'autorité. Aucun reçu de promotion AGOW
n'est produit. `npm test` et `cargo test --workspace` terminent avec code 0.
Le passage Node global précède le dernier durcissement propre au banc ; la
chaîne complète `npm --prefix backend run test:agow`, rejouée ensuite, termine
avec code 0 et couvre les dernières modifications. Le contrôle qualité global
vérifie 8 459 sources sans violation. Les logs et codes de sortie sont sous
`D:/GenOS-AGOW/validation/paired-*.log` et leurs fichiers de résultat.

La suite AGOW historique signale un avertissement différé de télémétrie pour
`GENOS_ADMIN_PASSWORD` absent. Ce passage ne qualifie pas ce fallback ; les
journaux natifs de la campagne sont relus et contrôlés séparément.

## Artefacts

Archive : `D:/GenOS-AGOW/paired-runs/30b37a8e-4235-46fd-aeab-69dff26efeac/`.

- `manifest.json` : tâches, ordre, modes, plafonds et sources importantes.
- `report.json` : pertes, couverture, bornes et coûts d'oracle.
- `verification.json` : quatre relectures natives et hashes de l'archive.
- `adversarial-checks.json` : sept refus et restauration des fichiers.
- Bases initiales et finales, résultats et journaux par bras.
- Hash canonique du manifeste :
  `sha256:5de701a7a64fee4bbefa24e7a3923fb9371215ade0282ca9c22238b0938eb2ef`.
- SHA-256 du rapport :
  `46b4a3aba4ec5bb1d0c2973a5c13a7531ac05c0f7e87e3cce2400d251fe40d54`.
- Log final : `D:/GenOS-AGOW/validation/paired-agow-full.log`.

Checkout : `D:/GenOS-AGOW/paired`, branche `codex/agow-paired-native-campaign`.
Les sources importantes sont épinglées, sans toutes les dépendances transitives.

## Limites et suite

Les fixtures sont connues. Le protocole contrôle la base SQLite, les entrées et
les plafonds de chaque paire ; le système d'exploitation, les caches et tous
les fichiers transitoires ne sont pas figés. L'ordre est contrebalancé sans
randomisation. Les durées ne fondent aucune comparaison de vitesse. Les clés
locales de qualification ne certifient pas une réplication externe.
Le texte de l'objectif expose les étiquettes des conditions ; l'aveuglement des
politiques à ces métadonnées n'est pas qualifié.

Une campagne d'efficacité devra ajouter des tâches cachées, des politiques
gelées avant observation, des réplications indépendantes et un contrôle élargi
des états initiaux. Les inconnus et coûts observés devront rester dans son bilan.

## Intégration dans V3

La préparation de fusion avec `d4f183d2b` a révélé que la nouvelle garde EVIDENCE
interceptait les réfutations avant l'enregistrement du terminal natif bloqué.
Le raccord transactionnel documenté dans l'ADR conserve ce refus précis, sans
acceptation EVIDENCE, puis vérifie le statut, le motif et le reçu biologique.
Trois contre-tests supplémentaires refusent des résultats de sortie incohérents.

La qualification native retrouve les quatre résultats attendus, la suite AGOW
complète et les 13 suites de protocoles passent. Le manifeste de campagne épingle
désormais 33 sources, dont ce raccord. Les validations et artefacts de fusion sont
conservés dans `D:/GenOS-AGOW/validation/merge-*.log` et leurs fichiers de résultat.
