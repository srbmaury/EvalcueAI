# EvalcueAI code runner

Runs candidate code for EvalcueAI: the editor's **Run** button (one file + stdin) and code-fix debugging
rounds (a multi-file project plus hidden test files). The API server calls it over HTTPS with a bearer token;
browsers never talk to it.

| Runtime id | Toolchain | Snippet | Project test |
|---|---|---|---|
| `node-22` | Node.js 22 | `node main.js` | `node --test <test>` |
| `python-3` | Python 3.12 | `python3 main.py` | `python3 <test>` |
| `java-21` | Temurin JDK 21 | `javac` + `java <PublicClass>` | compile all `.java` once, `java <package.TestClass>` |
| `cpp-20` | GCC 12, `-std=c++20` | `g++` + `./main` | syntax-check sources once, link each test with them, run |

A project test passes when its program exits with status 0. At startup the runner runs each toolchain's
`--version` inside the sandbox and only offers runtimes that pass; the API server reads that list from
`GET /v1/runtimes`.

## Sandbox

Every compile and run step is a separate [nsjail](https://github.com/google/nsjail) process:

- new user, PID, mount, network, IPC, UTS and cgroup namespaces; **no network interface**
- runs as `nobody` (65534); sees only read-only `/usr`, `/opt/java`, a private `/tmp`, and its job directory at `/work`
- cgroup v2 limits per step: memory (512 MB, 768 MB for compiles), 128 processes, one CPU
- wall-clock and CPU-time limits (6 s run, 10 s per test, 20 s compile, 60 s per project), 16 MB max file size
- stdout/stderr capped at 64 KB each

Jobs run in a throwaway directory on a tmpfs that is deleted afterwards. `RUNNER_CONCURRENCY` jobs run at
once (3 in `docker-compose.yml`); up to 32 more wait, beyond that the API returns 429.

The container itself is privileged so nsjail can create namespaces and cgroups. Run it on a **dedicated
host** that holds no other secrets.

## API

All routes except `/healthz` need `Authorization: Bearer $RUNNER_TOKEN`.

```
GET  /healthz        -> { ok, active, waiting }
GET  /v1/runtimes    -> { runtimes: [{ id, label, version }] }
POST /v1/snippets    { runtime, source, stdin? }
                     -> { status: ok|compile_error|runtime_error|timeout|killed, stdout, stderr, compileOutput, exitCode, durationMs, truncated }
POST /v1/projects    { runtime, files: [{ path, content }], tests: [{ path, name }] }
                     -> { status: completed|compile_error|timeout, compileOutput, tests: [{ name, passed, status, output }], durationMs }
```

Test `output` can reveal hidden tests. The API server uses it only to classify setup errors and never
returns it to candidates or recruiters.

## Run locally

Needs Docker with cgroup v2 (Docker Desktop works).

```sh
cd runner
export RUNNER_TOKEN=$(openssl rand -hex 32)
docker compose up -d --build runner
# server/.env
#   ENABLE_CODE_EXEC=true
#   CODE_RUNNER_URL=http://127.0.0.1:8080
#   CODE_RUNNER_TOKEN=<same token>
```

Tests: `npm test` runs the unit tests. With the container up,
`RUNNER_URL=http://127.0.0.1:8080 RUNNER_TOKEN=$RUNNER_TOKEN npm test` also runs the sandbox integration
tests (all runtimes, infinite loops, memory and fork bombs, network and filesystem isolation).

## Deploy on Oracle Cloud Always Free

1. **Create the VM.** Compute → Instances → Create: image *Ubuntu 24.04*, shape *VM.Standard.A1.Flex*
   (Ampere, Always Free eligible) with 2 OCPU / 12 GB (up to 4 / 24 is free). Add your SSH key. If the
   region reports no capacity, retry later or pick another availability domain.
2. **Open ports 80 and 443.** In the instance's VCN security list add ingress rules for TCP 80 and 443.
   Ubuntu images on OCI also block them in iptables:
   ```sh
   sudo iptables -I INPUT 6 -p tcp -m multiport --dports 80,443 -m state --state NEW -j ACCEPT
   sudo netfilter-persistent save
   ```
3. **DNS.** Point an `A` record such as `runner.evalcueai.com` at the VM's public IP.
4. **Install Docker and start the runner.**
   ```sh
   curl -fsSL https://get.docker.com | sudo sh
   git clone https://github.com/srbmaury/EvalcueAI.git && cd EvalcueAI/runner
   printf 'RUNNER_TOKEN=%s\nRUNNER_DOMAIN=runner.evalcueai.com\n' "$(openssl rand -hex 32)" > .env
   sudo docker compose --profile tls up -d --build
   sudo docker compose logs runner   # expect: runtimes: node-22 (...), python-3 (...), java-21 (...), cpp-20 (...)
   ```
5. **Check it.**
   ```sh
   curl https://runner.evalcueai.com/healthz
   curl -H "Authorization: Bearer $(grep RUNNER_TOKEN .env | cut -d= -f2)" https://runner.evalcueai.com/v1/runtimes
   ```
6. **Point the API at it** (Render environment): `ENABLE_CODE_EXEC=true`,
   `CODE_RUNNER_URL=https://runner.evalcueai.com`, `CODE_RUNNER_TOKEN=<token from .env>`.
7. **Keep it free and running.** Oracle may reclaim Always Free instances that stay idle. Upgrading the
   account to Pay As You Go prevents that; usage within Always Free limits is still not charged.

Updating: `git pull && sudo docker compose --profile tls up -d --build`. Rotating the token: edit `.env`,
restart, and update `CODE_RUNNER_TOKEN` on Render.
