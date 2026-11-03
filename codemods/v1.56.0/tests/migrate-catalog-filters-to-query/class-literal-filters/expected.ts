import type { EntityFilter } from '@backstage/plugin-catalog-react';

class MyFilter implements EntityFilter {
  getCatalogFilters() {
    return [{ 'spec.type': 'service', kind: 'component' }, { 'spec.type': 'website' }];
  }

  getCatalogQuery() {
    return { $any: [{ $all: [{ 'spec.type': 'service' }, { kind: 'component' }] }, { 'spec.type': 'website' }] };
  }
}
