import { BrowserRouter } from 'react-router-dom';
import { RouterBlueprint } from '@backstage/plugin-app-react';

export default RouterBlueprint.make({
  params: {
    component: ({ children }) => (
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </BrowserRouter>
    ),
  },
});
