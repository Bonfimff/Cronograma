#!/usr/bin/env bash
# Publica a API em api-eita.exksvol.com: nginx na frente do uvicorn e certificado do Let's Encrypt.
# Uso, dentro do servidor:  sudo bash deploy/publicar-api.sh
set -euo pipefail

DOMINIO="api-eita.exksvol.com"
ORIGEM="$(cd "$(dirname "$0")" && pwd)/nginx-api.conf"
ALVO="/etc/nginx/sites-available/ingles-api"

command -v nginx >/dev/null || { apt-get update && apt-get install -y nginx; }

cp "$ORIGEM" "$ALVO"
ln -sf "$ALVO" /etc/nginx/sites-enabled/ingles-api
nginx -t
systemctl reload nginx

echo "Conferindo a API por trás do nginx:"
curl -s -H "Host: $DOMINIO" http://127.0.0.1/saude || true
echo

# O certificado só sai se o DNS de $DOMINIO já apontar para este servidor sem proxy.
if command -v certbot >/dev/null || apt-get install -y certbot python3-certbot-nginx; then
  certbot --nginx -d "$DOMINIO" --non-interactive --agree-tos --register-unsafely-without-email --redirect \
    || echo "Certificado não emitido. Confira se $DOMINIO resolve para este servidor com o proxy desligado."
fi

echo "Pronto. Teste de fora:  curl https://$DOMINIO/saude"
