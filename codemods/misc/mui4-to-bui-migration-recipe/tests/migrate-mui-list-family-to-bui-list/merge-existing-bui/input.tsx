import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <>
    <Button>Save</Button>
    <List>
      <ListItem>
        <ListItemText primary="Item" />
      </ListItem>
    </List>
  </>
);
