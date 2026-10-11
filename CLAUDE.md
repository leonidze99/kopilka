# Kopilka

Пет-проект: трекер личных финансов (доходы/расходы, категории, бюджеты, аналитика). Цель — фуллстек-проект для портфолио и прокачки бэкенд-навыков до уровня senior.

Автор — frontend-разработчик (React/TS, 6+ лет, финтех), бэкенд осваивает. Объясняй бэкенд-решения, не только пиши код. Ответы — кратко и по делу.

## Окружение
- Windows, PowerShell, WebStorm
- Путь: `C:\projects\kopilka`
- Docker Desktop для Postgres

## Стек
- Монорепа: pnpm workspaces (без Turborepo/Nx)
- `apps/web`: React + TypeScript + Vite + Redux Toolkit, архитектура Feature-Sliced Design, тесты Jest/RTL, e2e Cypress
- `apps/api`: NestJS + TypeScript, тесты Jest + Supertest
- `packages/shared` (`@kopilka/shared`): Zod 4 схемы и типы, общие для фронта и бэка
- БД: PostgreSQL 16 (docker-compose) + Prisma
- Авторизация: JWT access + refresh с ротацией, argon2
- API: REST + Swagger

## Правила
- `packages/shared` — только платформенно-независимый код: без `process.env`, `import.meta.env`, Node/браузерных API. ESM, `NodeNext`, относительные импорты с `.js`.
- Zod-схемы из shared используются в Nest (ZodValidationPipe) и на фронте (react-hook-form + zodResolver).
- Даты в схемах — `z.coerce.date()` (через JSON приходят строкой).
- Миграции: `prisma migrate dev` локально, `migrate deploy` при деплое.
- Не добавлять Redis/очереди/метрики заранее — только под реальную задачу.

## План развития
1. До первой фичи: `@nestjs/config` + валидация env через Zod; глобальный exception filter с единым форматом ошибки (code, message, field, requestId); логирование `nestjs-pino` с request-id (X-Request-ID, AsyncLocalStorage); Prisma-миграции.
2. Вместе с фичами: Swagger (+ openapi-typescript для фронта), health-чеки `@nestjs/terminus`, helmet, CORS, `@nestjs/throttler`, CI на GitHub Actions (lint, typecheck, test, build).
3. После MVP: e2e с Testcontainers, метрики prom-client + Grafana, Redis + BullMQ по необходимости, multi-stage Dockerfile, деплой (Railway/Fly.io).
Отдельно потренировать: транзакции и уровни изоляции, индексы/N+1/EXPLAIN ANALYZE, cursor-пагинация.

## Текущий статус
Каркас монорепы готов и закоммичен: `pnpm dev` поднимает shared (tsc --watch), web (Vite, :5173) и api (Nest, :3000); Postgres 16 в compose; `pnpm test`/`lint`/`typecheck` зелёные. `@kopilka/shared` прилинкован в оба приложения, но в коде ещё не используется.

Фактические версии от генераторов (отличаются от исходного плана):
- Nest 12 — ESM (`"type": "module"`), тесты на **Vitest** (не Jest), Supertest есть.
- Vite 8 + React 19.
- Линтер в обоих приложениях — **oxlint** (не ESLint).
- TypeScript 6 везде (в корне тоже `^6.0.2`); pnpm 10, `packageManager` зафиксирован в корневом `package.json`.

Следующее: решить Jest vs Vitest и ESLint vs oxlint → Prettier на всю монорепу → конфиг/env с валидацией → Prisma-схема.

История решений и исходные тексты конфигов — в [docs/planning-log.md](docs/planning-log.md).

## Windows-специфика
- `mkdir -p` не работает в PowerShell — вместо него `mkdir apps, packages\shared\src`.
- Docker Desktop должен быть запущен до `pnpm db:up`.
- `.gitattributes` с `* text=auto eol=lf`, чтобы git не смешивал CRLF и LF.
- Node >= 22 (зафиксировано в `engines`).
- У Nest скрипт watch-запуска зовётся `start:dev`, поэтому в `apps/api/package.json` добавлен `"dev": "nest start --watch"` для корневого `pnpm dev`.
- После остановки `pnpm dev` дочерние node-процессы могут пережить родителя и держать порты 3000/5173.
- Первая сборка `shared` (`pnpm --filter @kopilka/shared build`) обязательна перед первым `pnpm dev` на чистом клоне.
