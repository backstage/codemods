import { connectionsServiceRef } from '@backstage/connections';
export const App = () => <div>{connectionsServiceRef.id}</div>;
