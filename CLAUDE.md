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

Отложено сознательно (решить при проектировании фич): бюджеты, мультивалютность (сейчас одна валюта), архив счетов.

Exception filter готов; `requestId` в теле ошибки совпадает с заголовком `X-Request-ID`. e2e-тесты — `apps/api/test/errors.e2e-spec.ts`.

Логирование: `nestjs-pino` (конфиг — `apps/api/src/common/logging/logger.config.ts`, тесты — `apps/api/test/logging.e2e-spec.ts`).

- Request-id генерирует сам pino-http (`genReqId: resolveRequestId`): берёт `X-Request-ID` клиента (только `[\w-]{1,128}`, иначе UUID), кладёт в `req.id`, возвращает в заголовке. Отдельного middleware нет — один источник id.
- Любой лог внутри запроса (`new Logger(Ctx)` из `@nestjs/common` или `PinoLogger`) автоматически получает `reqId` через AsyncLocalStorage (`quietReqLogger: true` — только `reqId`, без всего запроса). Логировать через Nest `Logger`, не через `console`.
- Access-лог: 2xx/3xx → info, 4xx → warn, 5xx → error. `authorization`, `cookie`, `set-cookie` маскируются.
- Уровень: `LOG_LEVEL`, по умолчанию debug в development, silent в test, info в production. В development — pino-pretty, в остальных — JSON.
- Ошибки body-parser (битый JSON, 413) случаются до pino-http: access-лога для них нет, поэтому фильтр сам назначает request-id и пишет warn-строку.

Авторизация (`apps/api/src/auth/`, e2e — `apps/api/test/auth.e2e-spec.ts`): `POST /auth/register|login|refresh|logout`, `GET /auth/me`.

- **Все роуты требуют access-токен по умолчанию** (глобальный `JwtAuthGuard` через `APP_GUARD`). Открытые помечать `@Public()`. Текущий пользователь — `@CurrentUser() user: AuthUser`.
- Access-токен: JWT HS256, 15 мин (`JWT_ACCESS_TTL_SECONDS`), в теле ответа; фронт держит его в памяти (не localStorage). Алгоритм закреплён в `verifyOptions`. Проверка без похода в БД.
- Refresh-токен: случайные 32 байта, в БД только SHA-256 (`refresh_tokens.token_hash`), 30 дней (`REFRESH_TOKEN_TTL_DAYS`). Кука `refresh_token`: httpOnly, `SameSite=Strict`, `Path=/api/auth`, `Secure` только в production. `cookie-parser` подключён только для `AuthController`.
- Ротация: каждый refresh гасит токен и выдаёт новый в том же семействе (`family_id` = сессия). Повторное предъявление погашенного токена = кража → гасится всё семейство, warn в лог. Гашение — атомарный compare-and-set (`updateMany ... where revokedAt: null`) в транзакции с выдачей нового.
- Компромисс: два одновременных refresh с одним токеном (две вкладки) выглядят как повторное использование и разлогинивают. Если станет проблемой — grace period в несколько секунд или координация вкладок на фронте (BroadcastChannel / Web Locks).
- Пароли: argon2id через `@node-rs/argon2` (параметры OWASP по умолчанию, без install-скриптов). Логин отвечает одинаково на неверный пароль и неизвестный email и проверяет хеш-пустышку, чтобы время ответа не выдавало зарегистрированные email.
- Email нормализуется в схеме (`trim` + `toLowerCase` до проверки формата) — уникальность фактически регистронезависимая.
- `SameSite=Strict` рассчитан на то, что фронт и API на одном origin: в проде API сам отдаёт фронт, в dev Vite проксирует `/api`. Если фронт и API разъедутся по разным доменам — пересмотреть (`SameSite=None` + CSRF-защита). Платформенные домены (`*.up.railway.app`, `*.fly.dev`) — в Public Suffix List: два сервиса на них — разные сайты.
- Не сделано: очистка истёкших/погашенных `refresh_tokens` (фоновая задача, когда понадобится), смена пароля и «выйти на всех устройствах», блокировка по аккаунту (сейчас лимит попыток только по IP — перебор паролей одного аккаунта с многих IP он не остановит).

Сообщения ошибок: верхнеуровневый `message` — на английском (для разработчика и логов), `details[].message` — на русском (показываются пользователю у поля формы).

Сборка приложения и тесты:

- То, что живёт в модулях (фильтр, пайп, guard'ы, middleware) — через `APP_*`-провайдеры в модулях. То, что настраивается на уровне приложения (`app.use`, `enableCors`, shutdown hooks) — только в `setupApp()` (`apps/api/src/app.setup.ts`), его вызывают и `main.ts`, и тесты. В `main.ts` — только логгер и `listen`.
- e2e-файлы идут параллельно на одной БД: пользователей создавать через `testUsers(app)` (`apps/api/test/utils/auth.ts`) и удалять в `afterAll` только своих (`users.cleanup()`). Удаление «всех тестовых» по домену стирает данные соседнего набора посреди теста (так ловился флейк пагинации).
- e2e-тесты поднимают приложение через `createTestApp()` (`apps/api/test/utils/create-test-app.ts`): `AppModule` + `setupApp`, логгер выключен, throttler выключен (все запросы с одного IP); `{ throttle: true }` — для тестов лимитов, `{ controllers }` — для служебных контроллеров.

Защита (e2e — `apps/api/test/security.e2e-spec.ts`):

- helmet — через `app.use` в `setupApp`, поэтому заголовки есть и на ответах body-parser (битый JSON). Убирает `X-Powered-By`.
- CORS: `CORS_ORIGINS` (через запятую, только origin без пути и слеша на конце, по умолчанию `http://localhost:5173`), `credentials: true` для куки refresh-токена. Самому фронту CORS не нужен (один origin); оставлен для клиентов с другого origin. Наружу открыты заголовки `X-Request-ID` и `Retry-After`.
- Throttler (`@nestjs/throttler`, глобальный guard): 100 запросов в минуту с IP на маршрут; `/auth/login` и `/auth/register` — по 10 в минуту (`@Throttle(AUTH_THROTTLE)`). Превышение → 429 `RATE_LIMITED` + `Retry-After`. Счётчики в памяти процесса — при нескольких инстансах нужно общее хранилище (Redis).
- `trust proxy` — через `TRUST_PROXY_HOPS` (число прокси перед приложением, по умолчанию 0 = `X-Forwarded-For` игнорируется). **При деплое за прокси (Railway, Fly.io) выставить 1**, иначе `req.ip` у всех клиентов будет адресом прокси и лимит станет общим на всех пользователей. Никогда не `true`: тогда клиент сам впишет любой IP в `X-Forwarded-For` и обойдёт лимиты. e2e — `apps/api/test/trust-proxy.e2e-spec.ts`.

Health-чеки (`apps/api/src/health/`, e2e — `apps/api/test/health.e2e-spec.ts`), `@nestjs/terminus`:

- `GET /health/live` — liveness, без проверки зависимостей (упавшая БД не лечится рестартом, а падающая liveness-проба вызвала бы рестарты по кругу). Для liveness-пробы платформы.
- `GET /health/ready` — readiness, `SELECT 1` в БД с таймаутом 1 с; при отказе — 503 `SERVICE_UNAVAILABLE` без деталей в ответе, причина (`Database query failed: ECONNREFUSED`) — одной JSON-строкой в логе. Для readiness-пробы / healthcheck деплоя.
- Оба `@Public()` и `@SkipThrottle()`; в access-лог не пишутся.
- Свой `DatabaseHealthIndicator` вместо `PrismaHealthIndicator` из terminus: тот сначала вызывает MongoDB-метод и распознаёт SQL-базу по тексту ошибки.
- Новые зависимости, без которых приложение не может работать (Redis и т.п.), добавлять в `/health/ready`, не в `/health/live`.
- Фильтр ошибок: 503 → `SERVICE_UNAVAILABLE` и без стека в логе (его бросают намеренно, причину логирует бросивший); прочие 5xx → `INTERNAL_ERROR` со стеком.

OpenAPI (`apps/api/src/openapi.ts`, e2e — `apps/api/test/openapi*.e2e-spec.ts`):

- Единственный источник правды — Zod-схемы из `@kopilka/shared`. Тело запроса попадает в документ само из `@Body({ schema })`; ответы описывать `@ApiOkResponse({ standardSchema: someSchema })` / `@ApiCreatedResponse`; ошибки — `@ApiErrorResponses(400, 401, ...)` (`apps/api/src/common/openapi/`). DTO-классы с `@ApiProperty` не писать.
- Экспортируемые схемы в shared помечать `.meta({ id: 'Name' })` — иначе в OpenAPI и во фронтовых типах они будут безымянными инлайнами.
- Входная сторона `pipe` (нормализация перед проверкой) описывается в доках как голая строка — правила после `pipe` повторять в `.meta({ format, maxLength })` на входной стороне (см. `emailSchema`).
- Даты (`z.coerce.date()`) описываются как `string` / `date-time` своим `standardSchemaConverter`: Zod сам не умеет `Date` в JSON Schema и без конвертера падал бы старт приложения.
- `@Public()` заодно ставит в документе `security: [{}]`; остальные операции — с глобальным bearer.
- Swagger UI — `/docs`, JSON — `/docs/openapi.json`; только вне production. В dev CSP без `upgrade-insecure-requests`, иначе `/docs` не грузится по HTTP.
- **После изменения API: `pnpm api:generate`** — собирает api, пишет `apps/api/openapi.json` и генерирует `apps/web/src/shared/api/schema.d.ts` (openapi-typescript). Оба файла коммитятся, в `.prettierignore`. e2e-тест падает, если `openapi.json` не совпадает с кодом. Генерация читает `apps/api/.env` (валидация конфига), БД не нужна.

CI (`.github/workflows/ci.yml`), на push в `main` и на каждый PR, два параллельных job'а:

- `checks`: `format:check` → `lint` → `build` → `typecheck` → `test` → `api:generate` + `git diff --exit-code` (устаревшие `openapi.json` / `schema.d.ts` валят CI).
- `e2e`: Postgres 16 как сервис → `db:deploy` (как при деплое) → `prisma migrate diff --exit-code` (ловит изменение `schema.prisma` без миграции) → e2e.
- Тестовые `DATABASE_URL` / `JWT_ACCESS_SECRET` заданы в `env` workflow — не секреты. `.env` в CI нет, конфиг читается из окружения.
- Экшены закреплены по SHA с комментарием версии; обновляет Dependabot (`.github/dependabot.yml`, только github-actions). Новые экшены добавлять так же, по SHA.
- Версия Node — из `.nvmrc` (22), pnpm — из `packageManager`.
- `pnpm typecheck` проверяет все пакеты, у `api` — вместе с `test/` (`nest build` проверяет только `src/`).
- Перед пушем можно прогнать то же локально: `pnpm format:check && pnpm lint && pnpm build && pnpm typecheck && pnpm test && pnpm --filter api test:e2e`.

Фаза 2 закрыта.

Деплой (платформа ещё не выбрана; образ проверен локально):

- **Все маршруты API — под `/api`** (`setGlobalPrefix`, `API_PREFIX` в `apps/api/src/common/http/api-prefix.ts`), включая health: `/api/health/live|ready`. Пути в остальных разделах CLAUDE.md и в OpenAPI — без префикса: документ строится с `ignoreGlobalPrefix` и `servers: ['/api']`, поэтому фронтовые типы остались `'/transactions'`. Вне префикса — только `/docs` (не в production) и фронт.
- Один процесс отдаёт и API, и собранный фронт (`WEB_DIST_DIR`, `apps/api/src/web-app.ts`, e2e — `test/web-app.e2e-spec.ts`): `/assets/*` — `immutable` на год, любой GET-запрос страницы вне `/api` без расширения — `index.html` с `no-cache`, отсутствующий файл — 404. Причина одного origin — кука `SameSite=Strict` и отсутствие CORS. Регистрируется в `setupApp` до `app.init()`, иначе её перехватит 404 роутера Nest.
- CSP от helmet (`script-src 'self'`) запрещает инлайн-скрипты: скрипт темы — файлом `apps/web/public/theme-init.js`.
- `Dockerfile` (multi-stage, `node:22-bookworm-slim`): `build` (всё + сборка shared → web → api), `migrate` (на базе build: Prisma CLI + openssl, `prisma migrate deploy`), `runtime` — по умолчанию (prod-зависимости api, `--ignore-scripts`, три `dist`, `USER node`, `HEALTHCHECK`, `node dist/main.js` напрямую — SIGTERM доходит до приложения). Миграции — отдельным шагом релиза, не при старте приложения.
- Известный компромисс: образ ~890 МБ, из них ~200 МБ — Prisma CLI с деревом (Studio, TypeScript): lockfile разрешает `@prisma/client` вместе с его optional peer `prisma`, и `--prod` его оставляет (`pnpm deploy` — тоже). Убрать — вынести схему и CLI в отдельный пакет.
- Локально: `pnpm prod:up` (профиль `prod` в `docker-compose.yml`: `migrate` → `app` на `http://localhost:8080`, БД — та же dev-база), `pnpm prod:down`.
- CI-job `image`: сборка обоих образов, миграции на пустой БД, старт, smoke-тест `/api/health/ready` и страницы `/categories`.
- На платформе: `NODE_ENV=production` уже в образе; задать `DATABASE_URL`, `JWT_ACCESS_SECRET`, `TRUST_PROXY_HOPS=1`; healthcheck — `/api/health/ready`; миграции — образ `migrate` (или `prisma migrate deploy` из CI) перед выкаткой.

Фронт (`apps/web`): регистрация, вход, выход, защищённая главная.

- FSD, импорт слоёв через `@/` (`@/app`, `@/pages`, `@/features`, `@/entities`, `@/shared`); из слайса — только через его `index.ts`. Зависимости только вниз: `shared` не импортирует `entities`.
- Стек: RTK Query (`shared/api/base-api.ts`, эндпоинты — `injectEndpoints` в слайсах), react-router 8 (`createBrowserRouter`), react-hook-form + `standardSchemaResolver` со схемами из `@kopilka/shared` (те же, что валидирует API).
- Типы запросов/ответов — из сгенерированного контракта: `RequestBody<'/auth/login', 'post'>`, `ResponseBody<'/auth/me', 'get', 200>`, URL — `'/auth/login' satisfies ApiPath`. Переименование пути или смена тела на бэке ломает компиляцию фронта.
- Сессия (`entities/session`): access-токен только в памяти (Redux), не в localStorage. После перезагрузки — `restoreSession` (POST `/auth/refresh` с httpOnly-кукой), до ответа статус `unknown` и лоадер.
- `shared/api/base-query.ts`: на 401 (кроме `/auth/login|register|refresh|logout`) — один refresh и повтор запроса. Одновременные refresh в вкладке объединяются в один запрос; между вкладками — Web Lock `kopilka:refresh-session`, иначе две вкладки отправят один и тот же refresh-токен и API разлогинит обе (обнаружение кражи). Слой API сообщает о сессии экшенами `sessionStarted` / `sessionEnded` из `shared/api`, их редьюсит `entities/session` — так `shared` не зависит от `entities`.
- Каждый запрос шлёт `X-Request-ID` (тот же id попадает в логи API).
- Ошибки API: `applyApiError(error, setError, fields)` раскладывает `details[].field` по полям формы, остальное — в `errors.root.server`; `errorMessage(error)` — текст для пользователя по `code` (для 5xx — с `requestId`).
- Маршруты (`app/router`): `RequireAuth` (анонима — на `/login` с возвратом обратно), `GuestOnly` (вошедшего — с `/login`/`/register` туда, куда шёл).
- `tsconfig.app.json`: `strict` + `noUncheckedIndexedAccess` (в шаблоне Vite strict не было).
- Тесты: Vitest + RTL + MSW 3 (`pnpm --filter web test`). `src/test/render.tsx` — `renderApp(path, { session })` поднимает реальные store, роуты и guard'ы. Запрос без MSW-обработчика **валит тест** (`src/test/setup.ts`; в MSW 3 опция называется `onUnhandledFrame`, а стратегия `'error'` сама тест не валит).
- API для фронта — `/api` на том же origin (`VITE_API_URL` переопределяет). В dev Vite проксирует `/api` на `:3000` (`API_PROXY_TARGET`), так что кука `Path=/api/auth` работает как в проде.

Не сделано на фронте: e2e на Cypress (в плане), обработка `Retry-After` в тексте ошибки (fetchBaseQuery не отдаёт заголовки в `error`), code splitting (бандл ~560 КБ, ~178 КБ gzip — заметную часть даёт Zod из shared).

Категории и транзакции (API + фронт). Решения:

- Сумма в API — десятичная строка (`"1234.56"`, ответы всегда с 2 знаками), `amountSchema` в shared принимает ввод `"1 234,5"`. Фронт деньги не считает; итоги — SQL `SUM` в numeric. `Number()` — только для отображения (`formatMoney`).
- Тип (доход/расход) — у категории (`categories.kind`), у транзакции поля `kind` больше нет. Уникальность имени — `(user_id, kind, name)`.
- Составной FK `transactions(category_id, user_id) → categories(id, user_id)`: чужую категорию отвергает сама БД. Сервис всё же читает категорию — проверить, что её вид совпадает с `type` операции.
- Курсорная (keyset) пагинация `GET /transactions` по `(occurred_at, id)`, индекс `(user_id, occurred_at DESC, id DESC)`, `take: limit + 1`, курсор — непрозрачный base64url.
- Чужие записи → 404. Удаление категории с операциями → 409 `CATEGORY_IN_USE`.
- `prisma migrate dev` не работает в неинтерактивной оболочке, если миграция удаляет данные: SQL генерировать через `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` в новую папку миграции, затем `pnpm --filter api db:deploy`.
- Схемы ответов в shared используют `z.coerce.date()`, чтобы ими можно было разбирать JSON.

- Фронт: страницы `/` (итоги месяца, счета, форма операции, лента с «Показать ещё»), `/accounts` и `/categories`, шапка с навигацией (`widgets/app-header`), макет `app/layouts/AppLayout`. Слой `widgets` FSD — составные блоки страниц. Удаление — двухшаговой `ConfirmButton` (без `window.confirm`).
- Кэш RTK Query: теги объявляются в сущностях через `enhanceEndpoints({ addTagTypes })`; мутации операций инвалидируют `Transaction` и `Account` (лента, итоги и балансы перезапрашиваются сами); переименование категории или счёта — тоже `Transaction` (в операциях их имена).
- Тесты фронта: `mockAccount()` (`src/test/account.ts`) — API в памяти, созданное/удалённое видно в следующем запросе; `expectOperationsPage()` ждёт полной загрузки стартовой страницы, иначе её запросы долетают в следующий тест.

Не сделано: категории по умолчанию для нового пользователя.

Аналитика: `GET /transactions/by-category?from&to&kind` (kind по умолчанию `expense`) — суммы по категориям одним `GROUP BY` в SQL, по убыванию, только категории с операциями за период. Фронт показывает долю от итога из `/transactions/summary` (тот же кэш RTK Query), сам деньги не складывает.

Главная (`pages/transactions`): месяц и фильтр ленты — в URL (`?month=2026-10` и одно из `&type=income|expense|transfer`, `&category=<id>`, `&account=<id>`; текущий месяц — без параметра). Месяц задаёт итоги, диаграмму и ленту. Клик по категории в диаграмме или по счёту в полосе счетов фильтрует ленту, повторный — сбрасывает.

Счета и переводы (API `apps/api/src/accounts/`, e2e — `test/accounts.e2e-spec.ts`; фронт — `entities/account`, `features/account-form|account-delete`, `widgets/account-list|account-strip`, страница `/accounts`):

- `accounts`: `name` (уникально у пользователя), `type` (`card | cash | savings` — только иконка), `opening_balance`, `allow_negative`. Новый пользователь получает «Основной счёт» при регистрации, в одной транзакции с созданием. Удалить счёт с операциями нельзя (`RESTRICT` → 409 `ACCOUNT_IN_USE`).
- **Баланс не хранится**, считается при чтении: `opening_balance + доходы − расходы − переводы со счёта + переводы на счёт` (`balancesQuery` в `AccountsService`, два коррелированных `SUM` по индексам `account_id` / `to_account_id`). `GET /accounts` → `{ items, total }`: итог по всем счетам складывает сервер (`Decimal`), не фронт.
- **Перевод — строка той же `transactions`** без категории и с `to_account_id`. Типа в БД нет: перевод ⇔ `to_account_id IS NOT NULL`, доход/расход — по `categories.kind`. В SQL: `CHECK (num_nonnulls(category_id, to_account_id) = 1)`, `CHECK (to_account_id <> account_id)`, у счетов `CHECK (allow_negative OR opening_balance >= 0)` — Prisma их не видит, `migrate diff` на них не ругается. Итоги и диаграмма делают `JOIN categories` — переводы туда не попадают сами.
- В API операция — дискриминированное объединение по `type` (`income | expense | transfer`) и в запросе (`TransactionInput`), и в ответе (`CategorizedTransaction | Transfer`). Изменение — **`PUT /transactions/:id` целиком** (операция может стать переводом), не `PATCH`. `type` дохода/расхода должен совпадать с видом категории (400 `categoryId`).
- **Запрет ухода в минус** (`allow_negative = false`): каждая запись (создание, замена, удаление операции, изменение счёта) — интерактивная транзакция Prisma на READ COMMITTED: `SELECT … FOR UPDATE` затронутых счетов одним запросом в порядке id (без дедлоков), запись, проверка итогового баланса (`assertNotNegative`), при минусе — исключение и откат: 409 `INSUFFICIENT_FUNDS` с `details[].field` (`amount` / `openingBalance` / `allowNegative`) и текстом «На счёте «X» не хватает N ₽». У замены и удаления сначала блокируется строка операции, потом счета — везде один порядок. Проверка «после записи» одинаково покрывает расход, перевод, перенос операции на другой счёт и удаление дохода.
- e2e `lets concurrent expenses through only while there is money`: 10 параллельных расходов по 300 при 1000 → ровно 3 проходят. Без `FOR UPDATE` проходят 8–9 (проверено) — это write skew. Альтернатива — `SERIALIZABLE` с повтором при ошибке сериализации.
- Миграция `accounts_and_transfers` — пример expand → backfill → contract в одном файле (nullable колонка → «Основной счёт» каждому пользователю и `UPDATE` операций → `SET NOT NULL`); в комментарии — как это разложить на релизы при zero-downtime.

Дизайн интерфейса:

- CSS Modules + токены в `app/styles/index.css`. Каждый цвет записан один раз через `light-dark()`; тему выбирает `color-scheme` (системная по умолчанию). Новые цвета — только токенами, без хардкода в модулях (исключение — текст на градиентной карточке итогов).
- Тема: `useTheme()` (`shared/lib/theme.ts`) ставит `data-theme` на `<html>` и пишет в `localStorage` (`kopilka:theme`); инлайн-скрипт в `index.html` применяет её до первой отрисовки. Переключатель — `features/theme-toggle`.
- Шрифт Inter Variable (`@fontsource-variable/inter`), суммы — `tabular-nums`. Иконки — `lucide-react`.
- Макет страниц: контент + липкая колонка с формой справа (`pages/page.module.css`), до 960px — одна колонка, форма сверху. До 640px навигация шапки становится нижним таб-баром. `backdrop-filter` у шапки — на `::before`: на самом элементе он сделал бы шапку containing block для `position: fixed` таб-бара.
- Лента сгруппирована по локальным дням («Сегодня», «Вчера», «9 октября, пятница»), у каждого дня свой `<ul aria-label>`. Строка — кнопка: открывает модалку редактирования, удаление — внутри неё. Категории — так же (переименование + удаление).
- Модалки — `shared/ui/Dialog` на нативном `<dialog>` (`showModal`: фокус-ловушка, Esc, инертный фон даёт браузер), на телефоне — bottom sheet. Контент монтируется при открытии, поэтому анимация только на вход. В jsdom нет `showModal`/`close` — полифил в `src/test/setup.ts`.
- До 960px форма новой операции открывается плавающей кнопкой «+» в модалке (боковая колонка скрыта).
- Цвета категорий — категориальная палитра `--series-1..8` (проверена на различимость при дальтонизме в обеих темах). Слот = порядок создания категории внутри её типа (id — UUIDv7), `useCategoryColor` (`entities/category/lib/color.ts`) читает уже загруженный список категорий. После 8-й категории — нейтральный `--series-none`, новых оттенков не генерировать. Один и тот же цвет у категории в аватаре и в диаграмме.
- Тосты (`toast('…')` из `shared/ui`) — только об успехе; ошибки — в форме или рядом с кнопкой. `<Toaster>` — в `AppLayout`.
- Загрузка — скелетоны (`Skeleton`), не «Загрузка…». Новая операция (создана < 10 с назад) появляется с анимацией.
- `formatMoney` пишет минус типографским `−`, как в ленте.

История решений и исходные тексты конфигов — в [docs/planning-log.md](docs/planning-log.md).

## Windows-специфика

- `mkdir -p` не работает в PowerShell — вместо него `mkdir apps, packages\shared\src`.
- Docker Desktop должен быть запущен до `pnpm db:up`.
- `.gitattributes` с `* text=auto eol=lf`, чтобы git не смешивал CRLF и LF.
- Node >= 22 (зафиксировано в `engines`).
- У Nest скрипт watch-запуска зовётся `start:dev`, поэтому в `apps/api/package.json` добавлен `"dev": "nest start --watch"` для корневого `pnpm dev`.
- После остановки `pnpm dev` дочерние node-процессы могут пережить родителя и держать порты 3000/5173.
- На чистом клоне перед первым `pnpm dev`: собрать `shared` (`pnpm --filter @kopilka/shared build`) и скопировать `apps/api/.env.example` в `apps/api/.env`.
