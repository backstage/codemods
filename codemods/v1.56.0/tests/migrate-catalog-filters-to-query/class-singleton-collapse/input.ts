import type { EntityFilter } from '@backstage/plugin-catalog-react';

class SingleKindFilter implements EntityFilter {
  getCatalogFilters() {
    return [{ kind: 'component' }];
  }
}
