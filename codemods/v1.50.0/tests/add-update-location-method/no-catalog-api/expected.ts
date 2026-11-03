import { Entity } from '@backstage/catalog-model';

interface MyApi {
  getEntities(): Promise<Entity[]>;
}

class MyService implements MyApi {
  async getEntities(): Promise<Entity[]> {
    return [];
  }
}

const mock: jest.Mocked<MyApi> = {
  getEntities: jest.fn(),
};
