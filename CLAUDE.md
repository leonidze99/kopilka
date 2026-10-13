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

Отложено сознательно (решить при проектировании фич): мультивалютность (сейчас одна валюта), архив счетов, уведомления (о перерасходе бюджета, о пропущенном регулярном платеже).

Exception filter готов; `requestId` в теле ошибки совпадает с заголовком `X-Request-ID`. e2e-тесты — `apps/api/test/errors.e2e-spec.ts`.

Логирование: `nestjs-pino` (конфиг — `apps/api/src/common/logging/logger.config.ts`, тесты — `apps/api/test/logging.e2e-spec.ts`).

- Request-id генерирует сам pino-http (`genReqId: resolveRequestId`): берёт `X-Request-ID` клиента (только `[\w-]{1,128}`, иначе UUID), кладёт в `req.id`, возвращает в заголовке. Отдельного middleware нет — один источник id.
- Любой лог внутри запроса (`new Logger(Ctx)` из `@nestjs/common` или `PinoLogger`) автоматически получает `reqId` через AsyncLocalStorage (`quietReqLogger: true` — только `reqId`, без всего запроса). Логировать через Nest `Logger`, не через `console`.
- Access-лог: 2xx/3xx → info, 4xx → warn, 5xx → error. `authorization`, `cookie`, `set-cookie` маскируются.
- Уровень: `LOG_LEVEL`, по умолчанию debug в development, silent в test, info в production. В development — pino-pretty, в остальных — JSON.
- Ошибки body-parser (битый JSON, 413) случаются до pino-http: access-лога для них нет, поэтому фильтр сам назначает request-id и пишет warn-строку.

Авторизация (`apps/api/src/auth/`, e2e — `apps/api/test/auth.e2e-spec.ts`): `POST /auth/register|login|refresh|logout`, `GET /auth/me`.

- **Все роуты требуют access-токен по умолчанию** (глобальный `JwtAuthGuard` через `APP_GUARD`). Открытые помечать `@Public()`. Текущий пользователь — `@CurrentUser() user: AuthUser`.
- Access-токен: JWT HS256, 15 мин (`JWT_ACCESS_TTL_SECONDS`), в теле ответа; фронт держит его в памяти (не localStorage). Алгоритм закреплён в `verifyOptions`. В нём `sub` и `sid` (id сеанса). **Guard после проверки подписи читает строку `sessions` по первичному ключу** (`SessionsService.isActive`): завершённый сеанс (выход, отзыв, смена пароля, кража) отвечает 401 сразу, а не через 15 минут. Сознательный обмен «запрос в БД на каждый вызов» на мгновенный отзыв. Токен без `sid` — 401, клиент сам обновится.
- Refresh-токен: случайные 32 байта, в БД только SHA-256 (`refresh_tokens.token_hash`), 30 дней (`REFRESH_TOKEN_TTL_DAYS`). Кука `refresh_token`: httpOnly, `SameSite=Strict`, `Path=/api/auth`, `Secure` только в production. `cookie-parser` подключён только для `AuthController`.
- Сеансы (`sessions`, e2e — `test/sessions.e2e-spec.ts`): строка на вход — устройство (User-Agent → «Chrome, Windows», `user-agent.ts`), IP (`req.ip`, с учётом `TRUST_PROXY_HOPS`), `created_at`, `last_used_at` (каждый refresh), `expires_at` (вместе с новейшим токеном), `revoked_at`. `refresh_tokens.family_id` → `sessions.id`. **Два разных «погашен»**: `refresh_tokens.revoked_at` — токен израсходован ротацией (нужен для обнаружения кражи), `sessions.revoked_at` — сеанс завершён (единственный источник правды для guard'а и refresh). Токен завершённого сеанса — просто 401, не «кража».
- Ротация: каждый refresh гасит токен и выдаёт новый в том же сеансе. Повторное предъявление израсходованного токена = кража → сеанс завершается, warn в лог. Гашение — атомарный compare-and-set (`updateMany ... where revokedAt: null`) в транзакции с выдачей нового.
- `GET /auth/sessions` (текущий первым), `DELETE /auth/sessions/:id`, `DELETE /auth/sessions` (все, кроме текущего), `POST /auth/password { currentPassword, newPassword }` — нужен текущий пароль даже вошедшему; новый хеш и завершение остальных сеансов — одна транзакция; лимит как у входа (`AUTH_THROTTLE`: проверка пароля = способ перебора). Фронт — `/settings` (`widgets/session-list`, `features/change-password|session-end`), вход — аватар в шапке.
- Очистка (`SessionsService.tick`, ежедневно в 4:00, `JOBS_ENABLED`): удаляются завершённые/истёкшие сеансы (с токенами) и истёкшие токены; израсходованные, но живые токены живых сеансов остаются — по ним ловится кража. `cleanup(now, { userId })` в тестах — только свои строки (как `runDue`).
- Миграция `sessions` переносит существующие семейства (живое — есть неизрасходованный токен), до внешнего ключа — входы пользователей не обрываются.
- Компромисс: два одновременных refresh с одним токеном (две вкладки) выглядят как повторное использование и разлогинивают. Если станет проблемой — grace period в несколько секунд или координация вкладок на фронте (BroadcastChannel / Web Locks).
- Пароли: argon2id через `@node-rs/argon2` (параметры OWASP по умолчанию, без install-скриптов). Логин отвечает одинаково на неверный пароль и неизвестный email и проверяет хеш-пустышку, чтобы время ответа не выдавало зарегистрированные email.
- Email нормализуется в схеме (`trim` + `toLowerCase` до проверки формата) — уникальность фактически регистронезависимая.
- `SameSite=Strict` рассчитан на то, что фронт и API на одном origin: в проде API сам отдаёт фронт, в dev Vite проксирует `/api`. Если фронт и API разъедутся по разным доменам — пересмотреть (`SameSite=None` + CSRF-защита). Платформенные домены (`*.up.railway.app`, `*.fly.dev`) — в Public Suffix List: два сервиса на них — разные сайты.
- **Блокировка по аккаунту** (политика — `apps/api/src/auth/login-lock.ts`, чистые функции + юнит-тесты `login-lock.spec.ts`; e2e — `describe('account lockout')` в `test/auth.e2e-spec.ts`): счётчик неудач на строке `users` (`failed_login_attempts`, `last_failed_login_at`, `locked_until`), 10 промахов подряд (`LOGIN_MAX_FAILURES`) → блокировка на 5 минут (`LOGIN_LOCK_MINUTES`), каждая следующая неудача удваивает срок до часа; неудача через час после предыдущей (окно) начинает счёт заново. Лимит троттлера по IP остаётся — он не ловит перебор одного аккаунта с многих адресов.
  - **Попытки во время блокировки её не продлевают** — иначе чужой аккаунт можно держать закрытым бесконечно. Правильный пароль во время блокировки тоже отклоняется (иначе блокировка не мешает перебору); владельцу открывает аккаунт смена пароля — она же стирает счётчик.
  - Чтение и запись счётчика — `SELECT … FOR UPDATE` в транзакции: без него десяток параллельных попыток прочитал бы одно значение и записал его друг поверх друга (потерянное обновление), то есть считался бы одной неудачей. e2e проверяет именно это: 10 запросов разом → ровно один 429.
  - Блокировка проверяется **до** argon2: атака на заблокированный аккаунт не стоит серверу CPU. Промахи по неизвестному email не считаются (строка на каждый мусорный адрес = таблица, которую наполняет кто угодно); факт регистрации email и так узнаётся через `POST /auth/register` (409).
  - Побочный эффект для публичной демо-учётки: любой, кто десять раз ошибётся её паролем, закроет её на 5 минут для всех. Если станет мешать — исключение для демо-пользователя или пароль прямо на странице входа.
  - Ответ — 429 `ACCOUNT_LOCKED` + `Retry-After`; срок дублируется в русском `details[].message`, потому что `fetchBaseQuery` не отдаёт заголовки фронту. `AppException` умеет нести заголовки ответа (`headers`), фильтр их выставляет.
- **Сброс забытого пароля по email** (API — `apps/api/src/auth/password-reset.service.ts`, `apps/api/src/mail/`; e2e — `test/password-reset.e2e-spec.ts`; фронт — `features/forgot-password|reset-password`, страницы `/forgot-password` и `/reset-password`, ссылка «Забыли пароль?» на входе):
  - `POST /auth/password/forgot { email }` → **всегда 204**, зарегистрирован адрес или нет: иначе форма превращается в список зарегистрированных email. `POST /auth/password/reset { token, newPassword }` → 204, дальше пользователь входит сам (сброс не выдаёт сеанс).
  - Таблица `password_resets`: в БД только SHA-256 токена (как у refresh-токенов — 32 случайных байта, быстрый хеш достаточен), TTL `PASSWORD_RESET_TTL_MINUTES` (60 мин), `used_at`. Новая заявка удаляет прежние неиспользованные ссылки — работает только последняя. Гашение при сбросе — тот же compare-and-set (`updateMany … where usedAt: null`), что и при ротации refresh.
  - Сброс **завершает все сеансы** пользователя (это путь возврата после возможной кражи) и **стирает блокировку** по неудачным входам — ею же атакующий может закрыть чужой аккаунт.
  - Не больше одного письма в минуту на аккаунт: форма отправляет письмо на адрес, которым отправитель не обязан владеть, иначе это способ завалить чужой ящик. Плюс лимит троттлера `AUTH_THROTTLE` на оба маршрута.
  - Мёртвая ссылка (неизвестная, использованная, истёкшая) — 400 `INVALID_RESET_TOKEN` с русским текстом в `details[].message`.
  - Проверка интервала между письмами — чтение перед записью без блокировки: два одновременных запроса могут отправить два письма, из которых работает последнее. Цена — лишнее письмо, не дыра, поэтому блокировку строки сюда не тянем.
  - Истёкшие ссылки удаляет та же ежедневная уборка `SessionsService.cleanup`; использованная ссылка живёт до истечения, чтобы повторный клик получил «ссылка недействительна», а не пустоту.
  - Почта — `MailerService` (nodemailer): `MAIL_SMTP_URL` (SMTP есть у любого провайдера — Resend, Postmark, Mailgun — так что клиент под конкретного не нужен), `MAIL_FROM`, ссылки строятся от `APP_URL`. **Без `MAIL_SMTP_URL` (dev, тесты) письмо не уходит, а пишется в лог** — ссылку видно в консоли. Ошибка отправки не глотается: пользователь увидит ошибку, а не ложное «письмо отправлено».
  - e2e подменяет `MailerService` через `createTestApp({ overrides })` и читает токен из письма (`test/utils/fake-mailer.ts`): в БД токена в открытом виде нет.
  - Фронт: `/forgot-password` после отправки показывает «если адрес зарегистрирован, письмо уже в пути» (не подтверждает существование аккаунта); `/reset-password?token=…` берёт токен из URL, после успеха — тост и переход на `/login`. Обе страницы **вне guard'ов**: по ссылке из письма может прийти и уже вошедший на этом устройстве, `GuestOnly` увёл бы его без объяснений.
  - `<Toaster>` переехал из `AppLayout` в `app/layouts/RootLayout` (обёртка всех маршрутов): тост, поднятый перед переходом на страницу другого макета, иначе не показывался.
- Не сделано: уведомление о входе с нового устройства.

Сообщения ошибок: верхнеуровневый `message` — на английском (для разработчика и логов), `details[].message` — на русском (показываются пользователю у поля формы).

Сборка приложения и тесты:

- То, что живёт в модулях (фильтр, пайп, guard'ы, middleware) — через `APP_*`-провайдеры в модулях. То, что настраивается на уровне приложения (`app.use`, `enableCors`, shutdown hooks) — только в `setupApp()` (`apps/api/src/app.setup.ts`), его вызывают и `main.ts`, и тесты. В `main.ts` — только логгер и `listen`.
- **e2e — на своей базе** `<DATABASE_URL>_test` (`kopilka_test` локально): `vitest.config.e2e.ts` передаёт её URL воркерам, `test/global-setup.ts` создаёт базу при отсутствии и применяет миграции (`migrate deploy`). Раньше тесты шли на dev-базе — и `runner.runDue(future)` провёл демо-пользователю платежи на три месяца вперёд, а cron dev-сервера мог трогать данные тестов.
- e2e-файлы идут параллельно на одной (тестовой) БД: пользователей создавать через `testUsers(app)` (`apps/api/test/utils/auth.ts`) и удалять в `afterAll` только своих (`users.cleanup()`). Удаление «всех тестовых» по домену стирает данные соседнего набора посреди теста (так ловился флейк пагинации). То же для фоновых задач: `runner.runDue(now, { userId: user.id })` — только правила своего пользователя (`TestUser.id`); без этого набор регулярных с часами на месяцы вперёд делал платежи по правилам демо-сида и ловил с его удалением дедлок.
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

CI (`.github/workflows/ci.yml`), на push в `main` и на каждый PR, параллельные job'ы:

- `checks`: `format:check` → `lint` → `build` → `typecheck` → `test` → `api:generate` + `git diff --exit-code` (устаревшие `openapi.json` / `schema.d.ts` валят CI).
- `e2e`: Postgres 16 как сервис → `db:deploy` (как при деплое) → `prisma migrate diff --exit-code` (ловит изменение `schema.prisma` без миграции) → e2e.
- `cypress`: сборка → миграции → один процесс с API и собранным фронтом на :3000 → браузерные сценарии; скриншоты падений уходят в артефакты.
- Тестовые `DATABASE_URL` / `JWT_ACCESS_SECRET` заданы в `env` workflow — не секреты. `.env` в CI нет, конфиг читается из окружения.
- Экшены закреплены по SHA с комментарием версии; обновляет Dependabot (`.github/dependabot.yml`, только github-actions). Новые экшены добавлять так же, по SHA.
- Версия Node — из `.nvmrc` (22), pnpm — из `packageManager`.
- `pnpm typecheck` проверяет все пакеты, у `api` — вместе с `test/` (`nest build` проверяет только `src/`).
- Перед пушем можно прогнать то же локально: `pnpm format:check && pnpm lint && pnpm build && pnpm typecheck && pnpm test && pnpm --filter api test:e2e`. Браузерные сценарии — отдельно, при запущенном `pnpm dev`: `pnpm --filter web e2e`.

Cypress (`apps/web/cypress/`, `pnpm --filter web e2e`, `e2e:open` — интерактивно): пять сценариев в двух спеках против **реального стека** (`onboarding.cy.ts` — регистрация → счёт и категории из коробки → расход → поиск по комментарию с подсветкой; `auth.cy.ts` — редирект анонима, выход и повторный вход, путь к восстановлению пароля). `baseUrl` по умолчанию `http://localhost:5173` (локально при запущенном `pnpm dev`: Vite проксирует `/api`, origin один как в проде), в CI — `CYPRESS_BASE_URL=http://localhost:3000`, где один процесс отдаёт API и собранный фронт. Пользователей спеки создают сами, домен `@cypress.test`; в dev-базе они остаются (удалять вручную). Бинарь браузера ставится только в job'е Cypress (`CYPRESS_INSTALL_BINARY: '0'` на уровне workflow + кеш `~/.cache/Cypress`), иначе его качали бы все job'ы.

Фаза 2 закрыта.

Деплой (платформа ещё не выбрана; образ проверен локально):

- **Все маршруты API — под `/api`** (`setGlobalPrefix`, `API_PREFIX` в `apps/api/src/common/http/api-prefix.ts`), включая health: `/api/health/live|ready`. Пути в остальных разделах CLAUDE.md и в OpenAPI — без префикса: документ строится с `ignoreGlobalPrefix` и `servers: ['/api']`, поэтому фронтовые типы остались `'/transactions'`. Вне префикса — только `/docs` (не в production) и фронт.
- Один процесс отдаёт и API, и собранный фронт (`WEB_DIST_DIR`, `apps/api/src/web-app.ts`, e2e — `test/web-app.e2e-spec.ts`): `/assets/*` — `immutable` на год, любой GET-запрос страницы вне `/api` без расширения — `index.html` с `no-cache`, отсутствующий файл — 404. Причина одного origin — кука `SameSite=Strict` и отсутствие CORS. Регистрируется в `setupApp` до `app.init()`, иначе её перехватит 404 роутера Nest.
- CSP от helmet (`script-src 'self'`) запрещает инлайн-скрипты: скрипт темы — файлом `apps/web/public/theme-init.js`.
- `Dockerfile` (multi-stage, `node:22-bookworm-slim`): `build` (всё + сборка shared → web → api), `migrate` (на базе build: Prisma CLI + openssl, `prisma migrate deploy`), `runtime` — по умолчанию (prod-зависимости api, `--ignore-scripts`, три `dist`, `USER node`, `HEALTHCHECK`, `node dist/main.js` напрямую — SIGTERM доходит до приложения). Миграции — отдельным шагом релиза, не при старте приложения.
- Известный компромисс: образ ~890 МБ, из них ~200 МБ — Prisma CLI с деревом (Studio, TypeScript): lockfile разрешает `@prisma/client` вместе с его optional peer `prisma`, и `--prod` его оставляет (`pnpm deploy` — тоже). Убрать — вынести схему и CLI в отдельный пакет.
- Локально: `pnpm prod:up` (профиль `prod` в `docker-compose.yml`: `migrate` → `app` на `http://localhost:8080`, БД — та же dev-база), `pnpm prod:down`.
- CI-job `image`: сборка обоих образов, миграции на пустой БД, старт, smoke-тест `/api/health/ready` и страницы `/categories`.
- На платформе: `NODE_ENV=production` уже в образе; задать `DATABASE_URL`, `JWT_ACCESS_SECRET`, `TRUST_PROXY_HOPS=1`, `APP_URL` (публичный адрес — из него строятся ссылки в письмах) и `MAIL_SMTP_URL` с `MAIL_FROM` (без них письма сброса пароля только пишутся в лог); healthcheck — `/api/health/ready`; миграции — образ `migrate` (или `prisma migrate deploy` из CI) перед выкаткой.

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
- Тесты: Vitest + RTL + MSW 3 (`pnpm --filter web test`). `src/test/render.tsx` — `renderApp(path, { session })` поднимает реальные store, роуты и guard'ы. Запрос без MSW-обработчика **валит тест** (`src/test/setup.ts`; в MSW 3 опция называется `onUnhandledFrame`, а стратегия `'error'` сама тест не валит). `FormData` и `File` в тестах — нодовские (подменены в `setup.ts`): jsdom-овские не читает fetch из Node, загрузка файла падала с `reading '_buffer'`.
- API для фронта — `/api` на том же origin (`VITE_API_URL` переопределяет). В dev Vite проксирует `/api` на `:3000` (`API_PROXY_TARGET`), так что кука `Path=/api/auth` работает как в проде.

Не сделано на фронте: e2e на Cypress (в плане), обработка `Retry-After` в тексте ошибки (fetchBaseQuery не отдаёт заголовки в `error`).

Code splitting (`apps/web/src/app/router/routes.tsx`): страницы приложения грузятся отдельными чанками через `lazy` у маршрутов, `HydrateFallback` у корневого — лоадер на первую загрузку. Страницы анонима (вход, регистрация, забыли/сброс пароля) остались в первом чанке: вместе это пара килобайт, и это первый экран — лишний round trip ради формы входа не нужен. Первая загрузка 199 → 179 КБ gzip; страницы: лента 10.6, импорт 8.8, регулярные 3.3, счета 2.6, настройки 2.0, категории 1.8 КБ gzip. Главное не в разовой экономии: новая страница больше не увеличивает первый чанк. Остаток первого чанка — react, RTK Query, react-router, react-hook-form и Zod со схемами shared (нужны форме входа, отложить нельзя).

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

Категории по умолчанию: новый пользователь получает 8 категорий (`apps/api/src/categories/default-categories.ts`) — 6 расходных и 2 доходных, в одной транзакции с созданием пользователя и счёта. Порядок задаёт цвета (цвет = место среди категорий своего вида), шесть расходных оставляют два слота палитры под свои. e2e-фикстура `testUsers.signUp()` их удаляет (`signUp({ keepDefaults: true })` — оставляет): иначе наборы, создающие «Зарплату» или «Транспорт», ловили бы 409.

Аналитика: `GET /transactions/by-category?from&to&kind` (kind по умолчанию `expense`) — суммы по категориям одним `GROUP BY` в SQL, по убыванию, только категории с операциями за период. Фронт показывает долю от итога из `/transactions/summary` (тот же кэш RTK Query), сам деньги не складывает.

Динамика по месяцам (API — `TransactionsService.monthly`, схемы — `packages/shared/src/analytics.ts`, e2e — `test/monthly.e2e-spec.ts`; фронт — `widgets/monthly-trend` на главной, сравнение — в `widgets/month-summary`):

- `GET /transactions/monthly?from=2025-11&to=2026-10&timeZone=Europe/Moscow` → каждый месяц периода (до 36), пустые — нулями. Месяцы — `generate_series` + `LEFT JOIN` агрегата; месяц операции — `date_trunc('month', occurred_at AT TIME ZONE tz)`; переводы не считаются (`JOIN categories`).
- Фильтр периода — **диапазон по самой `occurred_at`** с границами, посчитанными один раз в поясе пользователя, а не условие на `date_trunc(...)`: так работает индекс `(user_id, occurred_at DESC, id DESC)`.
- EXPLAIN ANALYZE (1 млн строк в базе, 95 тыс. у пользователя за год): Bitmap Index Scan по этому индексу 16 мс + Bitmap Heap Scan ~75 мс (за `amount`/`category_id` идём в таблицу), всего ~100 мс тёплым. Покрывающий `(user_id, occurred_at) INCLUDE (category_id, amount)` дал Index Only Scan, `Heap Fetches: 0`, в 7 раз меньше страниц, но ~68 мс (остальное — агрегация) ценой +64 МБ (полтаблицы) и замедления записи; Prisma не выражает `INCLUDE`. **Не добавлен**: у реального пользователя 2–5 тыс. операций в год, запрос — доли миллисекунды. Вернуться, если появится в медленных логах.
- График — HTML/CSS (не SVG и не библиотека: бандл и так большой), сгруппированные столбцы доход/расход, одна ось, круглые деления (`axis()`), месяц — кнопка: наведение/фокус — подсказка (значения впереди подписей, баланс), клик — выбор месяца страницы (URL). Легенда, таблица в `<details>`, при перезапросе кадр тускнеет, а не пропадает. На телефоне — подпись у каждого второго месяца (выбранный — последний, всегда подписан).
- Цвета графика — токены `--chart-income` / `--chart-expense` (те же зелёный и оранжевый, тёмные шаги подобраны валидатором палитры: полоса яркости и различимость для протанопии); текст — текстовыми цветами.
- Итоги месяца сравниваются с прошлым периодом («↑ 12% к сентябрю»); **текущий месяц — с теми же днями прошлого** («к 1–12 сентября», `previousPeriod` в `shared/lib/month.ts`): с целым прошлым месяцем любой текущий выглядел бы дешевле. Период мемоизирован по месяцу — он зависит от «сейчас» и иначе давал бы новый запрос на каждую отрисовку. Без цвета: на зелёной карточке, и «рост» хорош для доходов и плох для расходов.
- `Panel` с заголовком — именованная область (`aria-labelledby`).

Поиск по комментариям (миграция `comment_search`, `GET /transactions?q=`, e2e — `describe('search by comment')` в `test/transactions.e2e-spec.ts`; фронт — поле в `widgets/transaction-list`, `shared/lib/highlight.ts`):

- **Триграммы (`pg_trgm`), не полнотекстовый поиск**: комментарии — короткие названия, ищут кусок слова («такс» → «Яндекс Такси»); `tsvector` ищет только слова целиком, стеммер на названиях бесполезен. GIN `gin_trgm_ops` обслуживает `LIKE '%…%'`. `pg_trgm` — trusted extension (PG13+), создаётся владельцем БД без суперпользователя.
- `transactions.comment_search` — **генерируемая колонка** `lower(translate(comment, 'ёЁ', 'еЕ'))`: «пятерочка» находит «Пятёрочка», и её не забудет ни один путь записи (форма, импорт, исполнитель, сид). В Prisma — обычное поле с `@default(dbgenerated("…"))` ровно в том виде, как Postgres печатает выражение: иначе `migrate diff` видит в выражении генерации дефолт и считает дрейфом. Писать в неё нельзя (Postgres откажет). `lower()` зависит от `LC_CTYPE` базы: кириллицу складывает при UTF-8-локали (`en_US.utf8`, `C.UTF-8`), не при `C`.
- Запрос нормализуется в JS так же (`searchable()` в `TransactionsService`) и **экранирует `%`, `_`, `\`**: `contains` в Prisma их не экранирует — «100%» находил бы «1005», «__» — всё (e2e).
- Добавление STORED-колонки переписывает таблицу под эксклюзивной блокировкой — на большой живой таблице вместо этого индекс по выражению `CREATE INDEX CONCURRENTLY` (вне транзакции, то есть не в Prisma-миграции) и запросы по тому же выражению.
- EXPLAIN (300 тыс. операций у пользователя): частый запрос (каждая 8-я) — планировщик идёт по индексу ленты `(user_id, occurred_at DESC)` с фильтром и останавливается на 51-й, 2,6 мс; редкий (6 строк) — триграммный индекс + сортировка, 1,2 мс; без триграммного индекса редкий — параллельный seq scan, 44 мс.
- `q` — от 2 символов (400 `q`), поиск **по всем месяцам** (фронт не передаёт `from`/`to`), сочетается с фильтром типа/категории/счёта и курсором. В URL — `&q=`, независимо от фильтра.
- Фронт: черновик в поле, запрос через 300 мс паузы (`CommentSearch`); внешнее изменение `q` (сброс, «назад») подхватывается, но не затирает черновик, если это он же без пробелов по краям. Найденное — `<mark>` с теми же правилами регистра и ё/е (`highlight`). Пока грузится новый результат, виден прежний (как при смене фильтра).

Главная (`pages/transactions`): месяц и фильтр ленты — в URL (`?month=2026-10` и одно из `&type=income|expense|transfer`, `&category=<id>`, `&account=<id>`; текущий месяц — без параметра). Месяц задаёт итоги, диаграмму и ленту. Клик по категории в диаграмме или по счёту в полосе счетов фильтрует ленту, повторный — сбрасывает.

Счета и переводы (API `apps/api/src/accounts/`, e2e — `test/accounts.e2e-spec.ts`; фронт — `entities/account`, `features/account-form|account-delete`, `widgets/account-list|account-strip`, страница `/accounts`):

- `accounts`: `name` (уникально у пользователя), `type` (`card | cash | savings` — только иконка), `opening_balance`, `allow_negative`. Новый пользователь получает «Основной счёт» при регистрации, в одной транзакции с созданием. Удалить счёт с операциями нельзя (`RESTRICT` → 409 `ACCOUNT_IN_USE`).
- **Баланс не хранится**, считается при чтении: `opening_balance + доходы − расходы − переводы со счёта + переводы на счёт` (`balancesQuery` в `AccountsService`, два коррелированных `SUM` по индексам `account_id` / `to_account_id`). `GET /accounts` → `{ items, total }`: итог по всем счетам складывает сервер (`Decimal`), не фронт.
- **Перевод — строка той же `transactions`** без категории и с `to_account_id`. Типа в БД нет: перевод ⇔ `to_account_id IS NOT NULL`, доход/расход — по `categories.kind`. В SQL: `CHECK (num_nonnulls(category_id, to_account_id) = 1)`, `CHECK (to_account_id <> account_id)`, у счетов `CHECK (allow_negative OR opening_balance >= 0)` — Prisma их не видит, `migrate diff` на них не ругается. Итоги и диаграмма делают `JOIN categories` — переводы туда не попадают сами.
- В API операция — дискриминированное объединение по `type` (`income | expense | transfer`) и в запросе (`TransactionInput`), и в ответе (`CategorizedTransaction | Transfer`). Изменение — **`PUT /transactions/:id` целиком** (операция может стать переводом), не `PATCH`. `type` дохода/расхода должен совпадать с видом категории (400 `categoryId`).
- **Запрет ухода в минус** (`allow_negative = false`): каждая запись (создание, замена, удаление операции, изменение счёта) — интерактивная транзакция Prisma на READ COMMITTED: `SELECT … FOR UPDATE` затронутых счетов одним запросом в порядке id (без дедлоков), запись, проверка итогового баланса (`assertNotNegative`), при минусе — исключение и откат: 409 `INSUFFICIENT_FUNDS` с `details[].field` (`amount` / `openingBalance` / `allowNegative`) и текстом «На счёте «X» не хватает N ₽». У замены и удаления сначала блокируется строка операции, потом счета — везде один порядок. Проверка «после записи» одинаково покрывает расход, перевод, перенос операции на другой счёт и удаление дохода.
- e2e `lets concurrent expenses through only while there is money`: 10 параллельных расходов по 300 при 1000 → ровно 3 проходят. Без `FOR UPDATE` проходят 8–9 (проверено) — это write skew. Альтернатива — `SERIALIZABLE` с повтором при ошибке сериализации.
- Миграция `accounts_and_transfers` — пример expand → backfill → contract в одном файле (nullable колонка → «Основной счёт» каждому пользователю и `UPDATE` операций → `SET NOT NULL`); в комментарии — как это разложить на релизы при zero-downtime.

Бюджеты (API `apps/api/src/budgets/`, e2e — `test/budgets.e2e-spec.ts`; фронт — `entities/budget`, `features/budget-form`, `widgets/budget-panel` на главной):

- Лимит расходов категории в месяц — **версиями**: строка `budgets(category_id, amount, effective_from)` действует с месяца `effective_from` до следующей версии; `amount NULL` — «с этого месяца без лимита». Поднять лимит в октябре — сентябрь в истории не меняется. `effective_from` — `date`, CHECK «первое число месяца»; уникальность `(category_id, effective_from)` — одна версия на месяц, запись — upsert.
- `GET /budgets?month=2026-10&from&to`: последняя версия не позже месяца — `DISTINCT ON (category_id) … ORDER BY category_id, effective_from DESC`; потрачено — коррелированный `SUM` за `[from, to)` (границы месяца в поясе пользователя присылает клиент, как в итогах). Ответ `{ items: [{ category, limit, spent, remaining, since }], total }`, всё складывает сервер. `PUT /budgets/:categoryId { month, amount | null }` → 204. Только категории расходов (400). Бюджет удаляется вместе с категорией (`CASCADE`).
- Мутации операций и категорий инвалидируют тег `Budget` (траты и имена меняются).

Регулярные операции (API `apps/api/src/recurring/`, e2e — `test/recurring.e2e-spec.ts`, юнит — `src/recurring/schedule.spec.ts`; фронт — `entities/recurring`, `features/recurring-form|recurring-delete`, `widgets/recurring-list`, страница `/recurring`):

- Правило `recurring_rules`: та же форма, что у операции (категория или `to_account_id`, те же CHECK), плюс `start_on` (дата первого платежа), `time_zone` (IANA, из браузера), `active`, `next_on`/`next_index`, `last_error`. Только ежемесячно. Платёж n = `start_on + n месяцев`, считается **от исходной даты** (31 января → 28 февраля → 31 марта, без сползания) — `schedule.ts`, чистые функции на строках `YYYY-MM-DD`.
- Создание и замена (`PUT`) начинают с первой даты не раньше сегодняшнего дня в поясе правила: прошлые даты не заполняются (могли быть внесены руками). Замена — после последнего уже сделанного платежа, дубля не будет.
- **Исполнитель** `RecurringRunner` — `@nestjs/schedule`, раз в минуту; Postgres как очередь, без Redis: в цикле по одному правилу короткая транзакция — `SELECT … FOR UPDATE OF r SKIP LOCKED` самого старого созревшего правила (несколько инстансов делят работу, не ждут друг друга) → `lock` счетов (как у ручной операции) → операция → сдвиг `next_on`. Созрело — когда день платежа начался в поясе правила (`(now AT TIME ZONE time_zone)::date`); перед этим диапазон по индексу `next_on <= (now + 14 h)::date` (ни один пояс не опережает UTC больше чем на 14 ч). Операция датирована началом дня в поясе (`next_on::timestamp AT TIME ZONE time_zone`). Пропущенные месяцы догоняются (до 500 платежей за тик).
- **Идемпотентность:** у операции `recurring_rule_id` + `recurring_on`, уникальный индекс по паре — второй операции за ту же дату быть не может ни при ретрае, ни при двух исполнителях; исполнитель ещё и проверяет её наличие до вставки (ошибка вставки сломала бы транзакцию).
- Нехватка денег на счёте без минуса: дата **пропускается**, правило идёт дальше, в `last_error` — «12 октября: на счёте «Наличные» не хватило 8 000,00 ₽» (проверка до записи, `AccountsService.shortfall`, под той же блокировкой); следующий успешный платёж её стирает.
- Правило удаляется вместе со счётом или категорией (`CASCADE` — это настройка); сделанные операции остаются (`recurring_rule_id → NULL`). В ленте у таких операций значок повтора.
- `JOBS_ENABLED` (по умолчанию `true`) — в e2e выключен (`vitest.config.e2e.ts`): тесты зовут `runner.runDue(now)` сами, со своим «сейчас». e2e проверяет и двух исполнителей одновременно.
- Свежая операция от правила появляется во фронте только при следующей загрузке ленты (сервер её не «пушит»).

Импорт выписок CSV (API — `apps/api/src/imports/`, e2e — `test/imports.e2e-spec.ts`, юнит — `src/imports/parse-row.spec.ts`; фронт — `entities/import`, `features/import-upload|import-mapping|import-commit|import-discard`, `widgets/import-history`, страницы `/import` и `/import/:id`, тест — `pages/import/ui/ImportPage.test.tsx`):

- Поток: `POST /imports` (multipart, поле `file`) → `PUT /imports/:id/mapping { accountId, timeZone, columns }` → фон: `parsing` → `ready` (сводка, ошибки строк, группы категорий) → `POST /imports/:id/commit { categories }` → фон: `importing` → `done`. Фронт опрашивает `GET /imports/:id`. `DELETE` — пока импорт не `importing`/`done`.
- Загрузка — потоком: busboy → кодировка (валидный UTF-8, иначе Windows-1251) и разделитель по первой строке → `csv-parse` → `createMany` пачками по 1000 в staging-таблицу `import_rows` (сырые ячейки). Лимиты: 10 МБ (обрывает поток сразу, 413), 50 000 строк, 50 колонок. Не в транзакции: загрузка длится сколько угодно и держала бы соединение пула; до конца загрузки импорт в статусе `uploading`, при ошибке удаляется.
- Пресет T-Банка по заголовкам (`presets.ts`; дата `dmy`, «Сумма платежа» со знаком, «Статус» = `OK`), для остальных — догадка по именам колонок. **Пресет написан по известному формату, на реальной выгрузке не проверен.**
- `ImportWorker` — Postgres как очередь, но с **арендой** (`locked_until`, продлевается после каждой пачки), а не блокировкой строки: задача длинная, а блокировка держала бы транзакцию всё это время. Упавший исполнитель просто не продлит аренду. `attempts` > 3 за фазу → `failed`. После `mapping`/`commit` сервис сразу зовёт `kick()` (в процессе, без ожидания), cron раз в 30 с подбирает остальное; раз в час удаляются брошенные импорты старше суток. При `JOBS_ENABLED=false` (e2e) `kick` ничего не делает — тесты зовут `worker.runPending()`.
- Разбор — пачками по короткой транзакции (возобновляемо: разобранная строка имеет `status`), одно `UPDATE … FROM unnest(массивы)` на пачку. Время из файла — локальное (`local_at`), в `occurred_at` переводится в SQL: `AT TIME ZONE time_zone`.
- **Дедупликация:** отпечаток = sha256(базовый ключ строки + номер повтора в файле). Базовый ключ (дата-время из файла, вид, сумма, описание без регистра и лишних пробелов) — в JS; номер повтора — `row_number() OVER (PARTITION BY …)` по всему файлу, после последней пачки. Два одинаковых кофе в одну минуту — две операции, а повторный или пересекающийся импорт даёт те же отпечатки. На `transactions` — `import_fingerprint` + уникальный `(account_id, import_fingerprint)`; дубли помечаются при разборе и ещё раз отсекаются `createMany({ skipDuplicates })` (`ON CONFLICT DO NOTHING`) — два импорта одной выписки наперегонки дают операции один раз (e2e). Удалённая вручную импортированная операция при повторном импорте вернётся.
- Создание операций — **одной транзакцией** (всё или ничего): правило «не уходить в минус» проверяет баланс после записи, а запись — весь импорт. Блокировка счёта на всё время (ручные записи на этот счёт ждут). Прогресс пишется другим соединением и виден сразу: вставка операции берёт `FOR KEY SHARE` на строку `imports` (FK), обновление счётчиков — `FOR NO KEY UPDATE`, они не конфликтуют. Нехватка денег (или удалённая категория) → импорт обратно в `ready` с `error`; при `commit` та же проверка заранее (409 `INSUFFICIENT_FUNDS`, `field: categories`). После `done` строки staging удаляются.
- Категории: группы новых строк по `(kind, категория банка)`; подсказка — сохранённое правило `import_category_rules`, иначе своя категория с тем же именем (сравнение в JS: `lower()` в Postgres зависит от локали БД). `commit` обязан назначить категорию каждой группе и запоминает выбор.
- Фронт: мастер на `/import/:id` — состояние целиком на сервере (статус импорта), поэтому перезагрузка или возврат из истории продолжают с того же шага. Вход — кнопка «Импорт выписки» на `/accounts` (в навигации нет: действие редкое, таб-бар на телефоне не резиновый). Файл уходит сразу после выбора или перетаскивания (`FormData`, без ручного `Content-Type` — boundary ставит fetch).
- Опрос: `useImport(id)` (`entities/import`) берёт статус из кэша (`useQueryState`) и опрашивает раз в секунду, пока `parsing`/`importing`; на `done` сам перестаёт. Переход в `done` инвалидирует `Transaction`/`Account`/`Budget`: операции появляются не на подтверждение, а когда фон закончил. Ответы мутаций (`upload`, `mapping`, `commit`) кладутся в кэш `getImport` (`upsertQueryData`) — без лишнего запроса.
- Формы ждут свои справочники (счета, категории) и до этого показывают скелетон: `<select>` берёт значение по умолчанию, только если такой `<option>` уже есть, иначе на экране «не выбрано» при выбранном значении в форме.
- Колонки в форме — `number | null` через `setValueAs`; RHF прогоняет через него и значение по умолчанию, а `Number(null)` = 0 — `null` обрабатывать явно (был баг: пустые колонки молча становились первой). Форма плоская (`status: { column, value }`), перед shared-схемой нормализуется в контракт (`status: null`, union суммы) — ошибки остаются на путях полей.
- Категории: группа без своей категории — выбрать или «+ Новая категория «Супермаркеты»» (создаётся перед `commit`; не предлагается, если категория с таким именем уже есть).
- **Откат** (`POST /imports/:id/undo`, `done` → `undone`): удаляет все операции импорта, отредактированные тоже; одна запись, как ручное удаление — сначала `FOR UPDATE` строк операций (заодно их текущие счета: операцию могли перенести или сделать переводом), потом счета, удаление, `assertNotNegative` → 409 `INSUFFICIENT_FUNDS`, ничего не удалено. Отпечатки уходят с операциями — тот же файл можно импортировать снова. Отменённый импорт можно убрать из истории (`DELETE`), завершённый — только после отката. Фронт — двухшаговая кнопка «Отменить импорт» → «Удалить N операций?» (`features/import-undo`).
- **Возможный дубль** (`import_rows.similar_transaction_id`, ищет воркер в конце разбора, `findSimilar`): новая строка и операция того же счёта без отпечатка (внесена руками или регулярным платежом) — то же направление относительно счёта (доход/перевод на счёт — приход, расход/перевод со счёта — расход), та же сумма, ±2 дня. Одна операция объясняет не больше одной строки: пары «взаимно ближайших» через два `row_number()` (по строке и по операции) — приближение паросочетания, верное в обычном случае. На FK `similar_transaction_id → transactions` — индекс: `ON DELETE SET NULL` ищет ссылающиеся строки при каждом удалении операции, а откат удаляет тысячи.
- `commit` принимает `skipLines`: строки уходят в `skipped` («Уже есть на счёте») до подсчёта групп — группе из одних пропущенных категория не нужна; в той же транзакции, отказ ничего не пропускает. Фронт: список «Возможно, уже есть на счёте» с галочкой «Пропустить» (включена по умолчанию), группы и счётчик на кнопке пересчитываются на лету.
- Не сделано: переводы между своими счетами в выписке (импортируются как доход/расход), снятие пропуска после возврата импорта в `ready` (только через повторный выбор колонок).

Демо-учётка — **`demo@kopilka.test` / `kopilka-demo`** (не секрет: учётка публичная по замыслу). Создаёт и пересоздаёт её `pnpm db:seed` (печатает данные для входа в конце); константы — `apps/api/src/demo/demo-data.ts`.

- `buildDemoData(now)` (`src/demo/demo-data.ts`, юнит — `demo-data.spec.ts`) — чистая функция: год (11 полных месяцев + текущий до этого момента, ~650 операций — для графика по месяцам), генератор случайных чисел с фиксированным зерном (одинаково при каждом запуске в один день), пояс Europe/Moscow. Три счёта (карта, наличные и накопления без минуса), 7 категорий расходов + 3 дохода (в пределах палитры из 8), три регулярных правила с уже сделанными платежами (`recurring_rule_id`/`recurring_on` как у исполнителя), бюджеты с версией (продукты подняты в текущем месяце).
- `seedDemo(prisma)` (`src/demo/seed-demo.ts`) пишет одной транзакцией: удаляет демо-пользователя (каскадом всё его) и создаёт заново — других пользователей не трогает. Пишет мимо сервисов (месяцы истории сразу), поэтому в конце сам проверяет «счета без минуса не в минусе», а e2e (`test/seed.e2e-spec.ts`) читает результат через API.
- Скрипт `src/scripts/seed-demo.ts` запускается из `dist` (как генерация OpenAPI), `DATABASE_URL` — из окружения или `apps/api/.env` (`process.loadEnvFile`, без dotenv — его нет в образе). С `NODE_ENV=production` отказывается без флага `--production`. В образе: `node dist/scripts/seed-demo.js --production`.
- Старая учётка `design-demo@kopilka.test` в dev-базе осталась от ручной проверки дизайна; пароль от неё нигде не записан.

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
