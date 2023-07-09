# @cloud-cli/store

A tiny abstraction of database tables

## Usage

```ts
import { Model, Primary, Property, Query, Resource, Unique, Model, SQLiteDriver } from '@cloud-cli/store';

// initialize
Resource.use(new SQLiteDriver(':memory:'));

// create a resource
@Model('user')
class User extends Resource {
  @Unique() @Primary() @Property(Number) id: number;
  @Property(String) name: string;
}

// save
const john = new User({ name: 'John' });
const id = await john.save();

// find with filters
const query = new Query<User>().where('name').is('John');
const users = await Resource.find(User, query);

// remove an item
await users[0].remove();
```

## Storage Drivers

SQLiteDriver:

```ts
// path to a file, or `:memory:` for in memory storage.
// if not provided, defaults to `process.env.SQLITE_DB_PATH`

const driver = new SQLiteDriver('path/to/file.db');
```

StoreDriver (for a [JSON store](https://github.com/cloud-cli/json-store)):

```ts
// address of Store API to use.
// if not provided, defaults to `process.env.STORE_URL`

const driver = new StoreDriver('https://store.io/hash');
```
