import { RouterBlueprint } from 'other';
import { createExtension } from '@backstage/frontend-plugin-api';
import { RouterBlueprint as RealRouter, AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
const x = RouterBlueprint.make({ params: { component: ({ children }) => <BrowserRouter>{children}</BrowserRouter> } });
const y = createExtension({ attachTo: { id: 'app/root', input: 'elements' } });
function configure(RealRouter: any) {
  return RealRouter.make({ params: { component: ({ children }) => <BrowserRouter>{children}</BrowserRouter> } });
}
const migrated = AppRootWrapperBlueprint.make({ params: { component: ({ children }) => <Provider>{children}</Provider> } });
