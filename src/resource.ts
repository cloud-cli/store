const meta = Symbol();
const resourceName = Symbol();

function getMetadataOf(target: any): Map<string | symbol, string | TableColumn>;
function getMetadataOf(target: any, property: string | symbol): TableColumn;
function getMetadataOf(target: any, property?: string | symbol) {
  const ctor = target.constructor && target.constructor !== Function ? target.constructor : target;
  let map = ctor[meta];

  if (!map) {
    map = ctor[meta] = new Map<string, TableColumn>();
  }

  if (!property) {
    return map;
  }

  if (!map.get(property)) {
    const q = { type: String, name: property };
    map.set(property, q);
    return q;
  }

  return map.get(property);
}

export type ColumnType = typeof String | typeof Number | typeof Object | typeof Boolean;
export type ColumnValue = string | number | boolean;
export type ConstructorOf<T> = { new(...args: any[]): T; prototype: T };

export interface TableColumn {
  name: string;
  type: ColumnType;
  unique?: boolean;
  notNull?: boolean;
  primary?: boolean;
  defaultValue?: unknown;
}

export function Model(name: string): any {
  return function (target: any) {
    const meta = getMetadataOf(target);
    meta.set(resourceName, name);
  };
}

export function NotNull(): any {
  return function (target: any, property: string | symbol) {
    const meta = getMetadataOf(target, property);
    meta.notNull = true;
  };
}

export function Unique(): any {
  return function (target: any, property: string | symbol): any {
    const meta = getMetadataOf(target, property);
    meta.unique = true;
  };
}

export function Primary(): any {
  return function (target: any, property: string | symbol): any {
    const meta = getMetadataOf(target, property);
    meta.primary = true;
  };
}

export function Property(type: ColumnType, defaultValue?: any): any {
  return function (target: any, name: string | symbol): any {
    Object.assign(getMetadataOf(target, name), {
      name,
      type,
      defaultValue,
    });
  };
}

const operators = {
  is: '=',
  isNot: '!=',
  isLike: 'like',
  gt: '>',
  lt: '<',
  gte: '>=',
  lte: '<=',
};

type Clause<T extends Resource> = Record<keyof typeof operators, (value: ColumnValue) => Query<T>>;

type PropertiesOf<T extends Resource> = {
  [K in keyof T]: T[K] extends () => any ? never : K;
}[keyof T];

export type ResourceProperties<T extends Resource> = {
  [K in PropertiesOf<T>]: T[K] extends never ? never : T[K];
};

type Filter<T extends Resource> = [PropertiesOf<T>, string, ColumnValue];

export class Query<T extends Resource> {
  private readonly q: Filter<T>[] = [];

  push(field: PropertiesOf<T>, operator: string, value: ColumnValue) {
    this.q.push([field, operator, value]);
    return this;
  }

  where(field: PropertiesOf<T>) {
    const q = this;
    const p = new Proxy(
      {},
      {
        get(_t, operator: string) {
          return (value: ColumnValue) => q.push(field, operators[operator], value);
        },
      },
    );

    return p as Clause<T>;
  }

  toJSON() {
    return this.q;
  }
}

export interface ResourceDescription {
  name: string;
  fields: TableColumn[];
}

export class Resource {
  private static driver: ResourceDriver;

  static use(driver: ResourceDriver) {
    Resource.driver = driver;
  }

  static describe(resource: ConstructorOf<Resource>): ResourceDescription {
    const meta = getMetadataOf(resource);
    const name = meta.get(resourceName) as string;

    if (!name) {
      throw new Error('Name is missing. Did you add @Model() to your class?');
    }

    const fields = Array.from(meta.entries())
      .filter((f) => f[0] !== resourceName)
      .map((f) => f[1]) as TableColumn[];

    if (!fields.find(f => f.primary)) {
      fields.unshift({
        name: 'id',
        type: Number,
        primary: true,
      });
    }

    return { name, fields };
  }

  static async find<T extends Resource>(resource: ConstructorOf<T>, query: Query<T>) {
    return Resource.driver.findAll(resource, query);
  }

  static async create(resource: typeof Resource): Promise<void> {
    return Resource.driver.create(resource);
  }

  constructor(props?: any) {
    if (props) {
      Object.assign(this, props);
    }
  }

  static getMetadataOf = getMetadataOf;

  async save(): Promise<number> {
    return Resource.driver.save(this);
  }

  async remove(): Promise<void> {
    return Resource.driver.remove(this);
  }

  async find(): Promise<this> {
    return Resource.driver.find(this);
  }
}

export abstract class ResourceDriver {
  abstract create(resource: typeof Resource): Promise<void>;
  abstract save<T extends Resource>(model: T): Promise<number>;
  abstract remove<T extends Resource>(model: T): Promise<void>;
  abstract find<T extends Resource>(model: T): Promise<T>;
  abstract findAll<M extends Resource>(resource: ConstructorOf<M>, query: Query<M>): Promise<M[]>;
}
