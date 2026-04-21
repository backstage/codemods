import { PluginHeaderDefinition } from '@backstage/bui-components';

const className = PluginHeaderDefinition.classNames.toolbarWrapper;

function applyStyles() {
  const el = document.querySelector(`.${PluginHeaderDefinition.classNames.toolbarWrapper}`);
  return el;
}
