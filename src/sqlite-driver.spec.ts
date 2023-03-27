import sqlite3 from 'sqlite3';
import { SQLiteDriver, Resource, Property, Query, Model, NotNull, Unique, Primary } from './index';

function setup(all: any = [null, []], run = []) {
  const driver = new SQLiteDriver(':memory:');
  const db: sqlite3.Database = driver['db'];

  jest.spyOn(db, 'all').mockImplementation((_q, cb) => cb(...all));
  jest.spyOn(db, 'prepare').mockImplementation(() => db as any);
  jest.spyOn(db, 'run').mockImplementation((_q, cb) => cb(...run));

  Resource.use(driver);

  return db;
}

describe('sqlite driver', () => {
  describe('create()', () => {
    it('should create a table', async () => {
      @Model('user')
      class User extends Resource {
        @Property(String) name: string;
      }

      const db = setup();
      await Resource.create(User);

      expect(db.run).toHaveBeenCalledWith('CREATE TABLE IF NOT EXISTS user (oid INTEGER, name TEXT, PRIMARY KEY(oid))', expect.any(Function));
    });

    it('should throw an error if primary key is invalid', async () => {
      @Model('user')
      class User extends Resource {
        @Primary() @Property(String) name: string;
      }

      setup();
      await expect(Resource.create(User)).rejects.toThrowError('Invalid primary key. It has to be of type Number');
    });

    it('should throw an error if creation fails', async () => {
      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
      }

      setup(undefined, [new Error('Bang')]);
      await expect(Resource.create(User)).rejects.toThrowError('Cannot create table "user"');
    });

    it('should add constraits and options to columns', async () => {
      const db = setup();
      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
        @NotNull() @Property(String) name: string;
        @Unique() @Property(Number) age: number;
      }

      await Resource.create(User);
      expect(db.run).toHaveBeenCalledWith('CREATE TABLE IF NOT EXISTS user (id INTEGER, name TEXT NOT NULL, age INTEGER, UNIQUE(age), PRIMARY KEY(id))', expect.any(Function));
    });
  });

  describe('find', () => {
    it('should find an item by id', async () => {
      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
        @NotNull() @Property(String) name: string;
      }

      const db = setup([null, [{ id: 123, name: 'joe' }]]);
      const user = new User({ id: 123 });
      const found = await user.find();

      expect(found).not.toBe(user);
      expect(db.prepare).toHaveBeenCalledWith('SELECT id,name FROM user WHERE id = ? LIMIT 1');
      expect(db.all).toHaveBeenCalledWith([123], expect.any(Function));
    });

    it('should throw error if item was not found', async () => {
      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
        @NotNull() @Property(String) name: string;
      }

      setup([null, []]);
      const user = new User({ id: 123 });
      await expect(user.find()).rejects.toThrowError('Not found');
    });
  });

  describe('findAll()', () => {
    it('should select all items from a table', async () => {


      @Model('product')
      class Product extends Resource {
        @Primary() @Property(Number) id: number;
      }

      const db = setup([null, []]);

      const query = new Query<Product>();
      const found = Resource.find<Product>(Product, query);

      expect(db.prepare).toHaveBeenCalledWith('SELECT id FROM product');
      expect(found).resolves.toEqual([]);
    });

    it('should select specific items from a table', async () => {

      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
        @NotNull() @Property(String) name: string;
        @Unique() @Property(Number) age: number;
      }

      const user: Partial<User> = { name: 'Joe', age: 30, id: 1 };
      const db = setup([null, [user]]);

      const query = new Query<User>().where('name').is('Joe');
      const found = Resource.find<User>(User, query);

      await expect(found).resolves.toEqual([new User(user)]);

      expect(db.prepare).toHaveBeenCalledWith('SELECT id,name,age FROM user WHERE name = ?');
      expect(db.all).toHaveBeenCalledWith(['Joe'], expect.any(Function));
    });

    it('should reject if listing items failed', async () => {
      @Model('foo')
      class Foo extends Resource {
        @Primary() @Property(Number) id: number;
      }

      setup([new Error('Bang'), []]);
      const found = Resource.find(Foo, new Query());

      await expect(found).rejects.toThrowError(new Error('Bang'));
    });
  });

  describe('save()', () => {
    it('should add items to a table', async () => {
      const db = setup([null, [{ id: 123 }]]);

      @Model('group')
      class Group extends Resource {
        @Primary() @Property(Number) oid: number;
        @Property(String) name: string;
        @Property(String) type: string;
      }

      const group = new Group({ name: 'group' });
      const id = await group.save();

      expect(id).toBe(123);
      expect(db.prepare).toHaveBeenCalledWith('INSERT INTO group (name,type) VALUES (?,?)');
      expect(db.all).toHaveBeenCalledWith('SELECT last_insert_rowid() as id', expect.any(Function));
      expect(db.run).toHaveBeenCalledWith(['group', ''], expect.any(Function));
    });

    it('should reject if item cannot be stored', async () => {
      setup(undefined, [new Error('Nope')]);

      @Model('group')
      class Group extends Resource {}
      const group = new Group({});
      await expect(group.save()).rejects.toThrowError(new Error('Cannot store item: Nope'));

    });
  });

  describe('remove()', () => {
    it('should remove items from a table', async () => {
      const db = setup();
      @Model('group')
      class Group extends Resource {
        @Primary() @Property(Number) oid: number;
        @Property(String) name: string;
      }

      const user = new Group({ oid: 123 });
      await user.remove();

      expect(db.prepare).toHaveBeenCalledWith('DELETE FROM group WHERE oid = ?');
      expect(db.run).toHaveBeenCalledWith([123], expect.any(Function));
    });

    it('should reject if removal failed', async () => {
      setup(undefined, [new Error('bang')]);

      @Model('group')
      class Group extends Resource {
        @Primary() @Property(Number) oid: number;
      }

      const user = new Group({ oid: 123 });
      await expect( user.remove()).rejects.toThrowError(new Error('Unable to remove: bang'));
    });
  });

  describe('create table, insert, update, find and remove items (integration)', () => {
    it('should work with a SQLite database', async () => {
      const driver = new SQLiteDriver(':memory:');
      Resource.use(driver);

      @Model('hero')
      class Hero extends Resource {
        @Primary() @Property(Number) id: number;
        @Unique() @NotNull() @Property(String) name: string;
        @Property(Number, 0) strength: number;
        @Property(Boolean, false) dead: boolean;
        @Property(Object) properties: { superPowers: string[] };
      }

      await Resource.create(Hero);
      const heroes: Partial<Hero>[] = [
        {
          name: 'Tony',
          dead: true,
          properties: { superPowers: ['suit'] }
        },

        {
          name: 'DrStranger',
          properties: { superPowers: ['time'] }
        }
      ]

      const ids = [];
      for (const hero of heroes) {
        ids.push(await new Hero(hero).save());
      }

      expect(ids).toEqual([1, 2]);

      const [tonyStark] = await Resource.find(Hero, new Query<Hero>().where('name').is('Tony'));

      expect(tonyStark).not.toBeUndefined();
      expect(tonyStark.id).toBe(1);
      expect(tonyStark.dead).toBe(true);

      const tonyStarkById = await new Hero({ id: 1 }).find();
      expect(tonyStarkById).toEqual(tonyStark);

      await tonyStark.remove();
      const [drStranger] = await Resource.find(Hero, new Query());
      expect(drStranger.properties).toEqual(heroes[1].properties);
    });
  });
});
