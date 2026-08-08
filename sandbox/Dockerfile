# CyberSkill Builder PI-05 sandbox image.
# Provides an interactive web terminal (ttyd) + python3 for preload/snapshot
# helpers used by cis_hardening / outage_capstone tickets.
#
# Build & push (from repo root, after `fly auth login`):
#   fly apps create cyberskill-sandbox --org personal   # once
#   cd sandbox && fly deploy --app cyberskill-sandbox --image-label latest
#
# Required guest capabilities:
#   - ttyd (or equivalent) listening on $PORT / 7681 with websocket support
#   - python3 available for preload/snapshot exec
#   - writable /etc paths for CIS hardening labs

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PORT=7681 \
    LANG=C.UTF-8

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    python3 \
    procps \
    coreutils \
    findutils \
    grep \
    sed \
    gawk \
    openssh-server \
    passwd \
    login \
    libpam-modules \
    xinetd \
    nginx \
  && rm -rf /var/lib/apt/lists/*

# Install ttyd (web terminal) — pinned release asset for linux amd64/arm64.
ARG TTYD_VERSION=1.7.7
RUN set -eux; \
  arch="$(dpkg --print-architecture)"; \
  case "$arch" in \
    amd64) ttyd_arch=x86_64 ;; \
    arm64) ttyd_arch=aarch64 ;; \
    *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
  esac; \
  curl -fsSL \
    "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.${ttyd_arch}" \
    -o /usr/local/bin/ttyd; \
  chmod +x /usr/local/bin/ttyd

# Intentionally permissive baseline so CIS / outage labs can harden or repair.
RUN mkdir -p /etc/ssh /var/run/sshd /etc/xinetd.d /var/lib/app /status \
  && printf '%s\n' \
    'PermitRootLogin yes' \
    'PasswordAuthentication yes' \
    'MaxAuthTries 10' \
    > /etc/ssh/sshd_config \
  && printf '%s\n' \
    'PASS_MAX_DAYS 99999' \
    'PASS_MIN_DAYS 0' \
    'UMASK 022' \
    > /etc/login.defs \
  && printf '%s\n' \
    'service telnet' \
    '{' \
    '  disable = no' \
    '  socket_type = stream' \
    '  protocol = tcp' \
    '  wait = no' \
    '  user = root' \
    '  server = /usr/sbin/in.telnetd' \
    '}' \
    > /etc/xinetd.d/telnet \
  && touch /etc/shadow \
  && chmod 644 /etc/shadow \
  && printf '%s\n' \
    'server {' \
    '  listen 9999;' \
    '  server_name localhost;' \
    '  location / {' \
    '    proxy_pass http://127.0.0.1:3000;' \
    '  }' \
    '}' \
    > /etc/nginx/nginx.conf \
  && printf '%s\n' 'state=down' 'disk=full' > /status/app.state \
  && dd if=/dev/zero of=/var/lib/app/disk.fill bs=1M count=8 2>/dev/null || true

COPY entrypoint.sh /usr/local/bin/sandbox-entrypoint.sh
RUN chmod +x /usr/local/bin/sandbox-entrypoint.sh

EXPOSE 7681

WORKDIR /root
ENTRYPOINT ["/usr/local/bin/sandbox-entrypoint.sh"]
