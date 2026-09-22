#!/usr/bin/env bash
set -euo pipefail

BACKEND_TOKEN="genos-scan-2026-key"
BACKEND_URL="http://localhost:4000"
TIMESTAMP="$(date -u +'%FT%TZ')"
HOST="$(hostname 2>/dev/null || echo unknown)"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="C:/Users/Shadow/Documents/GitHub/GenOS"

info() { echo "[INFO] $*"; }

# Health checks via Node (remplace curl MSYS bogué avec -o /dev/null)
HEALTH_OK=$(node "$SCRIPT_DIR/backend/genos_health_check.js" 2>/dev/null) || { info "BACKEND NON SAIN"; exit 2; }
info "healthz/readyz/livez OK"

# Organisation state
ORG_STATE=$(node "$REPO/backend/bin/genos-orchestrate.cjs" '{"action":"organization_state"}' 2>/dev/null) || true
if [ -z "$ORG_STATE" ]; then
  info "organisation_state vide"
  exit 3
fi

# Validation JSON via script dédié
VALID=$(node -e "
const d = JSON.parse(process.argv[1]);
if (!d || typeof d !== 'object') process.exit(4);
process.exit(0);
" "$ORG_STATE" 2>/dev/null) || {
  info "ORG_STATE malforme: $ORG_STATE"
  exit 4
}

info "organisation_state : $(node -e "
const d = JSON.parse(process.argv[1]);
console.log(JSON.stringify({organization: d.organization, version: d.version}));
" "$ORG_STATE")"

# Worker inbox
INBOX=$(node "$REPO/backend/bin/genos-orchestrate.cjs" '{"action":"worker_inbox","limit":1000}' 2>/dev/null) || true
if [ -z "$INBOX" ]; then
  info "inbox vide ou indisponible"
  exit 3
fi

VALID=$(node -e "
const d = JSON.parse(process.argv[1]);
if (!d || typeof d !== 'object') process.exit(4);
process.exit(0);
" "$INBOX" 2>/dev/null) || {
  info "INBOX malforme: $INBOX"
  exit 4
}

# Nombre de messages non lus
UNREAD=$(node -e "
const d = JSON.parse(process.argv[1]);
const msgs = Array.isArray(d.messages) ? d.messages : [];
const unread = msgs.filter(m => m && m.read === false).length;
console.log(unread);
" "$INBOX")

TOTAL=$(node -e "
const d = JSON.parse(process.argv[1]);
const msgs = Array.isArray(d.messages) ? d.messages : [];
console.log(msgs.length);
" "$INBOX")

info "Total messages: $TOTAL — non lus: $UNREAD"

# Résultat final + triage si nécessaire
if [ "$UNREAD" -gt 0 ]; then
  info "Boîte non vide — lancement triage worker_inbox_triage"
  node "$REPO/backend/bin/genos-orchestrate.cjs" '{"mission":"worker_inbox_triage","action":"orchestrate","background":true}' &
  echo "{\"scan_time\":\"$TIMESTAMP\",\"host\":\"$HOST\",\"health\":{\"probes\":$HEALTH_OK},\"org_state\":$ORG_STATE,\"unread_count\":$UNREAD,\"action\":\"triage_dispatched\"}"
else
  info "Tout clair"
  echo "{\"scan_time\":\"$TIMESTAMP\",\"host\":\"$HOST\",\"health\":{\"probes\":$HEALTH_OK},\"org_state\":$ORG_STATE,\"unread_count\":0,\"action\":\"tout_clair\"}"
fi
