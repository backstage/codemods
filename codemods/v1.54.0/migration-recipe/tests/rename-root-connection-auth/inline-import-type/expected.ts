type Auth = import('@backstage/connections').ConfiguredConnectionAuth<MyMethod>;
type Already = import('@backstage/connections').ConfiguredConnectionAuth<MyMethod>;
type Other = import('@backstage/connections/config').RootConnectionAuth<MyMethod>;
type Foreign = import('other').RootConnectionAuth<MyMethod>;
