# ADR 0325 — Régénération Axolotl avec admission exécutable

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : Régénération, cognition, plasticité
- **Décideurs** : Mainteneurs GenOS.
- **Lié à** : [Concept Axolotl](../01-concepts/biomimetisme/axolotl.md), [ADR 0183](0183-regeneration-axolotl-bornee.md), [Référence Axolotl](../03-reference/axolotl-regeneration.md).

## Contexte

Le premier parcours confondait contrôles structurels et équivalence fonctionnelle.
Un démarrage de mission ne fournissait pas de preuve de résultat. Les maps
exportées ne réhydrataient pas les registres internes, et la reconstruction
partielle pouvait inverser les frontières du graphe.

## Décision

La régénération dispose d'un état SQLite versionné par orchestrateur. Un contrat
de rôles, de routage et de rappel cognitif est fixé avant toute expérience.
Un worker déterministe exécute ces probes sur une copie de la topologie, sans
code utilisateur, outils ni credentials du parent. Une transaction adopte le
résultat uniquement si les probes passent et si la version source est encore
courante. Les preuves lient session, contrat, topologie et exécution.

Les remplacements ciblés conservent les rôles, métadonnées des frontières et
composants sains. Le rollback refuse d'écraser une génération ultérieure.
La cognition, le régulateur de métamorphose et la comptabilité utilisent la
même frontière d'admission. Les primitives restent soumises aux leases du
pipeline existant.

## Conséquences

### Positives

- Aucun succès issu du seul transport ou d'une simple forme de graphe.
- Reprise sur SQLite, protection contre les doubles adoptions et conflits.
- Preuves conservées des probes exécutées, incluant les échecs.

### Négatives

- Un contrat incomplet ne prouve pas des comportements non couverts.
- Le worker valide le runtime de routage/rappel Axolotl. Il ne certifie pas
  une mission LLM arbitraire ni la vérité générale d'un énoncé sémantique.
- Une adoption métier supplémentaire exige ses propres gates.

## Alternatives

Conserver les callbacks clients et déduire le succès du lancement d'un worker
a été rejeté : aucun de ces événements n'établit l'équivalence fonctionnelle.
## Raccordement opérationnel

Les primitives sont enregistrées dans le dispatch existant et partagent le
contexte du pipeline de stratégie. La composition biologique utilise la
topologie admise. Les messages sont persistants, adressés par identité logique
et consommés atomiquement, y compris après un remplacement de composants.
Une mise en file ne prouve pas leur traitement par un agent métier.

La reconstruction cognitive est limitée aux clés du contrat et aux mémoires
non purgées du parent. Les essais ne doivent pas régresser sur une probe déjà
réussie. La promotion L0 contrôle les preuves de l’essai et de l’admission finale ;
le rollback révoque ces traits et protège les générations ultérieures.

La métamorphose requiert des observations natives distinctes, un budget et une
temporisation. Son gel est contrôlé aussi dans le service d’organisation
dynamique. Le coût porte sur les événements, la durée et les modifications
observées ; les unités absentes ne sont pas remplacées par zéro. Une comparaison
stable/plastique exige des échantillons sous un même contrat et reste descriptive.

Le sélecteur privilégie Axolotl pour une panne structurelle. Il refuse de
sélectionner artificiellement une stratégie inéligible lorsque toutes les
contraintes échouent. Les changements du workspace parent invalident l’accès
aux anciennes sessions et à leur topologie.

## Vérification exécutable

`npm --prefix backend run test:axolotl` couvre huit suites : régénération
partielle, apprentissage, sources cognitives, métamorphose, coût, sélection,
runtime et reprise. Les tests utilisent SQLite et des workers réels, avec des
contrats épinglés, des cas de concurrence, de preuves altérées et de budgets
épuisés. Le test de dispatch possède sa propre base de contrôle temporaire.
La suite Axolotl est également incluse dans la chaîne de tests par défaut du backend.
La suite Axolotl est également incluse dans la chaîne de tests par défaut du backend.
