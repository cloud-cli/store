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
