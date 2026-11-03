import { FormControlLabel, Switch } from '@material-ui/core';

const MyComponent = () => (
  <FormControlLabel control={<Switch checked={on} onChange={handleChange} />} label="Notifications" />
);
