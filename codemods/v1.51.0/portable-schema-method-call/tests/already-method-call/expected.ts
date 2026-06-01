import type { PortableSchema } from '@backstage/frontend-plugin-api';

function readSchemaType(portable: PortableSchema<unknown>) {
  const schemaType = portable.schema().type;
  return schemaType;
}
