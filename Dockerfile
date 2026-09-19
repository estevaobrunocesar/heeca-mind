# syntax=docker/dockerfile:1
# Hecca Psico — imagem de produção (Next.js standalone + Prisma)

FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# ── dependências ─────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
# --ignore-scripts: o postinstall (prisma generate) roda no estágio de build,
# onde existem schema, src/ e as variáveis necessárias.
RUN npm ci --no-audit --no-fund --ignore-scripts

# ── build ─────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV DOCKER_BUILD=1 NEXT_TELEMETRY_DISABLED=1
# Valores só para o build passar (o Next avalia módulos ao gerar rotas);
# inline no RUN para não ficarem na imagem. Os reais vêm em runtime.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    AUTH_SECRET=build-only-secret-build-only-secret-0000 \
    ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    NEXT_PUBLIC_APP_URL=http://localhost:3000 \
    sh -c "npx prisma generate && npm run build"

# ── prisma cli (para migrate deploy em runtime) ──────────────
FROM base AS prisma-cli
WORKDIR /prisma-cli
COPY package.json /tmp/app-package.json
# package.json próprio: o do app marca dotenv como devDependency e --omit=dev o descartaria.
RUN PRISMA_VERSION=$(node -p "const p=require('/tmp/app-package.json');(p.devDependencies||{}).prisma||p.dependencies.prisma") \
    && npm init -y >/dev/null \
    && npm install --no-audit --no-fund --ignore-scripts prisma@$PRISMA_VERSION dotenv

# ── runtime ───────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S app && adduser -S app -G app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Prisma CLI + migrações para `migrate deploy` no start
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/prisma.config.ts ./prisma.config.ts
COPY --from=prisma-cli --chown=app:app /prisma-cli/node_modules ./prisma-cli/node_modules
# prisma.config.ts importa dotenv/config; o loader do config não usa NODE_PATH
COPY --from=prisma-cli --chown=app:app /prisma-cli/node_modules/dotenv ./node_modules/dotenv
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p public/uploads storage/private && chown app:app public/uploads storage/private

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
