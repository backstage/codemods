import type { EntityFilter } from '@backstage/plugin-catalog-react';

class EmptyFilter implements EntityFilter {
  getCatalogFilters() {
    return [];
  }
}
