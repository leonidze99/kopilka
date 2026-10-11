# Лог проектирования Kopilka

Перенос диалога из claude.ai (15–29 сентября 2026) в Claude Code.
Прозаические рассуждения сжаты; все команды, конфиги и код — дословно.

---

## 1. Выбор бэкенд-стека

**Вопрос:** какой бэкенд взять к фронтовому стеку React + TS + RTK + FSD (Jest/RTL/Cypress).

**Решение:** остаться в TypeScript — типы шарятся между фронтом и бэком, нет переключения контекста.

Рассмотренные варианты:
- **NestJS + PostgreSQL** — выбран. Архитектурно близок к FSD: DI, модули, декораторы, слои. Часто встречается в корпоративной разработке (в т.ч. банки) → плюс для резюме.
- **Next.js (App Router) + Server Actions + Drizzle** — быстрее до продукта, но бэкенд спрятан за абстракциями, меньше обучающей ценности.
- **Fastify/Hono + Drizzle** — минимализм, всё руками.

Уточнение по терминологии: Node.js — среда выполнения, а не альтернатива Nest. Express/Fastify/Nest работают поверх неё.

Почему Nest, а не Express/Fastify:
1. Закрывает главный риск первого бэкенд-проекта — превращение кода в кашу из роутов и запросов к базе. Паттерны даются готовыми.
2. Jest, TypeScript, DI, моки — всё уже в опыте, только с другой стороны.
3. В вакансиях на фуллстек встречается чаще Express.

Минус: многословность. На один CRUD-ресурс — модуль, контроллер, сервис, DTO.

**Выбор ORM:** Prisma (отличный DX, автогенерация типов) вместо Drizzle — для первого проекта.
**Валидация:** Zod вместо class-validator — одну схему можно переиспользовать на фронте.

**Идея приложения:** трекер личных финансов (категории, бюджеты, аналитика) — нетривиальная доменная логика, а не очередной todo. Опирается на уже имеющийся финтех-контекст автора.

---

## 2. Монорепа против двух репозиториев

**Решение: монорепа.**

За:
- **Общие типы** — главная причина. Zod-схема лежит в `packages/shared`, бэк валидирует ей запрос, фронт валидирует форму и выводит TS-тип. Меняешь схему → тайпчек ломается сразу в обоих местах, а не в проде. В двух репах это работает только через приватный npm-пакет: поменять → собрать → опубликовать версию → обновить зависимость в двух местах. Убивает темп.
- **Атомарные коммиты** — поле в API и его использование на фронте едут одним PR. В двух репах всегда есть переходный момент, когда `main` одного не согласован с `main` другого.
- Мелочи: один `pnpm install`, один запуск, одна конфигурация ESLint/Prettier/TS, один CI, одна история.

Две репы лучше, когда: разные команды с разными релизными циклами и правами; бэк не на TypeScript; разная публичность репозиториев; несколько независимых потребителей API. Ничего из этого не относится к проекту.

**Инструмент: pnpm workspaces, без Turborepo и без Nx.** pnpm даёт symlink-и между пакетами — этого достаточно. Turborepo нужен ради кэширования сборок, которое на трёх пакетах экономит секунды. Добавить позже — тридцать минут и один конфиг.

**Подводный камень:** `packages/shared` должен быть сборкой-агностичным — чистый TypeScript, никакого `import.meta.env`, `process.env`, Node- или браузерных API. Только схемы, типы, enum-ы, чистые функции. Правило: если код нельзя выполнить и в браузере, и в Node — ему не место в shared.

**Второй нюанс:** shared удобнее подключать в dev-режиме как исходники (через `exports` на `src/index.ts` и tsconfig paths), а не собирать в `dist` на каждое изменение. Иначе придётся держать `tsc --watch` в третьем терминале.

---

## 3. План «роста к сеньору» по фазам

Порядок важен: если в первый день настраивать CI, метрики, логирование и Swagger, до самой фичи дело не дойдёт.

### Фаза 1: до первой фичи

То, что дороже всего прикручивать задним числом.

- **Конфигурация через `@nestjs/config` + валидация env Zod-схемой.** Приложение падает на старте, если переменная не задана, а не через три часа в рантайме. Побочный эффект — типизированный доступ к конфигу вместо `process.env.FOO!`.
- **Глобальный exception filter и единый формат ошибки.** Фронт получает одинаковую структуру от любого эндпоинта: код, сообщение, поле, requestId. Решается один раз, дальше фронтовая обработка ошибок тривиальна.
- **Логирование через `nestjs-pino` с request-id.** Идея та же, что в `tracingInterceptor.ts` на фронте, только с другой стороны: middleware генерирует или принимает `X-Request-ID`, кладёт в `AsyncLocalStorage`, каждая строка лога внутри запроса несёт этот id. Когда фронт и бэк проставляют один id — виден путь запроса целиком.
- **Docker Compose с Postgres и Prisma-миграциями.** `prisma migrate dev` локально, `prisma migrate deploy` на деплое. `db push` — только для черновых экспериментов.

### Фаза 2: параллельно с первыми фичами

- **Swagger.** Декораторы на DTO, `/api/docs` генерируется сам. Отсюда же генерировать типы и клиент для фронта (`openapi-typescript`) — контракт перестаёт расходиться.
- **Health-чеки через `@nestjs/terminus`.** `/health/live` и `/health/ready`, проверка коннекта к базе.
- **Базовая безопасность.** `helmet`, CORS с явным списком origin, rate limiting через `@nestjs/throttler`, хеширование паролей **argon2** (не bcrypt), access + refresh токены с ротацией. Refresh-токены — самая содержательная часть: где хранить, как инвалидировать, что делать при краже.
- **CI на GitHub Actions.** Линт, тайпчек, тесты, билд на каждый PR.

### Фаза 3: когда есть работающий продукт

- **Тесты бэка.** Unit на сервисы с замоканным репозиторием, e2e через Supertest. Для e2e не мокать базу, а поднимать настоящую через Testcontainers.
- **Метрики.** `prom-client`, эндпоинт `/metrics`, Grafana локально в Compose. Скорее опыт, чем необходимость.
- **Кэш и очереди.** Redis + BullMQ — когда появится реальная задача: пересчёт аналитики, отправка отчётов, импорт выписки. Заранее не добавлять — карго-культ.
- **Multi-stage Dockerfile и деплой.** Railway или Fly.io на старте, потом VPS.

### Отдельно потренировать

Три вещи, которые спрашивают именно у сеньоров и которые естественно вылезут в трекере:

- **Транзакции.** Перевод между счетами или перекатегоризация пачки операций — классический случай, где нужна атомарность. В Prisma это `$transaction`, но интереснее понять уровни изоляции и почему они существуют.
- **Индексы и N+1.** Список операций с джойном категорий — и уже словил N+1. Научиться читать `EXPLAIN ANALYZE` — редкий навык у фронтендеров.
- **Пагинация.** Offset против cursor-based, и почему на больших таблицах offset деградирует.

---

## 4. Название

Бренд не переводят: у приложения одно имя, русский — язык интерфейса, а не вторая версия названия.

Варианты латиницей: Tally, Ledgerly, Kopeyka, Nomo, Spendly/Coinly/Budgetly (шаблонные).
Варианты от русского: Копилка → `kopilka`, Расход → `raskhod`, Кошелёк → `koshelek`.

**Выбрано: Kopilka.** Слово тёплое, сразу говорит о накоплении, хорошо транслитерируется.

Имя попадает в: папку репозитория, скоуп пакетов (`@kopilka/shared`), имя БД/пользователя в `docker-compose.yml`, `name:` проекта в Compose. Требования: только латиница в нижнем регистре, без пробелов и подчёркиваний.

---

## 5. Пошаговый старт каркаса

### 0. Проверка окружения

```bash
node -v     # нужно >= 22
pnpm -v     # если нет: npm i -g pnpm
docker -v
```

Node 22+ нужен потому, что shared будет ESM-пакетом, а Nest по умолчанию CommonJS. Node 22 умеет загружать ESM через `require` без дополнительных костылей.

### 1. Папка, git, каркас

Windows / PowerShell (флага `-p` у `mkdir` нет):

```powershell
cd C:\projects
mkdir kopilka
cd kopilka
git init
pnpm init
mkdir apps, packages\shared\src
```

Открыть `C:\projects\kopilka` в WebStorm через File → Open — именно корень монорепы, не отдельные приложения. Остальные команды — во встроенном терминале (Alt+F12).

**`pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**`package.json`** (заменить сгенерированный)

```json
{
  "name": "kopilka",
  "private": true,
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "build": "pnpm -r build",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down"
  },
  "devDependencies": {
    "typescript": "^5.9.0"
  }
}
```

`pnpm -r build` сам соберёт пакеты в порядке зависимостей: сначала shared, потом приложения.

**`tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true
  }
}
```

**`docker-compose.yml`**

```yaml
name: kopilka

services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_USER: kopilka
      POSTGRES_PASSWORD: kopilka
      POSTGRES_DB: kopilka
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kopilka"]
      interval: 5s
      retries: 5

volumes:
  pgdata:
```

**`.gitignore`**

```
node_modules/
dist/
build/
.env
.env.local
*.log
.DS_Store
.idea/
```

**`.gitattributes`** (Windows, чтобы git не смешивал CRLF и LF)

```
* text=auto eol=lf
```

### 2. Пакет shared

**`packages/shared/package.json`**

```json
{
  "name": "@kopilka/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "scripts": {
    "dev": "tsc --watch --preserveWatchOutput",
    "build": "tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

**`packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist"
  },
  "include": ["src"]
}
```

**`packages/shared/src/transaction.ts`**

```ts
import { z } from "zod";

export const transactionKindSchema = z.enum(["income", "expense"]);

export const createTransactionSchema = z.object({
  amount: z.number().positive("Сумма должна быть больше нуля"),
  kind: transactionKindSchema,
  categoryId: z.uuid(),
  comment: z.string().max(280).optional(),
  occurredAt: z.coerce.date(),
});

export const transactionSchema = createTransactionSchema.extend({
  id: z.uuid(),
  createdAt: z.coerce.date(),
});

export type TransactionKind = z.infer<typeof transactionKindSchema>;
export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
```

**`packages/shared/src/index.ts`**

```ts
export * from "./transaction.js";
```

Три важных момента:
- Расширение `.js` в импорте обязательно: при `NodeNext` без него сборка упадёт.
- Схема под **Zod 4**: `z.enum` вместо `z.nativeEnum`, `z.uuid()` вместо `z.string().uuid()`.
- `z.coerce.date()` вместо `z.date()` — через JSON дата приезжает строкой. Та мелочь, из-за которой общая схема либо работает на обеих сторонах, либо нет.

```bash
pnpm --filter @kopilka/shared add zod
```

### 3. Фронтенд

```bash
pnpm create vite@latest apps/web --template react-ts
```

На «Install and start now?» ответить **No** — установку сделаем одной командой из корня.

### 4. Бэкенд

Глобально Nest CLI ставить не обязательно:

```bash
pnpm dlx @nestjs/cli new api --directory apps/api --package-manager pnpm --skip-git --skip-install
```

`--skip-git` важен, иначе Nest инициализирует вложенный git-репозиторий.

Затем в `apps/api/package.json` добавить в `scripts`:

```json
"dev": "nest start --watch",
```

Без этого корневой `pnpm dev` не запустит бэк: у Nest этот скрипт по умолчанию называется `start:dev`.

### 5. Связать и установить

```bash
pnpm --filter web add @kopilka/shared@workspace:*
pnpm --filter api add @kopilka/shared@workspace:*
pnpm install
```

pnpm 10 может предупредить, что заблокировал build-скрипты некоторых пакетов (например `@nestjs/core` или `esbuild`). Тогда:

```bash
pnpm approve-builds
```

и отметить их в списке.

### 6. Запуск

```bash
pnpm db:up
pnpm --filter @kopilka/shared build
pnpm dev
```

Первая сборка shared обязательна: без неё Nest и Vite не найдут `dist` и упадут на резолве импорта.

Проверить:
- `http://localhost:5173` — стартовая страница Vite
- `http://localhost:3000` — «Hello World!» от Nest
- `docker ps` — контейнер `kopilka-postgres-1` в статусе healthy

Docker Desktop должен быть запущен **до** `pnpm db:up`, иначе `docker compose` не найдёт движок.

### 7. Первый коммит

```bash
git add .
git commit -m "chore: init monorepo (web, api, shared)"
```

Коммитить сразу, до всяких правок.

---

## 6. Настройка WebStorm

- **Package manager.** Settings → Languages & Frameworks → Node.js → Package manager: pnpm.
- **Исключить лишнее из индексации.** Правый клик на `dist` в каждом пакете → Mark Directory as → Excluded. Иначе автоимпорт будет предлагать пути из `dist` вместо `src`.
- **Prettier.** Settings → Languages & Frameworks → JavaScript → Prettier → включить On save и On code reformat. Конфиг в корень — подхватится для всех пакетов.
- **Run-конфигурации.** Скрипты из корневого `package.json` запускаются кликом по стрелке слева от строки в редакторе.

---

## 7. Где остановились

Выполнено в claude.ai-сессии: выбран стек, выбрана монорепа, выбрано имя Kopilka, расписан пошаговый старт.

Фактически на диске к моменту переноса: создана папка `C:\projects\kopilka`, сделан `git init` (коммитов нет) и `pnpm init` (дефолтный package.json), созданы пустые `apps` и `packages/shared/src`.

Дальше по плану: каркас воркспейса (файлы из §5) → Prettier + ESLint на всю монорепу → `.env` и конфиг с валидацией → Prisma и схема БД. Prisma ставить, когда понятно, какие сущности в трекере, — иначе придётся переписывать миграции.
