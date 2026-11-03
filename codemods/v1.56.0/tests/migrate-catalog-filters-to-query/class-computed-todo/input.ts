import type { EntityFilter } from '@backstage/plugin-catalog-react';

class ComputedFilter implements EntityFilter {
  getCatalogFilters() {
    return this.buildFilters();
  }
}
