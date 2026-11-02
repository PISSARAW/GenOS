# ALLOSTASIE dans les missions

Le runtime réduit avant scellement le délai d'un worker à 95 % de son budget
temporel natif ; 5 % restent protégés et non allouables. Avant le premier effet,
le vrai parent et son incarnation d'exécution servent de régulateur :
`REPORT_STATE → FORECAST_NEED → REQUEST_BUDGET → GRANT`, puis exposition durable.
Une réutilisation de la même exposition bloque tout nouveau dispatch.
Le verrou transactionnel de la base de contrôle englobe admission, exposition et
prise de démarrage : deux appelants concurrents ne peuvent pas démarrer deux fois.

Le profil `mission.sealedBudget/v1` est une source de configuration authentifiée
par l'enveloppe native. Il distingue ce plafond exact d'une prévision de viabilité
AGOW : `nativeAssessment.available` vaut explicitement faux. La demande temporelle
reste déclarée. Le profil AGOW existant et son qualificateur restent distincts.

Le temps mur est mesuré par l'horloge monotone du contrôle plane, jusqu'au retour
du worker en processus ou à l'arrêt observé du processus enfant. Il inclut les
attentes ; il ne représente ni du temps CPU ni une facture fournisseur. Un arrêt
sans compteur monotone retrouvé après redémarrage produit une consommation
inconnue et conserve l'exposition. La reprise ne transforme jamais cette absence
de mesure en zéro. Seule une mesure finale libère la part inutilisée.
Un reçu final déjà persisté est relu après une coupure avant son accusé ; il ne
produit aucun second débit. Le règlement utilise l'identité historique du parent,
même si ce parent a changé d'incarnation ou si le délai de travail a expiré.
Une admission interrompue avant exposition reprend son allocation existante.

Les journaux SQLite par run conservent allocations, consommation et mesure native
associée. Les compteurs ne remboursent pas le travail consommé. Les plafonds de
tokens/coût et les contrôles d'autorité natifs continuent de s'appliquer séparément.
Une mission sans parent réel n'invente pas un régulateur : ce dialogue est alors
hors périmètre, avec un motif explicite.

Vérification : `node backend/tests/test_mission_protocols_allostasis.js`.
