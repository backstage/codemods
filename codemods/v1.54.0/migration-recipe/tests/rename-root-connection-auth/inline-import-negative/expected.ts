const value = import('@backstage/connections').RootConnectionAuth;
type ConfigAuth = import('@backstage/connections/config').RootConnectionAuth;
type ForeignAuth = import('other').RootConnectionAuth;
let annotated: import('@backstage/connections').ConfiguredConnectionAuth;
