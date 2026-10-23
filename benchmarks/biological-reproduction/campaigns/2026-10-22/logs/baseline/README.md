# Échecs de référence avant correction

- `chimeric-unsupported-cli-feature.log`: avec lease et credentials de test, le handler retourne `Unknown biomimicry feature 'chimeric_merge'` alors que l’action est documentée comme simulation de métadonnées.
- `mcp-unknown-feature-status.log`: avec un lease limité aux 19 outils, le premier dispatch `thalamic_bridge` échoue car le CLI ne connaît pas la feature. Le test n’atteignait pas son contrat de status backend.
- `chimeric-missing-test-password.log`: exécution initiale sans `GENOS_ADMIN_PASSWORD` échouée au bootstrap; cette erreur d’environnement n’était pas un défaut du mécanisme chimérique. Les exécutions finales utilisent une valeur de test process-only.

Une tentative après suppression du probe a ensuite exposé deux défauts du fixture/lecteur : références sans lignes `agents` (contrainte FK), puis tri sur `created_at` absent. Le fixture et le service SQL ont été corrigés; le test chimérique final passe.