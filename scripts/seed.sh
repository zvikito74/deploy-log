#!/usr/bin/env bash
# Fills deploy-log with a few example deployments so the dashboard has something to show.
# Usage: DEPLOY_LOG_URL=http://localhost:8091 DEPLOY_LOG_TOKEN=... bash scripts/seed.sh

set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
record() { bash "$here/record-deploy.sh" "$@"; }

record payments-api 2.3.0 dev
record payments-api 2.3.0 staging
record payments-api 2.2.4 prod
record storefront   5.1.0 dev
record storefront   5.1.0 staging
record storefront   5.0.2 prod
record search       0.9.1 dev
record search       0.9.0 staging failed
record notifier     1.4.0 dev
record notifier     1.4.0 staging in_progress
record payments-api 2.3.1 dev
record storefront   5.1.0 prod rolled_back
