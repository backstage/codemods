import { EntityAboutCard, EntityLinksCard } from '@backstage/plugin-catalog';
import { EntityCatalogGraphCard } from '@backstage/plugin-catalog-graph';

export default () => (
  <div>
    <EntityAboutCard />
    <EntityLinksCard />
    <EntityCatalogGraphCard height={400} />
  </div>
);
