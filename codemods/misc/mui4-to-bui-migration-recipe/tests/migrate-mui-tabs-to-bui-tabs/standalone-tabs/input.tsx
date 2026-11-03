import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';

const MyComponent = () => (
  <Tabs value={selected} onChange={handleChange}>
    <Tab label="First" value="first" />
    <Tab label="Second" value="second" />
  </Tabs>
);
