# DNA Methylation (Méthylation)

La méthylation empêche le LLM d'écrire des tests tautologiques du type `Bug == Bug`.

## Principe
Lorsqu'un agent écrit un test qui génère dynamiquement la variable attendue (`expected`) de la même manière que la variable testée (`actual`), le test passera toujours au vert même si le code métier est cassé, car l'erreur est symétrique. En biologie, la méthylation marque le brin d'ADN "original" avec un groupe méthyle pour qu'en cas de mismatch, la protéine de réparation sache qui a raison.

L'Orchestrateur Anthony applique ce concept : les tests doivent comparer les résultats à une `Source of Truth` immuable et "méthylée" par le framework. L'agent ne peut pas regénérer cette source de vérité à la volée.
