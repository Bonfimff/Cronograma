#!/usr/bin/env bash
# Cria (ou reaproveita) o banco e o usuário do aplicativo no MySQL e grava a URL
# de conexão no .env do serviço.
#
#   bash preparar-mysql.sh [banco] [usuario]
#
# As senhas são digitadas na hora e nunca aparecem na linha de comando: vão por
# um arquivo temporário só-leitura-do-dono, como o próprio MySQL recomenda.
set -euo pipefail

BANCO=${1:-ingles}
USUARIO=${2:-ingles}
ENV_FILE=${ENV_FILE:-$HOME/ingles/server/.env}

# o root do MySQL entra pelo socket (sem senha) ou pede senha?
ROOT_CNF=$(mktemp)
chmod 600 "$ROOT_CNF"
trap 'rm -f "$ROOT_CNF"' EXIT

if sudo mysql -u root -e "SELECT 1" >/dev/null 2>&1; then
  USAR_SUDO=1
  echo "root do MySQL: entrando pelo socket do sistema"
else
  USAR_SUDO=0
  read -rsp "Senha do root do MySQL: " ROOT_SENHA; echo
  printf '[client]\nuser=root\npassword="%s"\n' "$ROOT_SENHA" > "$ROOT_CNF"
  unset ROOT_SENHA
fi

read -rsp "Senha para o usuário '$USUARIO' do aplicativo: " APP_SENHA; echo
read -rsp "Repita a senha: " APP_SENHA2; echo
[ "$APP_SENHA" = "$APP_SENHA2" ] || { echo "As senhas não conferem."; exit 1; }
[ -n "$APP_SENHA" ] || { echo "Senha vazia."; exit 1; }

rodar_sql() {
  if [ "$USAR_SUDO" = 1 ]; then sudo mysql; else mysql --defaults-extra-file="$ROOT_CNF"; fi
}

rodar_sql <<SQL
CREATE DATABASE IF NOT EXISTS \`$BANCO\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '$USUARIO'@'localhost' IDENTIFIED BY '$APP_SENHA';
ALTER USER '$USUARIO'@'localhost' IDENTIFIED BY '$APP_SENHA';
GRANT ALL PRIVILEGES ON \`$BANCO\`.* TO '$USUARIO'@'localhost';
FLUSH PRIVILEGES;
SQL
echo "banco '$BANCO' e usuário '$USUARIO' prontos"

# a senha pode ter caracteres especiais: vai codificada para dentro da URL
SENHA_URL=$(APP_SENHA="$APP_SENHA" python3 -c 'import os,urllib.parse;print(urllib.parse.quote(os.environ["APP_SENHA"], safe=""))')
URL="mysql+pymysql://$USUARIO:$SENHA_URL@127.0.0.1:3306/$BANCO?charset=utf8mb4"
unset APP_SENHA APP_SENHA2

[ -f "$ENV_FILE" ] || { echo "Não achei $ENV_FILE"; exit 1; }
TMP=$(mktemp); chmod 600 "$TMP"
grep -v '^ENGLISH_DATABASE_URL=' "$ENV_FILE" > "$TMP" || true
printf 'ENGLISH_DATABASE_URL=%s\n' "$URL" >> "$TMP"
mv "$TMP" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "$ENV_FILE atualizado (a senha não aparece nesta saída)"

# confere a conexão de verdade antes de reiniciar o serviço
cd "$(dirname "$ENV_FILE")"
set -a; . "$ENV_FILE"; set +a
.venv/bin/python -c "
from sqlalchemy import create_engine, text
import os
e = create_engine(os.environ['ENGLISH_DATABASE_URL'])
with e.connect() as c:
    print('MySQL respondeu:', c.execute(text('SELECT VERSION()')).scalar())
"
