import { navItemExtension } from './navExtension';
import { testApiRef } from './apis';
import { renderTestApp } from '@backstage/frontend-test-utils';

function MyPage() {
  return null;
}

it('preserves apis', async () => {
  await renderTestApp(<MyPage />, { apis: [[testApiRef, { getData: () => 'test' }]], mountedRoutes: { '/my-page': () => null } });
});
