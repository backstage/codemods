import { HashRouter, MemoryRouter } from 'react-router-dom';
import { RouterProvider } from '@tanstack/react-router';
import { RouterBlueprint } from '@backstage/plugin-app-react';
import { Router } from './Router';
const extension = RouterBlueprint.make({
  params: {
    component: ({ children }) => <HashRouter><MemoryRouter><RouterProvider router={router} />{children}</MemoryRouter></HashRouter>,
  },
});
const opaque = RouterBlueprint.make({ params: { component: Router } });
const wrapped = RouterBlueprint.make({ params: { component: componentCompatWrapper(Router) } });
const overrides = RouterBlueprint.makeWithOverrides({ factory: customFactory });
