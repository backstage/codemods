import { EntityAboutCard, EntityLinksCard } from '@backstage/plugin-catalog';
import { EntityCatalogGraphCard } from '@backstage/plugin-catalog-graph';

export default () => (
  <div>
    <EntityAboutCard variant="gridItem" />
    <EntityLinksCard variant="gridItem" />
    <EntityCatalogGraphCard variant="gridItem" height={400} />
  </div>
);
