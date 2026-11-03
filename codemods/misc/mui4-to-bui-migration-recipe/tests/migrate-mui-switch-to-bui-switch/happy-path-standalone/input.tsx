import { Switch } from '@material-ui/core';

const MyComponent = () => (
  <Switch name="darkMode" checked={dark} onChange={setDark} disabled={busy} />
);
