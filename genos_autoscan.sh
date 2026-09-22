#!/usr/bin/env bash
set -euo pipefail

BACKEND_TOKEN="genos-scan-2026-key"
BACKEND_URL="http://localhost:4000"
TIMESTAMP="$(date -u +'%FT%TZ')"
HOST="$(hostname 2>/dev/null || echo unknown)"
REPO="C:/Users/Shadow/Documents/GitHub/GenOS"

info() { echo "[INFO] $*"; }

cd "$REPO"

# 1. Health backend
HEALTH_OK=false
# health endpoints sont publics — appel SANS token
curl -fsS "$BACKEND_URL/healthz" -o /dev/null 2>/dev/null && HEALTH_OK=true && info "healthz OK" || info "healthz FAIL"
curl -fsS "$BACKEND_URL/readyz" -o /dev/null 2>/dev/null && info "readyz OK" || info "readyz FAIL"
curl -fsS "$BACKEND_URL/livez" -o /dev/null 2>/dev/null && info "livez OK" || info "livez FAIL"

$HEALTH_OK || { info "BACKEND NON SAIN"; exit 2; }

# 2. Organization state via orchestrateur
ORG_STATE=$(node backend/bin/genos-orchestrate.cjs '{"action":"organization_state"}' 2>/dev/null) || true
[ -z "$ORG_STATE" ] && { info "organisation_state vide"; exit 3; }
echo "$ORG_STATE" | jq -e '. || empty' >/dev/null 2>&1 || { info "ORG_STATE malforme: $ORG_STATE"; exit 4; }
info "organisation_state : $(echo "$ORG_STATE" | jq -c '{organization, version}')"

# 3. Worker inbox
INBOX=$(node backend/bin/genos-orchestrate.cjs '{"action":"worker_inbox","limit":1000}' 2>/dev/null) || true
[ -z "$INBOX" ] && { info "inbox vide ou indisponible"; exit 3; }
echo "$INBOX" | jq -e '. || empty' >/dev/null 2>&1 || { info "INBOX malforme: $INBOX"; exit 4; }

UNREAD=$(echo "$INBOX" | jq '[.messages[]? | select(.read==false)] | length' 2>/dev/null || echo 0)
info "Total messages: $(echo "$INBOX" | jq '.messages|length') — non lus: $UNREAD"

# 4. Triage si necessaire
if [ "$UNREAD" -gt 0 ]; then
  info "Boite non vide — lancement triage worker_inbox_triage"
  node backend/bin/genos-orchestrate.cjs '{"mission":"worker_inbox_triage","action":"orchestrate","background":true}' &
  echo "{\"scan_time\":\"$TIMESTAMP\",\"host\":\"$HOST\",\"health\":{\"healthz\":$HEALTH_OK},\"org_state\":$ORG_STATE,\"unread_count\":$UNREAD,\"action\":\"triage_dispatched\"}"
else
  info "Tout clair"
  echo "{\"scan_time\":\"$TIMESTAMP\",\"host\":\"$HOST\",\"health\":{\"healthz\":$HEALTH_OK},\"org_state\":$ORG_STATE,\"unread_count\":0,\"action\":\"tout_clair\"}"
fi
