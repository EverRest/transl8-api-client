/**
 * Every route responds with `{ success, data }` at runtime, but only routes
 * migrated to `@ApiEnvelopeResponse`/`@ApiPaginatedResponse` (P6-04) document
 * that wrapper — the generated client's mutator always unwraps `.data`
 * before returning, so the documented schema must describe the unwrapped
 * shape either way, or generated types would lie about what callers get.
 */
export function stripEnvelope(document) {
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== 'object' || !operation.responses) {
        continue;
      }
      for (const response of Object.values(operation.responses)) {
        const media = response?.content?.['application/json'];
        const schema = media?.schema;
        if (isEnvelopeSchema(schema)) {
          media.schema = schema.properties.data;
        }
      }
    }
  }
  return document;
}

function isEnvelopeSchema(schema) {
  return Boolean(
    schema &&
      typeof schema === 'object' &&
      schema.properties &&
      'success' in schema.properties &&
      'data' in schema.properties,
  );
}
