# OpenTelemetry Collector bridge

Run a Collector distribution that includes the redaction processor with
collector.yaml. Configure the backend with:

    GENOS_OTLP_TRACES_ENDPOINT=http://127.0.0.1:4318/v1/traces

For correlation across backend restarts, also set a stable secret
GENOS_OTEL_HASH_SALT. Without it, IDs are hashed with a process-local salt.

The bridge observes only events after GenOS persists them. Spans carry an
allowlist of counters and hashed identifiers. Prompts, tool outputs, event
details and evidence content are never copied into span attributes. The
Collector redaction processor is a second boundary. Debug export is for local
inspection; configure an approved exporter for deployment.

The telemetry event table and evidence receipts remain authoritative.