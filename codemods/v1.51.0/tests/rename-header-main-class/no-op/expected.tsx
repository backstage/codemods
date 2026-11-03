import { Header } from '@backstage/bui-components';
import { CardDefinition } from '@backstage/bui-components';

const header = <Header title="My App" />;

const cardClass = CardDefinition.classNames.root;

const styles = {
  '.bui-HeaderContent': {
    display: 'flex',
  },
  '.bui-HeaderTop': {
    padding: '8px',
  },
  '.bui-HeaderBottom': {
    margin: '0',
  },
  '.bui-Header2': {
    opacity: '1',
  },
};
