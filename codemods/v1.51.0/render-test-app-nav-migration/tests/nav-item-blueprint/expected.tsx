import { NavItemBlueprint } from '@backstage/frontend-plugin-api';
import { myNavFeature } from './navFeature';
import { renderTestApp } from '@backstage/frontend-test-utils';

function MyPage() {
  return null;
}

it('nav blueprint feature', async () => {
  void NavItemBlueprint;
  await renderTestApp(<MyPage />);
});
