#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
NODE="${PROJECT_ROOT}/.tools/node/bin/node"
RUNTIME_ROOT="${PROJECT_ROOT}/.runtime/benchmark"

reset_runtime() {
  [[ "${1:-}" == "--confirm-reset" ]] || { echo "reset requires --confirm-reset" >&2; return 2; }
  "${SCRIPT_DIR}/network.sh" stop || true
  local resolved parent
  parent="$(realpath "${PROJECT_ROOT}/.runtime")"
  if [[ -e "${RUNTIME_ROOT}" ]]; then resolved="$(realpath "${RUNTIME_ROOT}")"; else resolved="${parent}/benchmark"; fi
  [[ "${resolved}" == "${PROJECT_ROOT}/.runtime/benchmark" ]] || { echo "Refusing unsafe reset target: ${resolved}" >&2; return 1; }
  rm -rf -- "${resolved}"
  echo "Removed disposable benchmark runtime ${resolved}"
}

case "${1:-}" in
  preflight) exec "${NODE}" "${SCRIPT_DIR}/preflight.mjs" ;;
  start) exec "${SCRIPT_DIR}/network.sh" start ;;
  status) exec "${SCRIPT_DIR}/network.sh" status ;;
  stop) exec "${SCRIPT_DIR}/network.sh" stop ;;
  reset) reset_runtime "${2:-}" ;;
  matrix) exec "${NODE}" "${SCRIPT_DIR}/workloads/run-matrix.mjs" ;;
  faults)
    "${SCRIPT_DIR}/network.sh" start
    "${NODE}" "${SCRIPT_DIR}/faults.mjs"
    ;;
  audit)
    "${SCRIPT_DIR}/network.sh" start
    "${NODE}" "${SCRIPT_DIR}/environment.mjs" after
    "${NODE}" "${SCRIPT_DIR}/audit-ledger.mjs"
    ;;
  aggregate) exec "${NODE}" "${SCRIPT_DIR}/aggregate.mjs" ;;
  validate) exec "${NODE}" "${SCRIPT_DIR}/validate-evidence.mjs" ;;
  smoke)
    export BENCHMARK_WARMUP_SECONDS=0 BENCHMARK_SAMPLE_SECONDS=1 BENCHMARK_REPEATS=1
    export BENCHMARK_CONCURRENCIES=1 BENCHMARK_VARIANTS=public-verify,student-private,issue-review,batch-1,batch-10,batch-25,batch-50
    "${SCRIPT_DIR}/network.sh" start
    "${NODE}" "${SCRIPT_DIR}/environment.mjs" before
    "${NODE}" "${SCRIPT_DIR}/workloads/run-matrix.mjs"
    "${NODE}" "${SCRIPT_DIR}/aggregate.mjs"
    "${NODE}" "${SCRIPT_DIR}/validate-evidence.mjs"
    "${NODE}" "${SCRIPT_DIR}/privacy-check.mjs"
    ;;
  fault-smoke)
    export BENCHMARK_FAULT_HEALTHY_SECONDS=1 BENCHMARK_FAULT_OUTAGE_SECONDS=2 BENCHMARK_FAULT_RECOVERY_SECONDS=30
    "${SCRIPT_DIR}/network.sh" start
    "${NODE}" "${SCRIPT_DIR}/faults.mjs"
    ;;
  all)
    "${NODE}" "${SCRIPT_DIR}/preflight.mjs"
    "${SCRIPT_DIR}/network.sh" start
    "${NODE}" "${SCRIPT_DIR}/environment.mjs" before
    "${NODE}" "${SCRIPT_DIR}/workloads/run-matrix.mjs"
    "${NODE}" "${SCRIPT_DIR}/faults.mjs"
    "${NODE}" "${SCRIPT_DIR}/environment.mjs" after
    "${NODE}" "${SCRIPT_DIR}/audit-ledger.mjs"
    "${NODE}" "${SCRIPT_DIR}/aggregate.mjs"
    "${NODE}" "${SCRIPT_DIR}/privacy-check.mjs"
    ;;
  *) echo "Usage: $0 {preflight|start|status|stop|reset --confirm-reset|matrix|faults|audit|aggregate|validate|smoke|fault-smoke|all}" >&2; exit 2 ;;
esac
