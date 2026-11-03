import { HeaderDefinition } from '@backstage/bui-components';

const className = HeaderDefinition.classNames.root;

function applyStyles() {
  const el = document.querySelector(`.${HeaderDefinition.classNames.root}`);
  return el;
}
