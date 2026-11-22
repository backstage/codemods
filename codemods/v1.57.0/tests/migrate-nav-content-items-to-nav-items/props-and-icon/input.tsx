import { NavContentBlueprint as Nav } from '@backstage/plugin-app-react';
const x = Nav.makeWithOverrides({
  *factory(originalFactory) {
    yield* originalFactory({
      component: props => (
        <div>{props.items.map(item => <section><item.icon /><a href={item.to}>{item.text}</a></section>)}</div>
      ),
    });
  },
});
