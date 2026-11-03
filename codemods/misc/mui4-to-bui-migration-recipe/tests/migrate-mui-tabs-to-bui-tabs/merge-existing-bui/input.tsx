import TabContext from '@material-ui/lab/TabContext';
import TabList from '@material-ui/lab/TabList';
import Tab from '@material-ui/core/Tab';
import TabPanel from '@material-ui/lab/TabPanel';
import { Button } from '@backstage/ui';

const MyComponent = () => (
  <TabContext value={tab}>
    <TabList onChange={handleChange}>
      <Tab label="Info" value="info" />
    </TabList>
    <TabPanel value="info"><Button>Click</Button></TabPanel>
  </TabContext>
);
