import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const DEPLOY_SCRIPT_PATH = new URL("../deploy/app.sh", import.meta.url);

test("app restart stops stale port listeners and verifies startup", async () => {
  const source = await readFile(DEPLOY_SCRIPT_PATH, "utf8");

  assert.match(source, /APP_PORT="\$\{PORT:-4173\}"/);
  assert.match(source, /find_port_pids\(\)/);
  assert.match(source, /lsof -ti "tcp:\$\{APP_PORT\}" -sTCP:LISTEN/);
  assert.match(source, /fuser "\$\{APP_PORT\}\/tcp"/);
  assert.match(source, /for found_pid in \$\(find_port_pids\); do/);
  assert.match(source, /sleep 1/);
  assert.match(source, /if ! is_process_running "\$\{started_pid\}"; then/);
  assert.match(source, /tail -n 40 "\$\{LOG_FILE\}"/);
});
