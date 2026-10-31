# Limites natives et essais sans changement

Un budget de zéro changement de stratégie autorise des essais conservant tous
la même stratégie. Le test de frontières vérifie cette réussite avec les deux
essais `controlled_probe`, puis refuse une stratégie non implémentée et un
nombre d'essais dépassant `maxIterations`.

Le runtime ne prétend pas exécuter d'autres stratégies dans `adapt_procedure`.
Ses contrôles d'entrée et de budget restent inchangés ; seule l'attente erronée
du test est corrigée.

Le cas de benchmark `adaptive-probes` exécute deux essais LPT contrôlés. Il ne
revendique plus un changement de stratégie non implémenté. Le test indépendant
refuse explicitement l'ancien essai `causal_bisection` et continue de détecter
les preuves altérées dans les huit familles de workers.
