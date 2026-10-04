#!/usr/bin/env bash
# Records a deployment in deploy-log. Meant to be called from a CI/CD pipeline.
#
# Usage:
#   record-deploy.sh <service> <version> <environment> [status]
#
# Needs two environment variables:
#   DEPLOY_LOG_URL    e.g. http://localhost:8091
#   DEPLOY_LOG_TOKEN  the API token
#
# The commit and author are taken from Git when run inside a repository.

set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <service> <version> <environment> [status]" >&2
  exit 2
fi

: "${DEPLOY_LOG_URL:?DEPLOY_LOG_URL is not set}"
: "${DEPLOY_LOG_TOKEN:?DEPLOY_LOG_TOKEN is not set}"

service="$1"
version="$2"
environment="$3"
status="${4:-success}"
commit="$(git rev-parse --short HEAD 2>/dev/null || true)"
author="$(git log -1 --format=%an 2>/dev/null || true)"

# Escape backslashes and double quotes so the values are safe inside JSON
escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

body=$(printf '{"service":"%s","version":"%s","environment":"%s","status":"%s","commit":"%s","author":"%s"}' \
  "$(escape "$service")" "$(escape "$version")" "$(escape "$environment")" \
  "$(escape "$status")" "$(escape "$commit")" "$(escape "$author")")

code=$(curl -sS -o /tmp/deploy-log-response -w '%{http_code}' \
  -X POST "$DEPLOY_LOG_URL/api/deployments" \
  -H "Authorization: Bearer $DEPLOY_LOG_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$body")

if [ "$code" != "201" ]; then
  echo "Failed to record deployment (HTTP $code):" >&2
  cat /tmp/deploy-log-response >&2
  echo >&2
  exit 1
fi

echo "Recorded: $service $version -> $environment ($status)"
