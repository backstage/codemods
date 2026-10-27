import * as UI from '@backstage/ui'

function Shadowed({ UI }) {
  return <UI.Link href="/shadowed" render={<a />}>Shadowed</UI.Link>
}

export function Example() {
  return (
    <>
      <UI.Link href="/imported" render={<a />}>Imported</UI.Link>
      <Shadowed UI={UI} />
    </>
  )
}
