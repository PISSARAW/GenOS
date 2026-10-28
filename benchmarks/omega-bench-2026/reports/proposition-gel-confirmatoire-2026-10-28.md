# Proposition de gel confirmatoire — OMEGA-BENCH 2026

**État : proposition seulement. Le protocole reste en brouillon et aucun résultat du holdout n'a été scoré.** Audit établi le 2026-10-28 à partir du dépôt courant, des manifestes de résultats publics et du préflight.

## État du holdout

`python benchmarks/omega-bench-2026/src/check_readiness.py` a confirmé `sealed_holdout: passed`, 680 cas et `location=outside_repository`. Le contrôle appelle `generate_holdout.verify_holdout`: il vérifie commitment, présence, volumes et empreintes des fichiers privés; il ne compare pas les sorties de candidats aux oracles et ne produit aucun score. Cette vérification n'est pas un scoring du holdout.

Le préflight public donne **24/26**. Les 24 contrôles réussis couvrent les 3 400 cas et 12 expériences, les 40 800 exécutions principales prévues, les 24 fichiers d'entrée/oracle publics et leurs empreintes, A–D, les sept familles de baselines, le verrou matériel et zéro appel modèle. Les deux contrôles en échec sont exactement `protocol_preregistered` et `preregistration_requirements`.

## Empreintes publiques observées

| Objet | Empreinte SHA-256 / état |
| --- | --- |
| `protocol.json` | `627b14065575a4bd3b9d7f34d4fa350b1f4fc82b060afd99af050c288fd16e2f` |
| `dataset/manifest.json` | `e8714de000ade8dce84d5cf3f294b23c6f54701293d6fd0f83c76526e90373ab` |
| Corpus public | 3 400 cas, 24/24 fichiers vérifiés contre le manifeste |
| Protocole | `0.4.0-draft`; `public_development_qualification_complete_confirmatory_campaign_blocked` |
| Seuils | `draft_requires_preregistration` |

Les empreintes du manifeste couvrent les JSONL publics d'entrée et d'oracle. Elles ne figent pas à elles seules les adaptateurs, les dépendances, le plan statistique ou les frontières d'instrumentation; le gel proposé doit enregistrer aussi ces objets.

## Conditions principales et baselines

A, B, C et D ont chacun 10 200 lignes (3 400 cas × trois répétitions) et leur évaluation publique complète rapporte 100 % de conformité, aucun manque, doublon, statut invalide ou échec critique. Les hashes source des adaptateurs A/B/C correspondent à leurs manifestes. D a été fusionné à partir d'un manifeste initial et d'un rafraîchissement E10/E11. Le hash de l'adaptateur D courant est `14a43f7fda3fcda4d7eadbee6c4cb8ad6668acd836df0ca38fee29711884e2d7`; le manifeste D complet, le rafraîchissement E10/E11 et le manifeste A8 déclarent maintenant le même hash GenOS. Les 450 clés scénario/répétition D E10/E11 et A8 correspondent, et les 450 réponses sont identiques (300/300 E10, 150/150 E11). Les manifestes concordent avec les fichiers sources actuels.

| Baseline | Portée déclarée | Exécutions correctes |
| --- | --- | ---: |
| MLIR | E01–E04, E12 | 4 800/4 800 |
| Temporal | E05–E07 | 1 350/1 350 |
| LangGraph | E05–E07, E10 | 1 650/1 650 |
| Agent2Agent | E07, E12 | 900/900 |
| MCP | E07, E12 | 900/900 |
| OPA | E03, E08 | 6 000/6 000 |
| JSON Schema + référence Python | E01–E12 | 10 200/10 200 |

Les sept adaptateurs et leurs manifestes déclarent les mêmes hashes source; les évaluations ont zéro échec critique dans les périmètres qualifiés. Les périmètres `N/A` ne sont pas des échecs. Le statut global de `configs/baselines.json` a été mis à `qualified_public_development`; cela ne vaut pas préenregistrement ni qualification confirmatoire.

## Ablations et charge disponibles

| Item | Périmètre / résultat public actuel | État pour un gel confirmatoire |
| --- | --- | --- |
| A1 — repli d'additions | E04, 300 par bras; 300/300 corrects ON et OFF; deux opérations deviennent une; médianes 1,94 ms OFF, 1,72 ms ON | Mesure exploratoire du seul repli adjacent; ne représente pas toutes les optimisations. |
| A2 — validation statique à l'entrée | E03, 3 000 exécutions par bras; ON 3 000/3 000 conformes, OFF 2 250/3 000 (75 %). ON rejette les 1 500 entrées invalides avant dispatch. OFF rejette les 750 kinds `EXECUTE` au runtime, mais envoie au handler factice les 750 entrées invalides dont `state` manque; médianes 0,7158 ms ON, 0,0124 ms OFF. | Contraste de validation d'enveloppe+compilation ajouté au runtime gardé. Il ne teste pas la suppression des contrôles runtime ni la prévention d'effets dangereux: le handler est factice et sans effet externe. Portée E03 exploratoire seulement; décider si cela satisfait A2 et comment traiter `state` manquant. Hash des deux manifestes synchronisé au runner (`df9b2dbe…d5fce6`). |
| A3 — typage strict | E03, 3 000 par bras; strict 3 000/3 000, validation conteneur seule 1 500/3 000 | Portée claire et reproductible; public seulement. |
| A4 — journal/replay natif | E05, deux bras G-CIR appariés, 300 chacun; oracle et paires exactes 300/300; effets simulés 1 par cas; 0,09 ms en mémoire contre 22,89 ms avec interruptions/récupérations SQLite | Le runtime injecte son journal SQLite et reprend avec la même clé d’idempotence. Le handler externe reste simulé en mémoire et l’interruption est une exception suivie d’une fermeture/réouverture de connexion; résultat public exploratoire, pas une preuve de panne électrique ni de service externe. Détails dans `a4-harness-control-2026-10-28.md`. |
| A5 — service remplacé par handler de référence | E10: A5 300/300, D 300/300; réponses identiques sur les 300 paires | Enveloppe, compilateur et runtime G-CIR appariés. Le handler de référence ne persiste pas la transition. |
| A6 — allocateur remplacé par handler de référence | E11: A6 150/150, D 150/150; réponses différentes sur les 150 paires, les deux satisfont le contrat | C courant et A6 donnent également 150/150; un ancien rapport 54/150 était périmé et a été corrigé. E11 en euros reste non mesuré. |
| A7 — encodage compact | E02, 600/600; gain médian d'octets 29,29 % | Le seuil proposé de 30 % n'est pas atteint par la médiane. |
| A8 — carte de services D appelée par JSON typé | E01–E12, 10 200 exécutions; 10 200/10 200 conformes, réponses identiques à D sur 10 200 paires. | A8 couvre maintenant tout le périmètre public et appelle les mêmes handlers que D; les services GenOS réels restent limités à E10/E11, tandis que les dix autres expériences utilisent les handlers de référence dans D et A8. La comparaison complète porte donc sur le chemin G-CIR contre dispatch JSON pour la carte de services actuelle; elle ne prétend pas que les services GenOS sont utilisés sur les douze expériences. Hashes source/manifeste concordants: runner `48a19eb0…525d2a3`, référence JSON `4cedc417…689da21`, runner GenOS `14a43f7f…884e2d7`. |
| Charge E09 | 10, 100, 1 000, 10 000 invocations async, trois répétitions; 33 330/33 330; RSS maximale 319,3 MiB | Un processus Node, commandes logiques agrégées par l'oracle, pas des agents OS ou une instance GenOS complète; la borne mémoire de production n'est pas établie. |

A2 a été relancée après mise à jour du runner et son hash est synchronisé au manifeste. A1/A3, A4, A7 et le runner E09 ont aussi des hashes source synchronisés. A4 a été remplacée par la mesure runtime-native E05; ses manifestes capturent les hashes de l’adaptateur, du runtime, du journal et du manifeste de données. D E10/E11 et A8 ont été relancés après le refactor final; leurs hashes source sont maintenant synchronisés.

## Frontières de métriques et décisions à prendre

1. **E11 en euros — décision bloquante.** Le seuil demande des missions réussies par euro et un gain relatif de 15 %. Le VM Shadow partagé ne fournit pas de compteur d'énergie attribuable à l'exécution. CPU-time et TDP ne sont pas des mesures en euros. Choisir soit un hôte instrumenté avec méthode d'attribution et tarif fixe documenté, soit retirer formellement cette métrique de la portée confirmatoire et définir avant gel une mesure substitutive; ne pas marquer le seuil actuel satisfait.
2. **Définition A2.** Le rerun public mesure ON=validation d'enveloppe+compilation+runtime contre OFF=runtime seul, la garde runtime restant active. L'oracle confirme que le runtime transmet 750 enveloppes `state`-missing non canoniques au handler factice; aucune action dangereuse réelle n'est représentée. Décider si le contraste restreint répond à l'ablation visée, et fixer le traitement contractuel de `state` manquant. Ne pas interpréter ces handlers factices comme une mesure de sûreté de production.
3. **Définition A4.** Une tranche runtime-native publique E05 est maintenant mesurée sans modification du protocole. Elle reste exploratoire et n’atteste pas la durabilité d’un système externe réel. Le test harness-level précédent n’est plus le résultat A4 courant.
4. **Provenance.** Les résultats D rafraîchis et A8 correspondent maintenant aux sources présentes. Après tout changement d'adaptateur, revalider les hashes; ne pas réutiliser les résultats d'une source antérieure.
5. **Puissance.** L'analyse publique `src/analyze_power_public.py` et `reports/analyse-puissance-publique-2026-10-28.md` couvrent les contrastes antérieurs; sa ligne A4 décrit l’ancien contrôle harness-level et doit être régénérée avant toute décision de puissance confirmatoire. Elle utilise les sorties/oracles publics uniquement, l'unité scénario et les médianes des répétitions; elle produit des estimations de planification sous correction Bonferroni, pas des p-values confirmatoires sous Holm. A2 demeure un contraste restreint de validation. A5 ne valide pas la persistance morphogénétique et A6 ne couvre pas le coût en euros. Confirmer les portées puis figer puissance, correction multiple, marges et limites.
6. **Frontières d'instrumentation.** Le plan propose latence du JSON déjà chargé/encodé à la réponse décodée, inclut transports/reprises/erreurs, exclut démarrage/installation/génération/scoring; octets UTF-8 au même point; coûts API `N/A` sans appels payants. Confirmer que chaque baseline et ablation mesure bien ces frontières ou spécifier des métriques `N/A` non comparables. Fixer pour E09 p99, débit, mesure RSS et régime froid/chaud.
7. **Comparateurs et artefacts scellés.** Figer le comparateur externe applicable de chaque famille à chaque expérience à partir du développement public; figer versions, matériel, commandes, hashes de tous les adaptateurs/configurations et la sortie du calcul de puissance avant d'exécuter `evaluate_holdout.py`.
8. **A8 — interprétation de portée.** Le runner couvre maintenant les douze expériences et utilise le même mappage de handlers que D : services GenOS réels en E10/E11, handlers déterministes de référence ailleurs. Cela satisfait un contraste complet du chemin G-CIR contre dispatch JSON dans la composition D actuelle, sans modifier D ni prétendre à une intégration GenOS sur douze tâches. Si l'interprétation exigée est plutôt « mêmes services GenOS réels sur chaque tâche », cette comparaison reste impossible à partir de l'implémentation actuelle et demanderait d'ajouter ces services; ne pas extrapoler les résultats E01–E09/E12 comme effet des services GenOS.

## Checklist de gel proposée

- [ ] Décider et écrire le statut de la métrique E11 en euros; obtenir le matériel/tarif si elle est conservée.
- [ ] Adopter ou amender la définition A2; corriger le traitement de `state` absent ou limiter explicitement la conclusion.
- [x] Exécuter A4 comme comparaison runtime-native publique sur E05; réserver toute conclusion de panne réelle ou d’idempotence externe à un test avec système externe durable.
- [x] Rafraîchir D E10/E11 et A8 après le refactor final; vérifier hash des adaptateurs, couverture des paires et égalité des sorties.
- [x] Produire l'analyse de planification publique pour les contrastes principaux, d'attribution, comparateurs applicables et ablations; décider encore quelles portées et exclusions entreront au protocole.
- [ ] Vérifier les frontières latence/octets/coûts/RSS et consigner toute métrique non comparable comme `N/A`.
- [ ] Mettre à jour `protocol.json`, `configs/thresholds.json`, `configs/baselines.json` et le plan statistique ensemble; calculer leurs hashes finaux.
- [ ] Créer un manifeste de gel versionné comprenant hashes (protocole, corpus et fichiers, adaptateurs, lockfiles, configuration matérielle, plan/puissance), commande par bras et portées.
- [x] Étendre A8 à E01–E12 en gardant la même carte de services que D; limiter l'attribution aux services GenOS réels à E10/E11.
- [ ] Obtenir un préflight sans blockers, puis commit du gel avant toute lecture des oracles du holdout.
- [ ] Seulement après ce commit, produire les sorties candidates du holdout, les fermer et lancer le score indépendant.

## Commandes de contrôle et reproduction

État courant et intégrité du corpus/holdout, sans scorer :

```powershell
python benchmarks/omega-bench-2026/src/check_readiness.py
```

Campagne publique principale et contrôles reproductibles ciblés :

```powershell
node benchmarks/omega-bench-2026/adapters/json_reference.cjs
node benchmarks/omega-bench-2026/adapters/gcir_minimal.cjs
node benchmarks/omega-bench-2026/adapters/gcir_optimized.cjs
node benchmarks/omega-bench-2026/adapters/genos_full.cjs
node benchmarks/omega-bench-2026/adapters/ablation-a1-a3.cjs
node benchmarks/omega-bench-2026/adapters/ablation-a2-static-boundary.cjs
node benchmarks/omega-bench-2026/adapters/a4-e05-journal-control.cjs
node benchmarks/omega-bench-2026/adapters/ablation-a7-compact.cjs
node benchmarks/omega-bench-2026/adapters/ablation-a8-json.cjs
node benchmarks/omega-bench-2026/src/run_e09_load.cjs --output=benchmarks/omega-bench-2026/results/E09-load.json
```

Ces commandes ne score pas le holdout. Garder le protocole au statut brouillon jusqu'à décision sur les items ci-dessus; ne pas inscrire `status: preregistered` par simple complétion technique du préflight.
