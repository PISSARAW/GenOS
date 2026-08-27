# Immune Key Compression

La compression immunitaire (Immune Key Compression) s'inspire du système immunitaire pour mémoriser les erreurs de manière ultra-compacte.

## Principe
Le système immunitaire ne stocke pas le cadavre entier d'un virus après l'avoir combattu. Il génère un anticorps, une clé géométrique (signature) extrêmement compacte. Si cette signature est détectée à nouveau, la réponse est immédiate.

Dans GenOS, lorsqu'un agent rencontre une erreur de 200 lignes (stack trace), l'Orchestrateur Anthony la compresse en une "ImmuneSignature" (un hash court accompagné de la première ligne d'erreur). Au lieu de polluer son contexte avec la stack trace complète à chaque tentative de résolution, l'agent utilise l'ImmuneSignature comme clé pour savoir s'il tourne en rond sur la même erreur (Load-bearing error) ou s'il avance.
