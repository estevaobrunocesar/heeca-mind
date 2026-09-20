# Heeca Mind

Gestão simples e inteligente para profissionais de saúde mental — vertical da plataforma [Heeca](https://heeca.com.br).
Agenda, recorrência, agendamento online, WhatsApp (via Heeca Notify), pacientes, pacotes, documentos, financeiro e um prontuário cifrado com acesso restrito ao profissional responsável.

- Guia de trabalho no repositório: [CLAUDE.md](CLAUDE.md)
- Arquitetura, ERD, fluxos, API, segurança, plano e testes: [docs/mind/](docs/mind/README.md)
- Especificação original (Hecca Psico, base deste produto): [docs/SPEC.md](docs/SPEC.md)
- Deploy: [docs/DEPLOY.md](docs/DEPLOY.md) · WhatsApp: [docs/WHATSAPP.md](docs/WHATSAPP.md)

## Rodando

```bash
docker compose up -d      # Postgres local (5433)
cp .env.example .env      # gere AUTH_SECRET e ENCRYPTION_KEY (openssl rand -base64 32)
npm install
npm run db:migrate
npm run db:seed           # ana@exemplo.com / senha12345
npm run dev
```

`npm test` roda as regras puras; `npm run typecheck` e `npm run build` antes de abrir PR.
