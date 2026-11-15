# Le Dernier Sas — reprise du 5 novembre 2026

## Périmètre et sources

Campagne locale : `D:/GenOS-runs/dernier-sas-latest-20261105`.
L'exécution utilise une copie figée de 12 090 fichiers capturés depuis
`c42159c0f14b0067fff81cc16ac41c66996af526`, avec les modifications locales présentes
à la capture et les amendements explicitement hachés dans `runtime-source.json`.
Le binaire Rust a été recompilé depuis cette capture (`build.log`, code 0).
Les amendements suivants portent uniquement sur JavaScript ; les sources Rust
et le binaire utilisé restent identiques. Les dépendances installées, le serveur
Ollama et le matériel sont partagés avec d'autres travaux.

Chaque tentative crée une nouvelle base, de nouveaux identifiants et des autorités
signées dans leur périmètre. Les tentatives refusées ne sont pas transformées en
succès. La publication canonique exige une qualification native indépendante et
une égalité d'empreinte avec l'export accepté. Les bases et artefacts bruts restent
hors Git ; ce rapport ne contient aucun secret.

## Défauts reproduits et corrections

1. Le schéma de relecture répétait le même enum de citations dans les deux
   variantes de chacun des critères. Sur le brouillon réel de la tentative 2,
   les onze critères du corps produisaient 324 510 octets de schéma et une réserve
   reconstituée de 376 606, pour un reliquat de 104 261. Une définition locale
   `$defs/sourceQuote` conserve le même enum et toutes ses contraintes ; le schéma
   descend à 22 858 octets et la réserve à 74 954 (`schema-budget-probe.json`).
2. Le schéma exige une valeur entière de l'enum, mais le prompt et sa correction
   suggéraient une sous-chaîne. Ils demandent maintenant explicitement l'élément
   entier, exact, sans découpage. La relecture du corps distingue aussi son périmètre
   de celui du paratexte, contrôlé séparément sur le livrable entier.
3. Les mêmes erreurs Ajv étaient répétées pour les branches `oneOf` inapplicables.
   Leur déduplication conserve chaque diagnostic distinct et le refus initial.
   Sur la tentative 4 : 26 388 caractères deviennent 2 152 ; la réserve de correction
   reconstituée passe de 139 217 à 90 280 pour 95 628 disponibles
   (`repair-budget-probe.json`).

Les sondes reconstituent le prompt à partir du vrai checkpoint et ne prétendent pas
être une nouvelle inférence. La validation du schéma, les citations autorisées,
les critères fixes, les refus de troncature et d'usage inconnu restent obligatoires.
Le plafond natif de 160 000 tokens n'est pas relevé.

## Tentatives conservées

| Tentative | Observation terminale | Publication |
| --- | --- | --- |
| 1 | Ancien lecteur DeepSeek retiré : HTTP 410 ; usage inconnu conservé | Aucune |
| 2 | Réservation du schéma dupliqué : `GQEL_TOKEN_BUDGET` | Aucune |
| 3 | Brouillon de 1 747 mots, puis citations du plan hors enum | Aucune |
| 4 | Corps assez long, citation refusée puis correction trop volumineuse | Aucune |
| 5 | Lecture DeepSeek tronquée à 8 192 tokens, refus natif maintenu | Aucune |

La route DeepSeek actualisée est attestée dans son
[catalogue officiel](https://ollama.com/library/deepseek-v4.1-flash).
Après son échec de sortie complète, une nouvelle tentative utilise GLM et
[Mistral Large 3](https://ollama.com/library/mistral-large-3), deux familles de
lecteurs distinctes de Gemma, le générateur. Le choix de route ne constitue pas
une preuve d'acceptation ; les contrôles préalables et les verdicts réels restent requis.

## Validation du correctif

- `test_gqel_grounded_quotes.cjs` : code 0 ; comparaison des grammaires factorisée
  et développée, citations inventées refusées, notes et champs invalides refusés.
- `test_gqel_native_schema_repair.cjs` : code 0 ; usage mesuré conservé sur le refus,
  erreurs dédupliquées, consigne de copie entière et refus des sorties tronquées.
- Gate de qualité final : 9 184 fichiers, zéro violation, code 0
  (`code-quality-final.log`, `code-quality-final.exit.txt`).

Les preuves de mission et les résultats des suites complètes seront ajoutés après
leur clôture effective. À ce stade, ce document ne certifie aucune nouvelle livraison.
