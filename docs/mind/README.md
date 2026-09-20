# Heeca Mind — pacote de pré-desenvolvimento

Entrega pedida no briefing (§43) **antes de qualquer código**: arquitetura, banco, API, frontend, segurança e testes, com a proposta de reutilização do Core Heeca.

Data: 20/09/2026. Base decidida: **`hecca_psico` vira Heeca Mind** (não se constrói sobre o motor Dental nem do zero — ver `00-DECISAO-E-REUSO.md`).

| Doc | Responde ao briefing |
|---|---|
| [00-DECISAO-E-REUSO.md](00-DECISAO-E-REUSO.md) | §3, §4, §42 — o que o Core realmente é hoje e o que o Mind reutiliza |
| [01-ARQUITETURA.md](01-ARQUITETURA.md) | §43.1 — diagrama, serviços, dependências, fluxo de dados |
| [02-ERD.md](02-ERD.md) | §35, §43.2 — modelo existente, alterações, tabelas novas, índices, isolamento |
| [03-FLUXOS.md](03-FLUXOS.md) | §19, §10, §11, §16, §15, §20 — fluxos principais |
| [04-API.md](04-API.md) | §43.3 — endpoints, auth, DTOs, validação |
| [05-SEGURANCA.md](05-SEGURANCA.md) | §5, §14, §36, §37, §43.5 — RBAC, MFA, auditoria, dados clínicos |
| [06-GAPS-E-PLANO.md](06-GAPS-E-PLANO.md) | §32, §41 — o que falta, em que ordem, e o mapa dos critérios de aceite |
| [07-TESTES.md](07-TESTES.md) | §43.6 |

Convenção: **"existe"** = já está em `hecca_psico` (arquivo citado); **"novo"** = precisa ser feito; **"plataforma"** = tarefa do chat da plataforma (portal, `infra/`, Notify, `ui/`), não deste repositório — regra da Fase G do `PENDENCIAS.md`.

Pontos marcados com **⚑ DECISÃO** são regras de negócio com mais de uma resposta válida e ficam para o Bruno; estão listados no fim do `06-GAPS-E-PLANO.md`.
