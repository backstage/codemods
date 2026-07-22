import { ButtonLink } from '@backstage/ui';

const MyComponent = () => (
  <ButtonLink variant="secondary" iconStart={<DocsIcon />} href="/docs">
    Docs
  </ButtonLink>
);
