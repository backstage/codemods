import type { PortableSchema } from '@backstage/frontend-plugin-api';

function readNestedProperty(portable: PortableSchema<unknown>) {
  const titleProp = portable.schema().properties.title;
  return titleProp;
}
