import { EntityAboutCard, EntityOwnershipCard } from '@backstage/plugin-catalog';

export default () => (
  <div>
    <EntityAboutCard variant="gridItem" />
    <EntityOwnershipCard variant="gridItem" />
  </div>
);
