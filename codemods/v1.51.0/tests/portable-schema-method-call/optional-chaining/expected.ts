import type { PortableSchema } from '@backstage/frontend-plugin-api';

function readOptionalType(portable: PortableSchema<unknown>) {
  const maybeType = portable.schema()?.type;
  return maybeType;
}
