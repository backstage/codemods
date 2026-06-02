import { Avatar } from '@backstage/ui';

export const Example = () => (
  <Avatar src="/photo.jpg" name="Jane" size="large" render={(props) => <span {...props} />} />
);
