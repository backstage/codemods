import type { EntityFilter } from '@backstage/plugin-catalog-react';

class ComputedFilter implements EntityFilter {
  getCatalogFilters() {
    return this.buildFilters();
  }

  getCatalogQuery() {
    // TODO(backstage-codemod): translate getCatalogFilters to a filter predicate
    return undefined;
  }
}
