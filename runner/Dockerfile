# syntax=docker/dockerfile:1

# nsjail, built from a pinned release.
FROM debian:bookworm-slim AS nsjail
ARG NSJAIL_VERSION=3.4
RUN apt-get update && apt-get install -y --no-install-recommends \
        autoconf bison flex gcc g++ git libprotobuf-dev libnl-route-3-dev libtool make pkg-config protobuf-compiler ca-certificates \
    && git clone --depth 1 --branch "${NSJAIL_VERSION}" https://github.com/google/nsjail.git /nsjail \
    && make -C /nsjail -j"$(nproc)"

FROM node:22-bookworm-slim AS node
FROM eclipse-temurin:21-jdk AS java

# Candidate toolchains: Python 3.12 (base image), Node.js 22, Java 21 (Temurin), GCC 12 with C++20.
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends g++ libprotobuf32 libnl-route-3-200 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=nsjail /nsjail/nsjail /usr/local/bin/nsjail
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=java /opt/java/openjdk /opt/java

WORKDIR /app
COPY package.json ./
COPY src ./src
COPY sandbox/nsjail.cfg sandbox/seccomp.kafel /etc/runner/
COPY sandbox/entrypoint.sh /usr/local/bin/runner-entrypoint

ENV NODE_ENV=production PORT=8080 RUNNER_WORK_DIR=/var/runner/work
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --start-interval=2s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/runner-entrypoint"]
