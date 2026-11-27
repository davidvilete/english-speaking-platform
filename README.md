# Plataforma de Conversação em Inglês — Output 1v2

Plataforma web responsiva (desktop e mobile browser) para gestão e operação de aulas ao vivo de conversação em inglês no formato **1v2** (1 professor para 2 alunos pareados por nível de fala), com foco em destravamento de _output_ (fala e escrita) para adultos (18+) com base mínima ou nível intermediário.

> **Status atual:** **Sprint 1 implementada e validada** (`typecheck`, `lint`, `format`, 24 testes Vitest e `next build` passando; banco Supabase e bucket privado `screening-audios` provisionados). Próxima etapa: **Sprint 2** (Agenda do Professor, Pareamento 1v2 Atômico e Check-in de 10 min).

---

## Arquitetura e Stack Tecnológica

O projeto segue o estilo de **Monólito Modular Full-Stack**, priorizando **custo zero no piloto**, velocidade de entrega e manutenibilidade solo.

| Camada                     | Tecnologia                                                             |
| -------------------------- | ---------------------------------------------------------------------- |
| Linguagem                  | TypeScript (`strict: true`)                                            |
| Framework Full-Stack       | Next.js 15 (App Router) + React 19                                     |
| UI e Estilo                | Tailwind CSS + `shadcn/ui` (`components.json`) + Lucide Icons          |
| Banco, Auth e Storage      | Supabase (PostgreSQL + RLS + Auth + Storage Privado)                   |
| Validação                  | Zod                                                                    |
| Datas e Fuso Horário       | PostgreSQL `timestamptz` (UTC) + `date-fns` / `Intl`                   |
| E-mail Transacional        | `nodemailer` (Brevo Free Tier / Gmail SMTP com App Password)           |
| Geração de Atividades (IA) | Google Gemini API (`@google/genai`, Free Tier, server-side)            |
| Testes                     | Vitest + Testing Library + jsdom + Coverage V8                         |
| Qualidade                  | ESLint 9 (flat config) + Prettier + `tsc --noEmit` + GitHub Actions CI |

---

## Estrutura de Diretórios

```text
.
├── .ai/                         # Documentação arquitetural, backlog e guias de execução
├── .github/
│   └── workflows/
│       └── ci.yml               # Pipeline de CI (typecheck, lint, format, test, build)
├── src/
│   ├── app/                     # Next.js App Router (rotas e layouts por perfil)
│   │   ├── (auth)/              # Rotas públicas de autenticação e cadastro (18+ / LGPD)
│   │   ├── (student)/           # Área do aluno (triagem, agenda, check-in, pós-aula)
│   │   ├── (teacher)/           # Área do professor (triagem, disponibilidade, pós-aula)
│   │   ├── (admin)/             # Painel administrativo (planos, logs, exportação)
│   │   ├── api/                 # Route Handlers (ex.: /api/health, crons internos)
│   │   ├── globals.css          # Estilos base Tailwind + variáveis CSS shadcn/ui
│   │   ├── layout.tsx           # Layout raiz (pt-BR)
│   │   └── page.tsx             # Página inicial placeholder
│   ├── modules/                 # Monólito Modular — 1 diretório por domínio de negócio
│   │   ├── auth/                # Autenticação, perfis e consentimento LGPD
│   │   ├── screening/           # Triagem por áudio, interesses e classificação de nível
│   │   ├── scheduling/          # Disponibilidade, agenda e pareamento 1v2 atômico
│   │   ├── checkin/             # Check-in (10 min antes) e liberação protegida do Meet
│   │   ├── post-class/          # Notas do professor, rascunho IA e fallback manual
│   │   ├── billing/             # Planos (trial, basic_1x, intermediate_2x) e assinaturas
│   │   ├── notifications/       # E-mail transacional e deep-links wa.me sanitizados
│   │   └── audit/               # Logs de erro (system_error_logs), retenção 30d e exportação
│   └── shared/                  # Infraestrutura e utilitários compartilhados
│       ├── components/ui/       # Componentes shadcn/ui
│       ├── hooks/               # Hooks React reutilizáveis
│       ├── lib/
│       │   ├── supabase/        # Clientes Supabase (server/browser)
│       │   └── utils.ts         # Helper cn() (clsx + tailwind-merge)
│       └── types/               # Tipos globais compartilhados
├── supabase/
│   └── migrations/              # Migrações SQL (tabelas UTC, RLS e RPCs atômicas)
├── tests/
│   ├── setup.ts                 # Setup global do Vitest (@testing-library/jest-dom)
│   └── unit/                    # Testes unitários adicionais
├── .editorconfig
├── .env.example                 # Template de variáveis de ambiente (sem segredos)
├── .gitignore
├── .prettierignore
├── .prettierrc
├── components.json              # Configuração shadcn/ui
├── eslint.config.mjs            # ESLint 9 flat config (Next.js + TypeScript + Prettier)
├── next.config.ts               # Configuração Next.js
├── package.json                 # Dependências e scripts
├── postcss.config.mjs           # Configuração PostCSS
├── tailwind.config.ts           # Configuração Tailwind CSS
├── tsconfig.json                # TypeScript modo estrito
└── vitest.config.ts             # Configuração Vitest + coverage V8
```

### Convenção Interna dos Módulos (`src/modules/<dominio>/`)

Ao implementar cada funcionalidade a partir da Sprint 1, organize cada módulo de forma enxuta:

- `domain.ts`: regras puras de negócio (testáveis com Vitest sem banco/UI).
- `schemas.ts`: contratos de entrada/saída validados com Zod.
- `actions.ts`: Server Actions com checagem explícita de autenticação, papel (`role`) e validação Zod.
- `repository.ts`: acesso a dados via Supabase (respeitando RLS e RPCs atômicas).
- `components/`: componentes de interface específicos do domínio.

---

## Pré-requisitos

- **Node.js** `>= 20.11.0` (recomendado Node.js 22 LTS)
- **npm** `>= 10.0.0`

---

## Configuração Inicial

1. **Instale as dependências:**

   ```bash
   npm install
   ```

2. **Configure as variáveis de ambiente locais:**

   ```bash
   cp .env.example .env.local
   ```

   Preencha os valores em `.env.local` conforme sua instância de desenvolvimento no Supabase, provedor SMTP (Brevo/Gmail) e Google AI Studio (Gemini).

   > **Segurança:** nunca prefixe segredos (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `SMTP_PASS`, `EMAIL_PROVIDER_API_KEY`, `CRON_SECRET`) com `NEXT_PUBLIC_`.

3. **Execute o servidor de desenvolvimento:**
   ```bash
   npm run dev
   ```

---

## Scripts Disponíveis

| Script                  | Finalidade                                                     |
| ----------------------- | -------------------------------------------------------------- |
| `npm run dev`           | Inicia o servidor Next.js local com Turbopack                  |
| `npm run build`         | Executa o build de produção do Next.js                         |
| `npm run start`         | Sobe o servidor de produção após o build                       |
| `npm run typecheck`     | Valida tipagem estrita (`tsc --noEmit`)                        |
| `npm run lint`          | Executa ESLint nas regras do Next.js e TypeScript              |
| `npm run lint:fix`      | Corrige automaticamente problemas apontados pelo ESLint        |
| `npm run format`        | Formata o código com Prettier (incluindo classes Tailwind)     |
| `npm run format:check`  | Verifica formatação sem alterar arquivos                       |
| `npm test`              | Executa a suíte de testes unitários com Vitest                 |
| `npm run test:watch`    | Executa Vitest em modo observação                              |
| `npm run test:coverage` | Gera relatório de cobertura (V8)                               |
| `npm run check`         | Roda `typecheck`, `lint`, `format:check` e `test` em sequência |

---

## Adicionando Componentes `shadcn/ui`

O arquivo `components.json` já está configurado para instalar componentes em `src/shared/components/ui/`:

```bash
npx shadcn@latest add button card input
```

---

## Regras Arquiteturais Invioláveis (Resumo)

1. **Custo zero no piloto** (Vercel Hobby, Supabase Free, Brevo/Gmail SMTP, Gemini Free, Google Meet, `wa.me`).
2. **Separação estrita:** `plan_code` (franquia/cobrança) nunca determina pareamento 1v2; apenas `proficiency_level` determina compatibilidade.
3. **Integridade 1v2:** reservas e cancelamentos sempre via transações ACID / RPCs PostgreSQL (`SELECT ... FOR UPDATE`).
4. **Datas sempre em UTC** no banco (`timestamptz`), convertidas para o fuso local apenas na interface.
5. **Segurança e LGPD:** RLS em todas as tabelas, áudios em bucket privado via Signed URLs, `meet_url` protegido, zero PII enviado à API de IA e retenção de 30 dias.
6. **Contingência manual obrigatória:** falhas na IA ou em serviços externos nunca podem travar a operação.
