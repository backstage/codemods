import { List, ListItem, ListItemIcon, ListItemText } from '@material-ui/core';

const MyComponent = () => (
  <List>
    <ListItem>
      <ListItemIcon><StarIcon /></ListItemIcon>
      <ListItemText primary="Starred" secondary="Your favorites" />
    </ListItem>
  </List>
);
