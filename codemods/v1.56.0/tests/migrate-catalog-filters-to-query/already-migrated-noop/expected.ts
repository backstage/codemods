import type { EntityFilter } from '@backstage/plugin-catalog-react';

class MyFilter implements EntityFilter {
  getCatalogFilters() {
    return [{ kind: 'component' }];
  }

  getCatalogQuery() {
    return { kind: 'component' };
  }
}
