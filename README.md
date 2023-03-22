# @cloud-cli/store

A tiny abstraction of database tables

## Usage

```ts
import { Resource, Query, Property, Unique, Model, SQLiteDriver } from '@cloud-cli/store';

Resource.use(new SQLiteDriver());

@Model('user')
class User extends Resource {
  @Unique() @Property(Number) id: number;
  @Property(String) name: string;
}

const john = new User({ name: 'John' });
john.save();

const users = await Resource.find(User, new Query());
```
