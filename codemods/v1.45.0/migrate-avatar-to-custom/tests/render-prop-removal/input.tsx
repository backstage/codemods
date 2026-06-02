import { Avatar } from '@backstage/ui';

export const Example = () => (
  <Avatar src="/photo.jpg" name="Jane" render={(props) => <span {...props} />} />
);
