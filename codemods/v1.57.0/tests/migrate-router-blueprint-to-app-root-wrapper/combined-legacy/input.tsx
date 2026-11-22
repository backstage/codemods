import { BrowserRouter as Browser, Link } from 'react-router-dom';
import { RouterBlueprint } from '@backstage/plugin-app-react';
import { convertLegacyAppOptions } from '@backstage/core-compat-api';

export const wrapper = RouterBlueprint.make({
  params: {
    component: ({ children }) => (
      <Browser>
        {children}
      </Browser>
    ),
  },
});
export const legacy = convertLegacyAppOptions({
  components: {
    Router: Browser,
    Link,
  },
});
export const unicode = convertLegacyAppOptions({ components: { SignInPage: Größe, Router: Browser, Progress: Ünï } });
export { RouterBlueprint };
export const blueprints = { RouterBlueprint };
export function render(Browser: string) { return Browser; }
