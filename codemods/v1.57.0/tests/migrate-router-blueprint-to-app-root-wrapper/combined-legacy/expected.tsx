import { Link } from 'react-router-dom';
import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
import { convertLegacyAppOptions } from '@backstage/core-compat-api';

// TODO(backstage-codemod): this router override only installed BrowserRouter. The app owns history since 1.57 — delete this extension and its registration.
export const wrapper = AppRootWrapperBlueprint.make({
  params: {
    component: ({ children }) => (
      <>{children}</>
    ),
  },
});
export const legacy = convertLegacyAppOptions({
  // TODO(backstage-codemod): components.Router is no longer supported. Move global providers to AppRootWrapperBlueprint.
  components: {
    Link,
  },
});
// TODO(backstage-codemod): components.Router is no longer supported. Move global providers to AppRootWrapperBlueprint.
export const unicode = convertLegacyAppOptions({ components: { SignInPage: Größe, Progress: Ünï } });
export { AppRootWrapperBlueprint as RouterBlueprint };
export const blueprints = { RouterBlueprint: AppRootWrapperBlueprint };
export function render(Browser: string) { return Browser; }
