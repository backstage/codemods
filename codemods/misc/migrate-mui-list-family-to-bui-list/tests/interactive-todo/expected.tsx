import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';

const MyComponent = () => (
  <List>
    <>
  {/* TODO(backstage-codemod): verify nonstandard list row manually */}
  <ListItem button onClick={handleClick}>
      <ListItemText primary="Clickable" />
    </ListItem>
</>
  </List>
);
