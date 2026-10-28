import type { ConnectionsService as Service } from '@backstage/connections';

class Lookup {
  constructor(private readonly connections: Service) {}
  find(url: string) {
    return this.connections.find({ type: 'github', url });
  }
  escapedQuery(url: string) {
    return this.connections.find({ type: 'github', url, '\u0071uery': { url } });
  }
  escapedUrl(url: string) {
    return this.connections.find({ type: 'github', '\u0075rl': url });
  }
  computedEscapedQuery(url: string) {
    return this.connections.find({ type: 'github', url, ['\u0071uery']: { url } });
  }
  bareEscapedQuery(url: string) {
    return this.connections.find({ type: 'github', url, \u0071uery: { url } });
  }
  bareEscapedUrl(url: string) {
    return this.connections.find({ type: 'github', \u0075rl: url });
  }
  shorthandEscapedQuery(url: string, query: object) {
    return this.connections.find({ type: 'github', url, \u0071uery });
  }
  commented(url: string) {
    return this.connections.find({ type: 'github', /* keep */ url });
  }
  static staticLookup(url: string) {
    return this.connections.find({ type: 'github', url });
  }
}

class ReadonlyProperty {
  constructor(readonly connections: Service) {}
  find(url: string) {
    return this.connections.find({ type: 'gitlab', url });
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
