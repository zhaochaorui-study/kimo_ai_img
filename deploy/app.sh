#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
APP_ENTRY="${PROJECT_ROOT}/src/server.mjs"
APP_PORT="${PORT:-4173}"
RUN_DIR="${PROJECT_ROOT}/.run"
LOG_DIR="${PROJECT_ROOT}/logs"
PID_FILE="${RUN_DIR}/kimo-web.pid"
LOG_FILE="${LOG_DIR}/kimo-web.log"

# Print command usage.
print_usage() {
  echo "Usage: $0 {start|stop|restart|status|logs}"
}

# Create runtime directories for pid and log files.
ensure_runtime_dirs() {
  mkdir -p "${RUN_DIR}" "${LOG_DIR}"
}

# Read the saved process id from the pid file.
read_pid() {
  if [[ -f "${PID_FILE}" ]]; then
    cat "${PID_FILE}"
  fi
}

# Return success when the given process id is still alive.
is_process_running() {
  local pid="${1:-}"
  [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1
}

# Find existing app processes started from this project.
find_app_pids() {
  pgrep -f "node ${APP_ENTRY}" 2>/dev/null || true
}

# Find any process listening on the app port, including stale processes from old deploy paths.
find_port_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -ti "tcp:${APP_PORT}" -sTCP:LISTEN 2>/dev/null || true
    return
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser "${APP_PORT}/tcp" 2>/dev/null || true
  fi
}

# Print recent app logs to expose startup errors such as EADDRINUSE.
print_recent_logs() {
  if [[ -f "${LOG_FILE}" ]]; then
    tail -n 40 "${LOG_FILE}"
  fi
}

# Stop one process and wait briefly for it to exit.
stop_pid() {
  local pid="$1"

  if ! is_process_running "${pid}"; then
    return
  fi

  echo "Stopping process ${pid}..."
  kill "${pid}" >/dev/null 2>&1 || true

  for _ in {1..20}; do
    if ! is_process_running "${pid}"; then
      return
    fi
    sleep 0.2
  done

  echo "Process ${pid} did not exit, forcing kill..."
  kill -9 "${pid}" >/dev/null 2>&1 || true
}

# Stop the current app process using pid file and process lookup fallback.
stop_app() {
  ensure_runtime_dirs

  local pid
  pid="$(read_pid || true)"

  if [[ -n "${pid}" ]]; then
    stop_pid "${pid}"
  fi

  for found_pid in $(find_app_pids); do
    if [[ "${found_pid}" != "$$" ]]; then
      stop_pid "${found_pid}"
    fi
  done

  for found_pid in $(find_port_pids); do
    if [[ "${found_pid}" != "$$" ]]; then
      stop_pid "${found_pid}"
    fi
  done

  rm -f "${PID_FILE}"
  echo "Stopped."
}

# Start the app in the background and write logs to the log file.
start_app() {
  ensure_runtime_dirs

  local pid
  pid="$(read_pid || true)"

  if is_process_running "${pid}"; then
    echo "Already running: ${pid}"
    return
  fi

  cd "${PROJECT_ROOT}"
  echo "Starting app..."
  nohup node "${APP_ENTRY}" >> "${LOG_FILE}" 2>&1 &
  local started_pid="$!"
  echo "${started_pid}" > "${PID_FILE}"
  sleep 1

  if ! is_process_running "${started_pid}"; then
    echo "Start failed. Recent logs:"
    print_recent_logs
    rm -f "${PID_FILE}"
    exit 1
  fi

  echo "Started: ${started_pid}"
  echo "Port: ${APP_PORT}"
  echo "Log: ${LOG_FILE}"
}

# Print the current app status.
show_status() {
  local pid
  pid="$(read_pid || true)"

  if is_process_running "${pid}"; then
    echo "Running: ${pid}"
    return
  fi

  local found_pids
  found_pids="$(find_app_pids)"

  if [[ -n "${found_pids}" ]]; then
    echo "Running without pid file: ${found_pids}"
    return
  fi

  local port_pids
  port_pids="$(find_port_pids)"

  if [[ -n "${port_pids}" ]]; then
    echo "Port ${APP_PORT} is occupied by: ${port_pids}"
    return
  fi

  echo "Stopped."
}

# Follow the app log file.
follow_logs() {
  ensure_runtime_dirs
  touch "${LOG_FILE}"
  tail -f "${LOG_FILE}"
}

case "${1:-}" in
  start)
    start_app
    ;;
  stop)
    stop_app
    ;;
  restart)
    stop_app
    start_app
    ;;
  status)
    show_status
    ;;
  logs)
    follow_logs
    ;;
  *)
    print_usage
    exit 1
    ;;
esac
