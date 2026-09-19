#!/bin/sh
set -e
# Aplica migrações pendentes antes de subir. Idempotente; seguro com réplicas
# (o Prisma usa lock na tabela _prisma_migrations).
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  echo "[entrypoint] prisma migrate deploy"
  NODE_PATH=/app/prisma-cli/node_modules node ./prisma-cli/node_modules/prisma/build/index.js migrate deploy
fi
exec "$@"
