import { BrowserRouter as Browser, Link } from 'react-router';
import { AppRootWrapperBlueprint as Router, AppRootWrapperBlueprint } from '@backstage/plugin-app-react';

export const wrapper = Router.makeWithOverrides({
  name: 'query-client',
  *factory(originalFactory) {
    yield* originalFactory({
      component: ({ children }) => (
        <Provider>{children}</Provider>
      ),
    });
  },
});
const link = <Link />;
const AppRouter = ({ children }) => <>{children}</>;
// TODO(backstage-codemod): this router override only installed BrowserRouter. The app owns history since 1.57 — delete this extension and its registration.
const sameFile = Router.make({ params: { component: AppRouter } });
// TODO(backstage-codemod): BrowserRouter was kept because it has props (e.g. basename). The app owns history since 1.57 — remove it and configure the base path via app.baseUrl.
const withProps = Router.make({ params: { component: ({ children }) => <Browser basename="/app">{children}</Browser> } });
const selfClosing = Router.make({ params: { component: () => <Browser /> } });
