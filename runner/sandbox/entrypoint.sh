#!/bin/sh
# nsjail puts each run in its own cgroup under $RUNNER_CGROUP_ROOT to cap memory, processes and CPU.
# cgroup v2 only lets a cgroup delegate controllers to children when it holds no processes itself,
# so move this container's processes into a leaf first, then enable the controllers for the jail tree.
set -eu
CG=/sys/fs/cgroup
JAILS="${RUNNER_CGROUP_ROOT:-$CG/jails}"

[ -f "$CG/cgroup.controllers" ] || { echo "runner: cgroup v2 is required" >&2; exit 1; }
mkdir -p "$CG/runner" "$JAILS"
for pid in $(cat "$CG/cgroup.procs"); do echo "$pid" > "$CG/runner/cgroup.procs" 2>/dev/null || true; done
echo "+memory +pids +cpu" > "$CG/cgroup.subtree_control"
echo "+memory +pids +cpu" > "$JAILS/cgroup.subtree_control"

exec node /app/src/server.js
