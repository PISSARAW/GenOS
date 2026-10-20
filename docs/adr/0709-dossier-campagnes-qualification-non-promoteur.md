# ADR 0709 — Sceller les campagnes de qualification sans promouvoir

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : ETT, stewardship, campagnes, preuve, reprise
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0602, ADR 0646, ADR 0699

## Contexte

ETT v2 définit une comparaison `full`/`llm_only` et le stewardship dispose d'une
qualification locale Q1/Q2. Aucun contrat commun ne lançait toutefois leurs adaptateurs
réels, ne liait configuration, commit et coûts externes, ni ne conservait ensemble les
échecs, abstentions et interventions. La présence de tests locaux pouvait donc être
confondue avec une preuve d'activation que le dépôt ne possède pas.

## Décision

Introduire un manifeste `genos.qualification-campaign/v1`, un journal de campagne
hash-chaîné et un dossier descriptif commun. Deux charges sont obligatoires : ETT v2 et
stewardship. Leurs adaptateurs sont injectés explicitement par la CLI ; aucun provider
par défaut n'est fourni.

Le runner lie chaque événement au hash canonique de la configuration et au commit Git
déclaré. Il écrit un événement de départ avant l'appel externe et fournit une clé
d'idempotence stable. Les résultats, y compris `FAILED`, `NO_CHANGE`,
`INTERVENTION_REQUIRED` et `INCONCLUSIVE`, sont conservés. Seuls des coûts attribués à
un compteur externe distinct sont agrégés.

Une porte fixe exige CI Linux/Windows, trois holdouts ETT, Q1–Q5 et les huit familles
topologiques. La configuration ne peut pas affaiblir cette liste. L'intégrité du journal,
du dossier et des preuves est vérifiée avant l'évaluation.

La sortie maximale est `qualified_non_production`. Aucun dossier, même complet, ne peut
mettre `productionAllowed` ou `scientificPromotionAllowed` à `true`, ni produire une
décision de promotion.

## Invariants

- une reprise conserve la même clé et ne rappelle pas une charge déjà close ;
- une dérive de configuration ou une altération du journal échoue fermé ;
- les coûts auto-déclarés par l'adaptateur ne sont pas admis ;
- une preuve est liée au commit, à la configuration et au hash de son artefact ;
- un producteur ne peut pas se déclarer lui-même vérificateur ;
- les absences et résultats négatifs restent visibles dans le dossier ;
- la complétude documentaire n'est jamais une autorité de production.

## Limites

Le hash SHA-256 apporte une détection d'altération, pas une identité cryptographique ni
une preuve de véracité. L'idempotence des effets externes dépend du respect de la clé par
l'adaptateur. Les tests utilisent des adaptateurs synthétiques sans réseau. Aucune
campagne réelle, observation longitudinale ou qualification cross-platform nouvelle
n'est revendiquée par cette décision.

## Alternatives rejetées

### Déduire l'activation des suites CI existantes

Rejeté : les jobs actuels et leurs artefacts ne couvrent pas toutes les exigences et ne
sont pas automatiquement liés au dossier courant.

### Fournir un provider externe par défaut

Rejeté : cela introduirait secrets, réseau et coûts implicites, et risquerait de lancer
une campagne sans préenregistrement opérateur.

### Autoriser la production après un dossier synthétique complet

Rejeté : la cohérence d'une fixture ne démontre ni validité externe, ni sûreté de
production.

## Validation

`backend/tests/test_qualification_campaign.js` vérifie le blocage avec preuves absentes,
le refus d'une altération, la non-production avec toutes les preuves synthétiques et la
reprise idempotente sans second appel d'adaptateur.
