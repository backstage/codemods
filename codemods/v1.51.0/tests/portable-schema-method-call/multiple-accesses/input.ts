import type { PortableSchema } from '@backstage/frontend-plugin-api';

function inspectSchema(portable: PortableSchema<unknown>) {
  const schemaType = portable.schema.type;
  const required = portable.schema.required;
  const props = portable.schema.properties;
  return { schemaType, required, props };
}
