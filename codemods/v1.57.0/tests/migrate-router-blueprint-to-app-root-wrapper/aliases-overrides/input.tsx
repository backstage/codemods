import { BrowserRouter as Browser, Link } from 'react-router';
import { RouterBlueprint as Router, AppRootWrapperBlueprint } from '@backstage/plugin-app-react';

export const wrapper = Router.makeWithOverrides({
  name: 'query-client',
  *factory(originalFactory) {
    yield* originalFactory({
      component: ({ children }) => (
        <Browser><Provider>{children}</Provider></Browser>
      ),
    });
  },
});
const link = <Link />;
const AppRouter = ({ children }) => <Browser>{children}</Browser>;
const sameFile = Router.make({ params: { component: AppRouter } });
const withProps = Router.make({ params: { component: ({ children }) => <Browser basename="/app">{children}</Browser> } });
const selfClosing = Router.make({ params: { component: () => <Browser /> } });
