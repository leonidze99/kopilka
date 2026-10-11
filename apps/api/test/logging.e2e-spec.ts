import {
  Body,
  Controller,
  Get,
  INestApplication,
  Logger as NestLogger,
  Post,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AllExceptionsFilter } from './../src/common/errors/all-exceptions.filter.js';
import { API_PREFIX } from './../src/common/http/api-prefix.js';
import { createLoggerParams } from './../src/common/logging/logger.config.js';

type LogLine = Record<string, any>;

const LEVEL = { info: 30, warn: 40, error: 50 } as const;

@Controller('__log')
class LoggingTestController {
  private readonly logger = new NestLogger('LoggingTest');

  @Get('hello')
  hello() {
    this.logger.log('inside handler');
    return 'ok';
  }

  @Get('boom')
  boom() {
    throw new Error('kaboom');
  }

  @Post('echo')
  echo(@Body() body: unknown) {
    return body;
  }
}

@Controller('health')
class FakeHealthController {
  @Get('live')
  live() {
    return { status: 'ok' };
  }
}

describe('Logging (e2e)', () => {
  let app: INestApplication<App>;
  const lines: LogLine[] = [];

  beforeAll(async () => {
    const destination = {
      write: (msg: string) => {
        lines.push(JSON.parse(msg) as LogLine);
      },
    };
    const moduleRef = await Test.createTestingModule({
      imports: [
        LoggerModule.forRoot(
          createLoggerParams(
            { NODE_ENV: 'production', LOG_LEVEL: 'info' },
            destination,
          ),
        ),
      ],
      controllers: [LoggingTestController, FakeHealthController],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    }).compile();

    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    // As in setupApp: the health probe filter matches the prefixed path.
    app.setGlobalPrefix(API_PREFIX);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    lines.length = 0;
  });

  const http = () => request(app.getHttpServer());

  // The access log line is written on the response "finish" event,
  // which may fire after supertest has already resolved.
  const accessLogOf = (reqId: string) =>
    vi.waitFor(() => {
      const line = lines.find((l) => l.req?.id === reqId && l.res);
      if (!line) throw new Error(`no access log for ${reqId}`);
      return line;
    });

  it('binds reqId to logs written inside a request and to the access log', async () => {
    await http()
      .get('/api/__log/hello')
      .set('X-Request-ID', 'log-1')
      .expect(200);

    expect(lines.find((l) => l.msg === 'inside handler')).toMatchObject({
      level: LEVEL.info,
      reqId: 'log-1',
      context: 'LoggingTest',
    });
    expect(await accessLogOf('log-1')).toMatchObject({
      level: LEVEL.info,
      req: { method: 'GET', url: '/api/__log/hello' },
      res: { statusCode: 200 },
      responseTime: expect.any(Number),
    });
  });

  it('logs 4xx as warn', async () => {
    await http()
      .get('/api/__log/missing')
      .set('X-Request-ID', 'log-2')
      .expect(404);

    expect((await accessLogOf('log-2')).level).toBe(LEVEL.warn);
  });

  it('logs 5xx as error, with the stack trace under the same reqId', async () => {
    await http()
      .get('/api/__log/boom')
      .set('X-Request-ID', 'log-3')
      .expect(500);

    expect(lines.find((l) => l.err?.message === 'kaboom')).toMatchObject({
      level: LEVEL.error,
      reqId: 'log-3',
      err: { stack: expect.stringContaining('kaboom') },
    });
    expect((await accessLogOf('log-3')).level).toBe(LEVEL.error);
  });

  it('redacts credentials', async () => {
    await http()
      .get('/api/__log/hello')
      .set('X-Request-ID', 'log-4')
      .set('Authorization', 'Bearer secret-token')
      .set('Cookie', 'sid=secret-cookie')
      .expect(200);

    expect((await accessLogOf('log-4')).req.headers).toMatchObject({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
    });
    expect(JSON.stringify(lines)).not.toMatch(/secret-token|secret-cookie/);
  });

  it('does not write access logs for health probes', async () => {
    await http()
      .get('/api/health/live')
      .set('X-Request-ID', 'log-6')
      .expect(200);
    // Give the response "finish" event a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(lines.some((l) => l.req?.id === 'log-6')).toBe(false);
  });

  it('logs requests rejected by body-parser, which never reach pino-http', async () => {
    const res = await http()
      .post('/api/__log/echo')
      .set('X-Request-ID', 'log-5')
      .set('Content-Type', 'application/json')
      .send('{"broken": ')
      .expect(400);

    expect(res.headers['x-request-id']).toBe('log-5');
    expect(res.body.requestId).toBe('log-5');
    expect(lines.find((l) => l.reqId === 'log-5')).toMatchObject({
      level: LEVEL.warn,
      msg: expect.stringContaining('Request rejected before routing'),
      method: 'POST',
      url: '/api/__log/echo',
      statusCode: 400,
    });
    expect(lines.some((l) => l.req?.id === 'log-5')).toBe(false);
  });
});
