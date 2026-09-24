# ADR 0093 — Contrôleur régional autonome de Métapopulation

## Statut

Accepté.

## Date

2026-09-24

## Domaine

Métapopulation, observabilité régionale, runtime et Morphogenèse locale.

## Lié à

ADR 0047 — Sessions persistantes de Métapopulation ; ADR 0071 — Morphogenèse fractale et contrôle local.

## Contexte

Le runtime régional persistait déjà les cycles `OBSERVE → DIAGNOSE → PLAN → EXECUTE → VERIFY → RECORD`, mais exigeait que son appelant fournisse les cinq adaptateurs du cycle. Les mécanismes de liveness, contribution, anti-synchronie, utilité régionale et transitions morphogénétiques locales existaient séparément.

## Décision

1. Fournir un cerveau régional interne qui collecte les observations persistées et compose les services régionaux existants.
2. Détecter les dèmes à risque, les capacités manquantes, les patches vacants et les corridors exposés à la synchronie.
3. Autoriser automatiquement uniquement des actions locales bornées déjà couvertes par les services persistants : signaler un dème `AT_RISK` et réduire ou geler les corridors dirigés concernés.
4. Vérifier le résultat relu depuis la base avant d'inscrire le cycle comme vérifié.
5. Garder secours, recolonisation et évolution de topologie comme recommandations tant que leurs preuves et adaptateurs propres ne sont pas fournis. Une transition locale de topologie reste exécutée par `nestedTopologyService` via la transition Morphogenèse transactionnelle, avec vérification de l'invariant régional.
6. Conserver le runtime générique avec adaptateurs injectables pour les stratégies expérimentales et les tests.

## Conséquences

### Positives

- Une session persistante peut maintenant exécuter un cycle régional sans cerveau fourni par l'appelant.
- Les décisions sont vérifiées à partir de l'état effectivement enregistré, et leurs issues rejoignent le journal régional.
- Les dèmes uniques peuvent être signalés comme protégés dans les recommandations de secours ; le contrôleur ne les supprime pas.
- Le niveau régional demeure Métapopulation lors d'une transition morphogénétique limitée à un dème.

### Négatives

- Le contrôleur ne réalise pas encore automatiquement les migrations, secours, extinctions, recolonisations ni transitions morphogénétiques ; ces mécanismes demandent encore des preuves et adaptateurs spécifiques.
- L'extraction des erreurs corrélées repose sur les événements régionaux récents disponibles dans la persistance.

## Alternatives

- Laisser chaque appelant construire tous les adaptateurs : écarté comme mode par défaut, car cela maintient le principal point d'incomplétude.
- Automatiser immédiatement les migrations et recolonisations : écarté tant que chaque effet ne dispose pas d'une vérification et d'une stratégie de rollback dans cette boucle.
