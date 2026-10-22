# ADR 0722 — Security Homeostatic Recovery Engine

## Statut

Accepté pour l'implémentation initiale.

## Contexte

Les campagnes de remédiation existantes évaluent des corrections en environnements isolés et produisent des recommandations sans autoriser leur promotion. SHRE ajoute un parcours traçable pour restaurer la posture d'un actif, avec contre-test et rollback explicites.

## Décision

Chaque dossier SHRE suit l'ordre strict : diagnostic avec preuves, cause probable et incertitude; plan minimal avec impact et rollback; simulation isolée; décision d'autorisation; application; contre-test indépendant; clôture ou rollback. Les transitions sont persistées par organisation et projet dans `adaptive_state`. Chaque étape ajoute sa décision et ses références de preuve à la chronologie.

La politique d'autorisation est déterministe. Un risque supérieur à 0,25 mesuré par la simulation, une incertitude diagnostique supérieure à 0,5 ou un impact prévu ou simulé autre que faible exige une approbation d'un opérateur différent de l'auteur du diagnostic. L'autorisation crée un permis limité à la ressource, à usage unique et valable cinq minutes. L'actionneur doit confirmer l'application et la consommation du permis.

Les actionneurs sont des adaptateurs spécialisés enregistrés par le runtime; leur contrat exige `simulate`, `apply` et `rollback`. Un vérificateur distinct est enregistré séparément et porte le contre-test. L'absence d'actionneur, de vérificateur indépendant, d'isolation attestée, de preuve ou de permission valide bloque le parcours. La simulation doit utiliser une copie sans réseau et le même digest source que le diagnostic. Le contre-test doit confirmer l'effet, son attribution au changement et l'absence de régression. Un échec impose le rollback avant la clôture.

## Conséquences

- L'API HTTP expose le workflow avec les contrôles `security:manage`, `read` et la portée tenant existants.
- Aucun actionneur de production n'est présumé disponible; chaque intégration doit fournir et enregistrer son adaptateur.
- La consommation atomique du permis à usage unique relève de l'actionneur spécialisé afin de prévenir les doubles applications concurrentes. Le workflow persiste l'état avant l'appel d'application; une réponse perdue mène à `APPLICATION_UNCERTAIN`, qui ne peut avancer que vers contre-test ou rollback.
- Un dossier peut être abandonné et clôturé avant application si le diagnostic, le plan ou la simulation invalide la correction; les preuves disponibles et la raison sont archivées.
- La décision de clôture et le rollback ne prouvent pas à eux seuls la restauration; les reçus de l'actionneur et les contre-tests restent les éléments de preuve.

## Vérification

Le parcours n'affirme pas de guérison tant que l'application et le contre-test ne sont pas confirmés par l'actionneur. Aucun benchmark SHRE n'est fourni dans cette implémentation.
