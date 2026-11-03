import { HeaderDefinition } from '@backstage/bui-components';

const className = HeaderDefinition.classNames.content;

function applyStyles() {
  const el = document.querySelector(`.${HeaderDefinition.classNames.content}`);
  return el;
}
