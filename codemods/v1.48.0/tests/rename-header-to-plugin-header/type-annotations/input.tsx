import { Header, HeaderDefinition } from '@backstage/ui';

const config: HeaderDefinition = {
  classNames: { root: 'custom-header' },
};

const MyPage = () => (
  <Header title="My Page" />
);
