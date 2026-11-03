import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemIcon from '@material-ui/core/ListItemIcon';
import ListItemText from '@material-ui/core/ListItemText';

const MyComponent = () => (
  <List>
    <ListItem>
      <ListItemIcon><DocsIcon /></ListItemIcon>
      <ListItemText primary="Docs" secondary="Read the docs" />
    </ListItem>
  </List>
);
