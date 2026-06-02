import { PluginHeader, PluginHeaderDefinition } from '@backstage/ui';

const config: PluginHeaderDefinition = {
  classNames: { root: 'custom-header' },
};

const MyPage = () => (
  <PluginHeader title="My Page" />
);
