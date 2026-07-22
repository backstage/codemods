import { PasswordField } from '@backstage/ui';

const MyComponent = () => (
  <PasswordField label="Password" value={password} onChange={newValue => setPassword(newValue)} description="Use a strong password" />
);
