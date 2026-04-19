/** Local component named PermissionedRoute — must not be transformed */
function PermissionedRoute(props: { path: string; children?: unknown }) {
  return null;
}

export const r = <PermissionedRoute path="/local">x</PermissionedRoute>;
