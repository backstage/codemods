import { connectionsServiceRef } from '@backstage/connections-backend';
export const App = () => <div>{connectionsServiceRef.id}</div>;
