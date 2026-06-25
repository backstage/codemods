import Tabs from '@material-ui/core/Tabs';
import Tab from '@material-ui/core/Tab';

const MyComponent = () => (
  <>{/* TODO(backstage-codemod): verify custom tab orientation or selection logic manually */}
<Tabs value={selected} orientation="vertical" onChange={handleChange}>
    <Tab label="A" value="a" />
    <Tab label="B" value="b" />
  </Tabs></>
);
