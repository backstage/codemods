import type { EntityFilter } from '@backstage/plugin-catalog-react';

const filter: EntityFilter = {
  getCatalogFilters() {
    return [{ kind: 'component' }];
  },
};
