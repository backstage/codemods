import type { EntityFilter } from '@backstage/plugin-catalog-react';

class AnyOfFilter implements EntityFilter {
  getCatalogFilters() {
    return [{ kind: ['group', 'user'] }, { 'spec.type': 'service' }];
  }
}
