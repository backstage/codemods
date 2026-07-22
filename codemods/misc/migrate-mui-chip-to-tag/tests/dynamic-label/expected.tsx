import { Tag } from '@backstage/ui';

const MyComponent = ({ name }: { name: string }) => (
  <Tag size="medium">{name}</Tag>
);
