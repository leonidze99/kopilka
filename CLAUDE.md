# Kopilka

Пет-проект: трекер личных финансов (доходы/расходы, категории, бюджеты, аналитика). Цель — фуллстек-проект для портфолио и прокачки бэкенд-навыков до уровня senior.

Автор — frontend-разработчик (React/TS, 6+ лет, финтех), бэкенд осваивает. Объясняй бэкенд-решения, не только пиши код. Ответы — кратко и по делу.

## Окружение

- Windows, PowerShell, WebStorm
- Путь: `C:\projects\kopilka`
- Docker Desktop для Postgres

## Стек

- Монорепа: pnpm workspaces (без Turborepo/Nx)
- `apps/web`: React + TypeScript + Vite + Redux Toolkit, архитектура Feature-Sliced Design, тесты Vitest + RTL, e2e Cypress
- `apps/api`: NestJS 12 (ESM) + TypeScript, тесты Vitest + Supertest
- `packages/shared` (`@kopilka/shared`): Zod 4 схемы и типы, общие для фронта и бэка
- БД: PostgreSQL 16 (docker-compose) + Prisma
- Авторизация: JWT access + refresh с ротацией, argon2
- API: REST + Swagger
- Линтер: oxlint (в обоих приложениях), форматирование: Prettier
- Инструменты: Node >= 22, pnpm 10, TypeScript 6

## Правила

- `packages/shared` — только платформенно-независимый код: без `process.env`, `import.meta.env`, Node/браузерных API. ESM, `NodeNext`, относительные импорты с `.js`.
- Zod-схемы из shared используются в Nest и на фронте (react-hook-form + zodResolver). В Nest — встроенный `StandardSchemaValidationPipe` (глобальный, `APP_PIPE`), схема указывается в декораторе: `@Body({ schema: createTransactionSchema }) dto: CreateTransactionDto`. Своего ZodValidationPipe нет.
- Ошибки API — единый формат `ApiError` из `@kopilka/shared`: `{ code, message, requestId, details?: [{ field?, message }] }`. Глобальный `AllExceptionsFilter` (`APP_FILTER`) превращает в него всё. Когда клиенту важно отличить ошибку — сервис кидает `AppException(code, message, status, details?)`; новые коды добавлять в `errorCodeSchema`. 5xx клиенту отдаются без деталей, полная ошибка — в лог.
- Prisma-ошибки фильтр мапит только как fallback (P2002/P2003 → 409, P2025 → 404): с driver adapter в P2002 нет списка полей, только имя индекса, поэтому «email уже занят» и т.п. сервис ловит сам и кидает `AppException` с `field`.
- Даты в схемах — `z.coerce.date()` (через JSON приходят строкой).
- Миграции: `prisma migrate dev` локально, `migrate deploy` при деплое.
- Prisma 7 (CLI и клиент закреплены на одной версии `7.10.0`; тег `latest` у CLI указывает на RC 8.x — не обновлять вслепую):
  - клиент генерируется в `apps/api/src/generated/prisma` (в `.gitignore`), импорт из `../generated/prisma/client.js`;
  - `migrate dev` в v7 **не** запускает `prisma generate` — после изменения схемы: `pnpm db:migrate` → `pnpm --filter api db:generate`; `postinstall` генерирует клиент на `pnpm install`;
  - подключение через driver adapter `@prisma/adapter-pg`; `DATABASE_URL` для CLI берётся из `apps/api/.env` через `prisma.config.ts`;
  - postinstall-скрипты `prisma` и `@prisma/engines` разрешены в `onlyBuiltDependencies` в `pnpm-workspace.yaml`.
- Конвенции схемы БД: таблицы и колонки в snake_case (`@@map`/`@map`), id — `@db.Uuid` с `@default(uuid(7))` (генерируется на клиенте, в БД дефолта нет); время — `@db.Timestamptz(3)`; деньги — `Decimal @db.Decimal(14, 2)`, никогда не float; на FK, по которым ищем, — явный индекс (Postgres не создаёт их сам).
- Ограничения, которые Prisma-схема не выражает (CHECK и т.п.), добавлять в SQL миграции: `migrate dev --create-only` → дописать SQL → `migrate dev`.
- Не добавлять Redis/очереди/метрики заранее — только под реальную задачу.

## План развития

1. До первой фичи: `@nestjs/config` + валидация env через Zod; глобальный exception filter с единым форматом ошибки (code, message, field, requestId); логирование `nestjs-pino` с request-id (X-Request-ID, AsyncLocalStorage); Prisma-миграции.
2. Вместе с фичами: Swagger (+ openapi-typescript для фронта), health-чеки `@nestjs/terminus`, helmet, CORS, `@nestjs/throttler`, CI на GitHub Actions (lint, typecheck, test, build).
3. После MVP: e2e с Testcontainers, метрики prom-client + Grafana, Redis + BullMQ по необходимости, multi-stage Dockerfile, деплой (Railway/Fly.io).

Отдельно потренировать: транзакции и уровни изоляции, индексы/N+1/EXPLAIN ANALYZE, cursor-пагинация.

## Текущий статус

Каркас монорепы готов и закоммичен: `pnpm dev` поднимает shared (tsc --watch), web (Vite, :5173) и api (Nest, :3000); Postgres 16 в compose; `pnpm test`/`lint`/`typecheck` зелёные. `@kopilka/shared` прилинкован в оба приложения, но в коде ещё не используется.

Prettier настроен на всю монорепу: один конфиг в корне (`.prettierrc.json`), `pnpm format` / `pnpm format:check`. `docs/planning-log.md` исключён — исторический лог.

Env в api: `@nestjs/config` (global, cache) + Zod-схема `apps/api/src/config/env.ts`, передаётся в `validationSchema` напрямую (Standard Schema). Приложение падает на старте со списком всех невалидных переменных. Типизированный доступ — `AppConfigService` (`ConfigService<Env, true>`), `config.get('PORT', { infer: true })`. Новая переменная = поле в `envSchema` + строка в `apps/api/.env.example`.

Prisma: первая миграция `init` — `users`, `categories`, `transactions` (enum `transaction_kind`, CHECK `amount > 0`, `RESTRICT` на удаление категории с транзакциями, каскад от пользователя). Глобальный `PrismaModule` / `PrismaService`.

Отложено сознательно (решить при проектировании фич): счета (accounts) и переводы между ними, бюджеты, мультивалютность (сейчас одна валюта), регистронезависимая уникальность email, тип категории (доход/расход) — сейчас `kind` только у транзакции. В `@kopilka/shared` `amount: z.number()`, а Prisma отдаёт `Decimal` (в JSON — строка): контракт суммы в API решить при фиче транзакций.

Exception filter и request-id готовы: middleware `requestIdMiddleware` берёт `X-Request-ID` клиента (только `[\w-]{1,128}`, иначе генерирует UUID), кладёт в `req.id` и возвращает в заголовке ответа; `requestId` в теле ошибки совпадает с заголовком. e2e-тесты формата ошибок — `apps/api/test/errors.e2e-spec.ts`.

Следующее: логирование `nestjs-pino` — взять `req.id` как id запроса (`genReqId: (req) => req.id`), прокинуть через AsyncLocalStorage. Учесть: pino-http сам дополняет `IncomingMessage.id`, наше дополнение `Request.id?` в `request-id.middleware.ts` может с ним конфликтовать.

История решений и исходные тексты конфигов — в [docs/planning-log.md](docs/planning-log.md).

## Windows-специфика

- `mkdir -p` не работает в PowerShell — вместо него `mkdir apps, packages\shared\src`.
- Docker Desktop должен быть запущен до `pnpm db:up`.
- `.gitattributes` с `* text=auto eol=lf`, чтобы git не смешивал CRLF и LF.
- Node >= 22 (зафиксировано в `engines`).
- У Nest скрипт watch-запуска зовётся `start:dev`, поэтому в `apps/api/package.json` добавлен `"dev": "nest start --watch"` для корневого `pnpm dev`.
- После остановки `pnpm dev` дочерние node-процессы могут пережить родителя и держать порты 3000/5173.
- На чистом клоне перед первым `pnpm dev`: собрать `shared` (`pnpm --filter @kopilka/shared build`) и скопировать `apps/api/.env.example` в `apps/api/.env`.
