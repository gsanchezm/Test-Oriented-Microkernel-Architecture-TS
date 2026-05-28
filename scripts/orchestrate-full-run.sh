#!/usr/bin/env bash
# One-shot local orchestration: web (desktop+responsive) + visual (desktop+responsive) + gatling,
# then merge + ingest into the dashboard. Sequential (single-tenancy lock). Mirrors
# ahm-execution-helix.yml env per phase. Continues through test failures (we want results
# captured even if some scenarios fail; retry:1 in cucumber.js absorbs cold-start flakes).
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG=".ahm-orch-logs"
mkdir -p "$LOG"
SUMMARY="$LOG/summary.log"
: > "$SUMMARY"

CUKE="./node_modules/.bin/cucumber-js"
TS="$(date +%Y-%m-%dT%H-%M)"
RUN_ID="real-$TS"

say(){ echo "[$(date +%H:%M:%S)] $*" | tee -a "$SUMMARY"; }

wait_port(){ # port
  local port="$1" i
  for i in $(seq 1 90); do
    if node -e "require('net').connect($port,'127.0.0.1').on('connect',function(){process.exit(0)}).on('error',function(){process.exit(1)})" 2>/dev/null; then
      return 0
    fi
    sleep 1
  done
  return 1
}

teardown(){ # "p1,p2,..."
  powershell.exe -NoProfile -Command "foreach(\$p in $1){ \$c=Get-NetTCPConnection -State Listen -LocalPort \$p -ErrorAction SilentlyContinue; foreach(\$x in \$c){ try{ Stop-Process -Id \$x.OwningProcess -Force -ErrorAction Stop }catch{} } }" >/dev/null 2>&1
  rm -f .ahm-run.lock
  sleep 2
}

start_web_stack(){ # viewport pixelmatch
  local vp="$1" px="$2"
  PLATFORM=web VIEWPORT="$vp" DRIVER=playwright HEADLESS=true \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/kernel/chaos-proxy.ts > "$LOG/proxy.log" 2>&1 &
  PLATFORM=web VIEWPORT="$vp" DRIVER=playwright HEADLESS=true \
    PLUGIN_PLAYWRIGHT=true PLUGIN_PIXELMATCH="$px" PLAYWRIGHT_PLUGIN_PORT=50052 PIXELMATCH_PLUGIN_PORT=50056 \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/playwright/server.ts > "$LOG/playwright.log" 2>&1 &
  PLUGIN_API=true API_PLUGIN_PORT=50055 \
    npx ts-node -r tsconfig-paths/register -r dotenv/config src/plugins/api/server.ts > "$LOG/api.log" 2>&1 &
  wait_port 50051 && wait_port 50052 && wait_port 50055
}

# ---------------- Phase B: Web Desktop (functional) ----------------
say "PHASE B — web desktop: starting stack"
if start_web_stack desktop false; then
  say "PHASE B — stack up; running cucumber @desktop"
  PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true PLUGIN_PIXELMATCH=false \
    "$CUKE" --tags "@desktop" --format json:reports/playwright-desktop.json --format progress > "$LOG/phaseB.log" 2>&1
  say "PHASE B — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phaseB.log" | tail -1))"
else
  say "PHASE B — STACK FAILED to come up (see proxy/playwright/api logs)"
fi
teardown "50051,50052,50055,50056"

# ---------------- Phase C: Web Responsive (functional) ----------------
say "PHASE C — web responsive: starting stack"
if start_web_stack responsive false; then
  say "PHASE C — stack up; running cucumber @responsive"
  PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true PLUGIN_PIXELMATCH=false \
    "$CUKE" --tags "@responsive" --format json:reports/playwright-responsive.json --format progress > "$LOG/phaseC.log" 2>&1
  say "PHASE C — cucumber exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phaseC.log" | tail -1))"
else
  say "PHASE C — STACK FAILED to come up"
fi
teardown "50051,50052,50055,50056"

# ---------------- Phase D: Visual Desktop (regen = green by construction) ----------------
say "PHASE D — visual desktop: starting stack (pixelmatch on)"
if start_web_stack desktop true; then
  say "PHASE D — stack up; running visual-regen desktop"
  PLATFORM=web VIEWPORT=desktop DRIVER=playwright HEADLESS=true \
    node scripts/visual-regen.js desktop > "$LOG/phaseD.log" 2>&1
  say "PHASE D — visual-regen exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phaseD.log" | tail -1))"
else
  say "PHASE D — STACK FAILED to come up"
fi
teardown "50051,50052,50055,50056"

# ---------------- Phase E: Visual Responsive ----------------
say "PHASE E — visual responsive: starting stack (pixelmatch on)"
if start_web_stack responsive true; then
  say "PHASE E — stack up; running visual-regen responsive"
  PLATFORM=web VIEWPORT=responsive DRIVER=playwright HEADLESS=true \
    node scripts/visual-regen.js responsive > "$LOG/phaseE.log" 2>&1
  say "PHASE E — visual-regen exit=$? ($(grep -aoE '[0-9]+ scenarios \([^)]*\)' "$LOG/phaseE.log" | tail -1))"
else
  say "PHASE E — STACK FAILED to come up"
fi
teardown "50051,50052,50055,50056"

# ---------------- Phase F: Gatling (smoke, both simulations — standalone, no proxy) ----------------
say "PHASE F — gatling smoke: checkout-load"
PERF_PROFILE=smoke pnpm perf:smoke > "$LOG/phaseF-checkout.log" 2>&1
say "PHASE F — checkout-load exit=$?"
say "PHASE F — gatling smoke: invalid-login-load"
PERF_PROFILE=smoke pnpm perf:login-invalid:smoke > "$LOG/phaseF-login.log" 2>&1
say "PHASE F — invalid-login-load exit=$?"

# ---------------- Ingest ----------------
# No merge needed: the dashboard ingest (ingest-run.ts) now reads
# reports/playwright-<viewport>.json directly as viewport blocks and they take
# precedence over a flat reports/playwright.json. Remove any stale flat file so
# the per-viewport files are used unambiguously.
rm -f reports/playwright.json

say "INGEST — dashboard ingest as run-id $RUN_ID"
PROJECT="AHM" pnpm dashboard:ingest --run-id "$RUN_ID" > "$LOG/ingest.log" 2>&1
say "INGEST — exit=$?"
tail -12 "$LOG/ingest.log" | tee -a "$SUMMARY"

say "DONE — run-id: $RUN_ID"
