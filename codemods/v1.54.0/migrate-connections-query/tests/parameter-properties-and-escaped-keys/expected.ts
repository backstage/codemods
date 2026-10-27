import type { ConnectionsService as Service } from '@backstage/connections';

class Lookup {
  constructor(private readonly connections: Service) {}
  find(url: string) {
    return this.connections.find({ type: 'github', query: { url } });
  }
  escapedQuery(url: string) {
    return /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ this.connections.find({ type: 'github', url, '\u0071uery': { url } });
  }
  escapedUrl(url: string) {
    return /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ this.connections.find({ type: 'github', '\u0075rl': url });
  }
  computedEscapedQuery(url: string) {
    return /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ this.connections.find({ type: 'github', url, ['\u0071uery']: { url } });
  }
  bareEscapedQuery(url: string) {
    return /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ this.connections.find({ type: 'github', url, \u0071uery: { url } });
  }
  bareEscapedUrl(url: string) {
    return /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ this.connections.find({ type: 'github', \u0075rl: url });
  }
  shorthandEscapedQuery(url: string, query: object) {
    return /* TODO(backstage-codemod): review ConnectionsService.find query for this connection type */ this.connections.find({ type: 'github', url, \u0071uery });
  }
  commented(url: string) {
    return this.connections.find({ type: 'github', /* keep */ query: { url } });
  }
  static staticLookup(url: string) {
    return this.connections.find({ type: 'github', url });
  }
}

class ReadonlyProperty {
  constructor(readonly connections: Service) {}
  find(url: string) {
    return this.connections.find({ type: 'gitlab', query: { url } });
  }
}

class NotAProperty {
  constructor(connections: Service) {}
  find(url: string) {
    return this.connections.find({ type: 'github', url });
  }
}

class OtherProperty {
  constructor(private readonly connections: { find(value: object): void }) {}
  find(url: string) {
    return this.connections.find({ type: 'github', url });
  }
}

function unrelated(connections: { find(value: object): void }, url: string) {
  connections.find({ type: 'github', url, '\u0071uery': { url } });
}
