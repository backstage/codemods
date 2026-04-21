import { PluginHeaderDefinition } from '@backstage/bui-components';

const className = PluginHeaderDefinition.classNames.toolbar;

function applyStyles() {
  const el = document.querySelector(`.${PluginHeaderDefinition.classNames.toolbar}`);
  return el;
}
