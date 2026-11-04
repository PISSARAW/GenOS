# Délai HTTP du modèle aligné sur le délai autorisé

- **Statut** : Implémenté — tests de transport ; qualification rédactionnelle séparée.
- **Dernière revue** : 2026-11-04.

## Contexte

La tentative 10 du Dernier Sas s'arrête pendant la deuxième scène après
317,275 secondes avec `fetch failed`, puis OMEGA exige une récupération.
L'usage de cet appel est inconnu et aucun livrable n'est accepté. La trace ne
conserve pas la cause réseau interne : une panne indépendante d'Ollama reste
possible et n'est pas exclue par le correctif.

Le code de `fetch` embarqué fixe toutefois ses délais d'en-tête et de corps à
300 000 ms par défaut, alors que le contrat GQEL autorise ici 600 000 ms. Un
serveur HTTP local à réponse retardée reproduit le défaut : le délai du
dispatcher global interrompt un appel avant son délai explicitement demandé.
Le test échoue avant correction avec `UND_ERR_HEADERS_TIMEOUT`.

## Décision

Le transport transmet le délai de l'appel dans les options `headersTimeout`
et `bodyTimeout` de chaque dispatch. Il délègue au dispatcher global configuré,
dont le routage et les connexions restent utilisés. Il ne remplace ni ne ferme
ce dispatcher. `undici` 6.29.0, déjà présent comme dépendance optionnelle,
devient une dépendance explicite pour accéder à cette API.

Le timer absolu et le signal d'annulation de `generateDirect` restent actifs.
Le plafond de l'appel, les budgets natifs et l'autorité parent ne sont pas
prolongés. Aucune requête n'est réessayée par ce transport. Les codes de cause
`UND_ERR_*` sont conservés dans le message diagnostique ; ils ne fabriquent ni
tokens mesurés ni preuve d'une exécution terminée.

## Conséquences et vérification

`test_model_provider_deadline.cjs` vérifie par HTTP réel des réponses retardées
avant les en-têtes et pendant le corps, sous un dispatcher global au délai
court. Le fournisseur reçoit ses délais autorisés, conserve les compteurs du
serveur de test et passe toujours par le dispatcher configuré. Un délai
explicite de 100 ms et une annulation restent des refus. Ce serveur simule le
protocole fournisseur ; il ne mesure aucun LLM ni aucune qualité artistique.

Les tests d'échantillonnage Ollama, d'annulation, SSE et d'enveloppe native
restent applicables. Le chemin spécialisé OpenAI Responses n'est pas modifié.
Les tentatives précédentes conservent leur exposition inconnue. Une mission
neuve est nécessaire pour mesurer le comportement après correction.

## Alternatives

- Modifier le dispatcher global : effets sur les autres requêtes et leur routage.
- Supprimer tout délai HTTP : limite explicite de l'appel moins lisible au transport.
- Accepter une réponse sans fin ni compteurs : rejeté par les gates de métrologie.
