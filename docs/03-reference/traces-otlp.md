# Traces OTLP des missions et workers

Le backend peut envoyer certains événements déjà persistés vers
OpenTelemetry Collector. Définir GENOS_OTLP_TRACES_ENDPOINT avec une URL HTTPS
terminée par /v1/traces, ou une URL HTTP vers localhost/127.0.0.1 sur ce
chemin. L'absence de variable désactive l'export. Un sel secret stable dans
GENOS_OTEL_HASH_SALT conserve les mêmes condensats entre redémarrages.

Les types exportés sont AGENT_STARTED, AGENT_COMPLETED, AGENT_FAILED,
EVIDENCE_REPORT, TOOL_CALL_COMPLETED, TOKEN_ROUND_EVALUATED et
TOKEN_ROUND_FAILED. Les seuls attributs possibles sont les condensats de
session et d'agent, un état et une gravité énumérés, des nombres bornés de
tokens et de coût, et l'issue rapportée par EVIDENCE_REPORT. Cette issue est
une déclaration, pas une preuve vérifiée.

La configuration exemple est dans
integrations/opentelemetry/collector.yaml. Elle reçoit OTLP/HTTP sur
127.0.0.1:4318 et supprime les attributs hors liste avant de les afficher.
Elle nécessite une distribution Collector avec le processeur redaction.
Pour une exploitation distante, remplacer l'exporteur debug par la
destination approuvée.

Le test backend/tests/test_telemetry_otlp_bridge.js vérifie les attributs,
l'absence de secrets dans le corps OTLP, le transport vers un serveur local
et la préservation de la persistance lorsque l'export échoue. Le test ne
démarre pas un vrai binaire Collector. Les reçus GenOS restent la source
de vérité.

Voir [ADR 0329](../adr/0329-traces-otlp-apres-persistance.md).