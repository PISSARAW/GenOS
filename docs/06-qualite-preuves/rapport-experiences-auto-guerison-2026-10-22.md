# Résultats des expériences d’auto-guérison — 2026-10-22

- **Révision testée** : `7cbd86a86d421787d5e543814e861a6ff31d5208`
- **Environnement** : exécution locale Windows, dépôt `GenOS`, Node.js installé
- **Verdict** : six tests ciblés réussis ; auto-guérison autonome sur lésion inconnue non démontrée
- **Portée** : résultats des commandes lancées le 22 octobre 2026. Aucun résultat de terrain ou de VM Hyper-V n’est revendiqué.

## Exécutions

Chaque commande ci-dessous a été exécutée depuis la racine du dépôt. Toutes ont terminé avec le code de sortie 0.

| Expérience | Résultat observé | Ce que cela établit |
| --- | --- | --- |
| `node backend/tests/test_shev_healing_contract.js` | Réussi : phases durables, preuves et protection terminale | Contrat SHEV testé |
| `node backend/tests/test_shev_healing_integration.js` | Réussi : tick, Ontogenesis, effet, suivi longitudinal | Intégration et machine d’états testées ; les fonctions `verify` de cette expérience renvoient des résultats préfabriqués |
| `node backend/tests/test_physiological_arc_closed_loop.js` | Réussi : quatre connexions physiologiques annoncées | Fermeture de boucle dans le banc d’essai |
| `node backend/tests/test_sre_healing_policy.js` | Réussi : 10 tests, 0 échec | Politique d’autorisation, abstention, contre-vérification et rollback demandés testés |
| `node backend/tests/test_sre_healing_store.js` | Réussi : 3 tests, 0 échec | Persistance, transitions liées et concurrence optimiste testées |
| `node backend/tests/test_security_qualification_lab.js` | Réussi : `PASS test_security_qualification_lab` | Corpus et classification, y compris l’échec d’overclaim, exécutés ; le scénario SHRE est l’adaptateur isolé décrit ci-dessous |

Les sorties exactes des quatre premiers tests sont résumées par leurs messages de réussite ci-dessus ; les deux suites Node affichent respectivement `10 pass / 0 fail` et `3 pass / 0 fail`.

## Expérience SHRE observée dans le laboratoire

`test_security_qualification_lab.js` appelle réellement `qualifyShreIsolatedVmCycle`. Le cycle écrit un fichier `test-vm-state.json` dans un répertoire temporaire, applique `networkIsolation=true` et `rdpEnabled=false`, vérifie l’état, puis restaure la sauvegarde. Les assertions vérifient `stateMutatedOnApply=true`, `causalVerificationStatus=PASS` et `exactRollbackVerified=true`. Le reçu est donc une preuve de mutation et de restauration d’un artefact local.

L’inspection de `backend/src/services/cyberCorpActionGateway/cyberCorpActuators.js` établit aussi les limites : l’état cible est un JSON, `simulate` retourne un résultat fabriqué par l’adaptateur, et `createIsolatedVmIndependentVerifiers` construit le contre-test et le vérificateur causal dans le même module avec des réponses déterminées par l’état JSON. L’identifiant `env:hyperv-isolated-sandbox-01` est une valeur déclarée par cette simulation ; aucune connexion Hyper-V n’est effectuée. Cela ne démontre donc ni une réparation sur une VM réelle, ni une vérification indépendante réelle.

## Échec de qualification SH-001

**Critère** : une lésion cachée et inconnue est diagnostiquée puis réparée par GenOS sans guidage, avec un oracle indépendant sur le système modifié.

**Verdict** : non démontré dans cette exécution. Aucun runner SH-001 avec défaut inconnu, bras témoin, agent réparateur autonome et oracle distinct n’a été lancé. Les six tests ciblés sont des tests locaux déterministes ; ils ne satisfont pas ce critère. Aucun défaut d’implémentation n’a été révélé par ces six exécutions, donc aucun correctif de code n’a été appliqué.

La procédure de répétition accélérée SHEV (`docs/04-exploitation/repetition-generale-campagne-terrain-shev.md`) indique elle-même qu’aucune répétition n’y est rapportée et requiert deux workspaces jetables, un manifeste scellé, une archive et huit injections de panne. La campagne terrain mentionnée dans `docs/04-exploitation/executer-campagne-terrain-shev.md` exige au moins 72 heures. Ni cette répétition complète ni une nouvelle qualification de terrain n’ont été exécutées ici.

## Conclusion

Les expériences établissent que plusieurs mécanismes de guérison ont des tests locaux qui passent, et que le cycle SHRE peut muter et restaurer un fichier sandbox avec contrôle d’empreinte. Elles n’établissent pas l’auto-guérison autonome, causale, indépendante et durable d’une lésion inconnue. Le résultat négatif de qualification doit rester attaché aux succès techniques : annoncer une guérison générale sur cette base serait un overclaim.
