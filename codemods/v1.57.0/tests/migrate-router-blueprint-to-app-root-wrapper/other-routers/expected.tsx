import { HashRouter, MemoryRouter } from 'react-router-dom';
import { RouterProvider } from '@tanstack/react-router';
import { AppRootWrapperBlueprint } from '@backstage/plugin-app-react';
import { Router } from './Router';
// TODO(backstage-codemod): render this routing library's page router inside lazily loaded page components instead (see page routers guide).
const extension = AppRootWrapperBlueprint.make({
  params: {
    component: ({ children }) => <HashRouter><MemoryRouter><RouterProvider router={router} />{children}</MemoryRouter></HashRouter>,
  },
});
// TODO(backstage-codemod): check that this component no longer renders a router — the app owns history since 1.57.
const opaque = AppRootWrapperBlueprint.make({ params: { component: Router } });
// TODO(backstage-codemod): check that this component no longer renders a router — the app owns history since 1.57.
const wrapped = AppRootWrapperBlueprint.make({ params: { component: componentCompatWrapper(Router) } });
// TODO(backstage-codemod): check that this component no longer renders a router — the app owns history since 1.57.
const overrides = AppRootWrapperBlueprint.makeWithOverrides({ factory: customFactory });
