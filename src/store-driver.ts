import { ConstructorOf, Query, Resource, ResourceDriver } from './resource';
import { randomUUID } from 'crypto';

const headers = { 'content-type': 'application/json' };

export class StoreDriver extends ResourceDriver {
  static fetch = globalThis.fetch;
  static uid = randomUUID;
  readonly storeUrl: string;

  constructor(baseUrl = process.env.STORE_URL) {
    super();
    this.storeUrl = String(baseUrl).replace(/\/$/, '');
  }

  async create(resource: typeof Resource): Promise<void> {
    const desc = Resource.describe(resource);
    const { name } = desc;
    const url = this.storeUrl + '/' + name + '/0';

    try {
      await StoreDriver.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });

      await StoreDriver.fetch(url, { method: 'DELETE' });
    } catch {
      throw new Error(`Cannot create resource "${name}"`);
    }
  }

  async save<T extends Resource>(model: T): Promise<string> {
    const desc = Resource.describe(model);
    const { url, id } = this.getUrl(model);

    desc.fields.forEach((field) => {
      model[field.name] = model[field.name] ?? field.defaultValue;
    });

    const body = JSON.stringify(model);
    const remote = await StoreDriver.fetch(url, { method: 'PUT', headers, body });

    if (remote.ok) {
      return id;
    }

    throw new Error(String(remote.status));
  }

  async remove<T extends Resource>(model: T): Promise<void> {
    const { url } = this.getUrl(model);

    return void (await StoreDriver.fetch(url, { method: 'DELETE' }));
  }

  async find<T extends Resource>(model: T): Promise<T> {
    const { url } = this.getUrl(model);
    const resource = Object.getPrototypeOf(model).constructor as ConstructorOf<T>;
    const remote = await StoreDriver.fetch(url);

    if (remote.ok) {
      return this.createModel(resource, await remote.json());
    }

    throw new Error('Not found');
  }

  async findAll<M extends Resource>(resource: ConstructorOf<M>, query: Query<M>): Promise<M[]> {
    const desc = Resource.describe(resource);
    const { name } = desc;
    const url = this.storeUrl + '/' + name;

    const remote = await StoreDriver.fetch(url);

    if (remote.ok) {
      const map = await remote.json();
      const items: M[] = Object.values(map).map((raw) => this.createModel(resource, raw));
      return this.filter(items, query);
    }

    throw new Error('Not found');
  }

  private getUrl<T extends Resource>(model: T) {
    const desc = Resource.describe(model);
    const { name } = desc;
    const primary = desc.fields.find((field) => field.primary);

    if (!model[primary.name]) {
      model[primary.name] = StoreDriver.uid();
    }

    const id = model[primary.name];
    const url = this.storeUrl + '/' + name + '/' + id;

    return { url, id };
  }

  private filter<T extends Resource>(items: T[], query: Query<T>) {
    const filters = query.toJSON();

    let next: (typeof filters)[number];

    while (items.length && (next = filters.shift())) {
      const [left, op, right] = next;
      items = items.filter((item) => this.compare(item, left, op, right));
    }

    return items;
  }

  private compare(item: any, left: any, op: string, right: any): boolean {
    switch (op) {
      case '=':
        return item[left] == right;
      case '!=':
        return item[left] != right;
      case 'like':
        return String(item[left]).includes(String(right));
      case '>':
        return item[left] > right;
      case '<':
        return item[left] < right;
      case '>=':
        return item[left] >= right;
      case '<=':
        return item[left] <= right;
      default:
        return true;
    }
  }

  private createModel<M extends Resource>(model: ConstructorOf<M>, data: any) {
    const desc = Resource.describe(model);
    const modelData = {};

    desc.fields.forEach((field) => {
      modelData[field.name] = data[field.name] ?? field.defaultValue;
    });

    return new model(modelData) as M;
  }
}
