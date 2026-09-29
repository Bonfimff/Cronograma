#!/usr/bin/env bash
# Instala a versão que acabou de chegar em /tmp/ingles-server.tgz e reinicia o serviço.
set -euo pipefail
PACOTE=${1:-/tmp/ingles-server.tgz}
DESTINO=${2:-$HOME/ingles}

tar -xzf "$PACOTE" -C "$DESTINO"
cd "$DESTINO/server"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt
sudo systemctl restart ingles-api
sleep 3
systemctl is-active ingles-api
curl -sf localhost:8010/saude && echo
