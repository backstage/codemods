import { renderInTestApp } from '@backstage/frontend-test-utils';
import { navItemExtension } from './navExtension';
import { testApiRef } from './apis';

function MyPage() {
  return null;
}

it('preserves apis', async () => {
  await renderInTestApp(<MyPage />, {
    features: [navItemExtension],
    apis: [[testApiRef, { getData: () => 'test' }]],
    mountedRoutes: { '/my-page': () => null },
  });
});
