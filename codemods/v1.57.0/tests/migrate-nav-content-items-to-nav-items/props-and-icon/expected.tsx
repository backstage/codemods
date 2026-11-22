import { NavContentBlueprint as Nav } from '@backstage/plugin-app-react';
const x = Nav.makeWithOverrides({
  *factory(originalFactory) {
    yield* originalFactory({
      component: props => (
        <div>{props.navItems.rest().map(item => <section>{item.icon}<a href={item.href}>{item.title}</a></section>)}</div>
      ),
    });
  },
});
