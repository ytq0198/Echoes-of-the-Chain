#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
RUNTIME_ROOT="${PROJECT_ROOT}/.runtime/preview"
PID_ROOT="${RUNTIME_ROOT}/pids"
LOG_ROOT="${RUNTIME_ROOT}/logs"
NODE_BIN="${PROJECT_ROOT}/.tools/node/bin/node"
COREPACK_BIN="${PROJECT_ROOT}/.tools/node/bin/corepack"
ENV_FILE="${CHAINGRADE_PREVIEW_ENV:-${PROJECT_ROOT}/.runtime/private/preview.env}"

mkdir -p "${PID_ROOT}" "${LOG_ROOT}"

is_running() {
  local name="$1"
  local pid_file="${PID_ROOT}/${name}.pid"
  [[ -s "${pid_file}" ]] && kill -0 "$(cat "${pid_file}")" 2>/dev/null
}

assert_managed_pid() {
  local name="$1"
  local pid
  pid="$(cat "${PID_ROOT}/${name}.pid")"
  [[ -r "/proc/${pid}/cmdline" ]] || return 1
  tr '\0' ' ' <"/proc/${pid}/cmdline" | grep -Fq -- "${PROJECT_ROOT}"
}

wait_http() {
  local url="$1"
  local name="$2"
  for _ in $(seq 1 60); do
    if curl --fail --silent --max-time 2 "${url}" >/dev/null; then
      echo "READY ${name} ${url}"
      return 0
    fi
    sleep 1
  done
  echo "${name} did not become ready; inspect ${LOG_ROOT}" >&2
  return 1
}

require_private_env() {
  [[ -f "${ENV_FILE}" ]] || {
    echo "Missing private preview environment: ${ENV_FILE}" >&2
    echo "Create it from deliverables/demo/preview.env.example and chmod 600 it." >&2
    return 1
  }
  local mode
  mode="$(stat -c '%a' "${ENV_FILE}")"
  [[ "${mode}" == "600" || "${mode}" == "400" ]] || {
    echo "Refusing environment file with mode ${mode}; expected 600 or 400: ${ENV_FILE}" >&2
    return 1
  }
  # The file is deliberately outside Git and is treated as trusted shell input.
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  local key
  for key in AUTH_SESSION_SECRET AUTH_ISSUER_PASSWORD AUTH_REVIEWER_PASSWORD AUTH_STUDENT_PASSWORD; do
    [[ -n "${!key:-}" && "${!key}" != replace-* ]] || {
      echo "Required secret ${key} is missing or still uses a placeholder" >&2
      return 1
    }
  done
  [[ "${#AUTH_SESSION_SECRET}" -ge 32 ]] || {
    echo "AUTH_SESSION_SECRET must contain at least 32 characters" >&2
    return 1
  }
  export AUTH_SESSION_SECRET AUTH_ISSUER_PASSWORD AUTH_REVIEWER_PASSWORD AUTH_STUDENT_PASSWORD
  export AUTH_ISSUER_USERNAME="${AUTH_ISSUER_USERNAME:-demo-issuer}"
  export AUTH_REVIEWER_USERNAME="${AUTH_REVIEWER_USERNAME:-demo-reviewer}"
  export AUTH_STUDENT_USERNAME="${AUTH_STUDENT_USERNAME:-demo-student}"
  export AUTH_STUDENT_SUBJECT_HASH="${AUTH_STUDENT_SUBJECT_HASH:-e21b5e0c1a136d1c910aea031527936cb024a4ea95ea1a236b5383056d466926}"
  export AUTH_ALLOWED_ORIGINS="${AUTH_ALLOWED_ORIGINS:-http://127.0.0.1:5173}"
  export AUTH_TTL_SECONDS="${AUTH_TTL_SECONDS:-3600}"
  export AUTH_SECURE_COOKIE="${AUTH_SECURE_COOKIE:-false}"
  export AUTH_ALLOW_NON_BROWSER_CLIENTS="${AUTH_ALLOW_NON_BROWSER_CLIENTS:-false}"
  export AUTH_ISSUER_USERNAME AUTH_REVIEWER_USERNAME AUTH_STUDENT_USERNAME
  export AUTH_STUDENT_SUBJECT_HASH AUTH_ALLOWED_ORIGINS AUTH_TTL_SECONDS
  export AUTH_SECURE_COOKIE AUTH_ALLOW_NON_BROWSER_CLIENTS
}

check() {
  local failed=0
  for executable in curl ss stat; do
    command -v "${executable}" >/dev/null || { echo "MISSING ${executable}"; failed=1; }
  done
  [[ -x "${NODE_BIN}" ]] || { echo "MISSING pinned Node: ${NODE_BIN}"; failed=1; }
  [[ -x "${COREPACK_BIN}" ]] || { echo "MISSING pinned Corepack: ${COREPACK_BIN}"; failed=1; }
  "${PROJECT_ROOT}/infra/fabric-native/native-network.sh" status || failed=1
  "${PROJECT_ROOT}/infra/fabric-native/deploy-chaincode.sh" status || failed=1
  for port in 3000 5173; do
    if ss -ltnH "sport = :${port}" | grep -q .; then
      echo "NOTICE port ${port} is occupied"
    else
      echo "FREE port ${port}"
    fi
  done
  [[ "${failed}" -eq 0 ]]
}

start_component() {
  local name="$1"
  shift
  if is_running "${name}"; then
    echo "RUNNING ${name} pid=$(cat "${PID_ROOT}/${name}.pid")"
    return
  fi
  (
    cd "${PROJECT_ROOT}"
    nohup "$@" >"${LOG_ROOT}/${name}.log" 2>&1 &
    echo $! >"${PID_ROOT}/${name}.pid"
  )
}

start() {
  check
  require_private_env
  for port in 3000 5173; do
    if ss -ltnH "sport = :${port}" | grep -q .; then
      echo "Refusing to start: unmanaged process is listening on ${port}" >&2
      return 1
    fi
  done
  echo "Building the single course-and-competition project..."
  PATH="${PROJECT_ROOT}/.tools/node/bin:${PATH}" "${COREPACK_BIN}" pnpm build
  start_component api env \
    PATH="${PROJECT_ROOT}/.tools/node/bin:${PATH}" HOST=127.0.0.1 PORT=3000 \
    FABRIC_ENABLED=true DEMO_ENABLED=false AUTH_ENABLED=true \
    "${NODE_BIN}" "${PROJECT_ROOT}/apps/api/dist/server.js"
  wait_http http://127.0.0.1:3000/api/meta api
  start_component web env \
    PATH="${PROJECT_ROOT}/.tools/node/bin:${PATH}" CHOKIDAR_USEPOLLING=true \
    "${COREPACK_BIN}" pnpm --filter @chaingrade/web exec vite --host 127.0.0.1
  wait_http http://127.0.0.1:5173/ web
  status
}

stop_component() {
  local name="$1"
  if ! is_running "${name}"; then
    rm -f -- "${PID_ROOT}/${name}.pid"
    echo "STOPPED ${name}"
    return
  fi
  assert_managed_pid "${name}" || {
    echo "Refusing to stop ${name}: PID no longer belongs to this project" >&2
    return 1
  }
  local pid
  pid="$(cat "${PID_ROOT}/${name}.pid")"
  kill "${pid}"
  for _ in $(seq 1 20); do
    kill -0 "${pid}" 2>/dev/null || break
    sleep 1
  done
  kill -0 "${pid}" 2>/dev/null && { echo "${name} did not stop after SIGTERM" >&2; return 1; }
  rm -f -- "${PID_ROOT}/${name}.pid"
  echo "STOPPED ${name}"
}

status() {
  local failed=0
  for name in api web; do
    if is_running "${name}" && assert_managed_pid "${name}"; then
      echo "RUNNING ${name} pid=$(cat "${PID_ROOT}/${name}.pid")"
    else
      echo "STOPPED ${name}"
      failed=1
    fi
  done
  if curl --fail --silent --max-time 2 http://127.0.0.1:3000/api/meta; then
    echo
  else
    echo "UNHEALTHY api /api/meta"
    failed=1
  fi
  return "${failed}"
}

case "${1:-}" in
  check) check ;;
  start) start ;;
  status) status ;;
  stop) stop_component web; stop_component api ;;
  logs) tail -n 100 "${LOG_ROOT}"/*.log ;;
  *) echo "Usage: $0 {check|start|status|stop|logs}" >&2; exit 2 ;;
esac
