import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  type StandardSchemaConverter,
  SwaggerModule,
} from '@nestjs/swagger';

export const BEARER_AUTH = 'bearer';

type JsonSchema = Record<string, unknown>;

interface StandardJsonSchemaHost {
  '~standard'?: {
    jsonSchema?: Record<
      'input' | 'output',
      (params: { target: string; libraryOptions?: object }) => JsonSchema
    >;
  };
}

interface ZodOverrideContext {
  zodSchema: { _zod: { def: { type: string } } };
  jsonSchema: JsonSchema;
}

/**
 * Same as the built-in conversion (Standard JSON Schema), plus Zod options:
 * JSON has no date type and Zod refuses to describe `Date`, which would fail
 * document generation (and app startup) for any schema with
 * z.coerce.date(). Describe a date as what travels over the wire: an
 * ISO 8601 string.
 */
const standardSchemaConverter: StandardSchemaConverter = (
  schema,
  { schemaType },
) => {
  const convert = (schema as StandardJsonSchemaHost)['~standard']?.jsonSchema?.[
    schemaType
  ];
  if (!convert) return undefined;

  const { $schema, $defs, definitions, ...root } = convert({
    target: 'openapi-3.0',
    libraryOptions: {
      unrepresentable: 'any',
      override: ({ zodSchema, jsonSchema }: ZodOverrideContext) => {
        if (zodSchema._zod.def.type === 'date') {
          jsonSchema.type = 'string';
          jsonSchema.format = 'date-time';
        }
      },
    },
  });
  void $schema;
  return {
    schema: root,
    components: (definitions ?? $defs ?? {}) as Record<string, JsonSchema>,
  };
};

/**
 * Request bodies come from `@Body({ schema })` and responses from
 * `standardSchema` in @Api*Response: both are the Zod schemas from
 * @kopilka/shared. One source of truth for validation, docs and
 * frontend types.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Kopilka API')
    .setDescription('Personal finance tracker')
    .setVersion('0.1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      BEARER_AUTH,
    )
    // Mirrors the global JwtAuthGuard: every operation needs a token
    // unless @Public() clears the requirement.
    .addSecurityRequirements(BEARER_AUTH)
    .build();

  return SwaggerModule.createDocument(app, config, { standardSchemaConverter });
}
