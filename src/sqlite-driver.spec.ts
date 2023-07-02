import { Database } from 'better-sqlite3';
import { SQLiteDriver, Resource, Property, Query, Model, NotNull, Unique, Primary } from './index';

function setup(all: any = [null, []], run = [], get = {}) {
  const driver = new SQLiteDriver(':memory:');
  const db: Database = driver['db'];

  const mock = {
    get: jest.fn(() => { if (get && get instanceof Error) { throw get; } return get; }),
    all: jest.fn(() => { if (all[0]) { throw all[0]; } return all[1]; }),
    run: jest.fn(() => { if (run[0]) { throw run[0]; } return { lastInsertRowid: 1 }; }),
  };
  jest.spyOn(db, 'prepare').mockImplementation(() => mock as any);
  Resource.use(driver);

  return { db, mock };
}

describe('sqlite driver', () => {
  describe('create()', () => {
    it('should create a table', async () => {
      @Model('user')
      class User extends Resource {
        @Property(String) name: string;
        @Property(Boolean) alive: boolean;
      }

      const { db, mock } = setup();
      await Resource.create(User);

      expect(db.prepare).toHaveBeenCalledWith('CREATE TABLE IF NOT EXISTS user (id INTEGER, name TEXT, alive INTEGER, PRIMARY KEY(id))');
      expect(mock.run).toHaveBeenCalledWith([]);
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
      const { db } = setup();
      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
        @NotNull() @Property(String) name: string;
        @Unique() @Property(Number) age: number;
      }

      await Resource.create(User);
      expect(db.prepare).toHaveBeenCalledWith('CREATE TABLE IF NOT EXISTS user (id INTEGER, name TEXT NOT NULL, age INTEGER, UNIQUE(age), PRIMARY KEY(id))');
    });
  });

  describe('find', () => {
    it('should find an item by id', async () => {
      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
        @NotNull() @Property(String) name: string;
      }

      const { db, mock } = setup([null, [{ id: 123, name: 'joe' }]]);
      const user = new User({ id: 123 });
      const found = await user.find();

      expect(found).not.toBe(user);
      expect(db.prepare).toHaveBeenCalledWith('SELECT id,name FROM user WHERE id = ? LIMIT 1');
      expect(mock.get).toHaveBeenCalledWith([123]);
    });

    it('should throw error if item was not found', async () => {
      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
        @NotNull() @Property(String) name: string;
      }

      setup(undefined, undefined, null);
      const user = new User({ id: 123 });
      await expect(user.find()).rejects.toThrowError('Not found');
    });

    it('should throw error if query failed', async () => {
      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
        @NotNull() @Property(String) name: string;
      }

      setup(undefined, undefined, new Error('boom'));
      const user = new User({ id: 123 });
      await expect(user.find()).rejects.toThrowError('boom');
    });
  });

  describe('findAll()', () => {
    it('should select all items from a table', async () => {


      @Model('product')
      class Product extends Resource {
        @Primary() @Property(Number) id: number;
      }

      const { db } = setup([null, []]);

      const query = new Query<Product>();
      const found = Resource.find<Product>(Product, query);

      expect(db.prepare).toHaveBeenCalledWith('SELECT * FROM product');
      await expect(found).resolves.toEqual([]);
    });

    it('should select specific items from a table', async () => {

      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
        @NotNull() @Property(String) name: string;
        @Unique() @Property(Number) age: number;
      }

      const user: Partial<User> = { name: 'Joe', age: 30, id: 1 };
      const { db, mock } = setup([null, [user]]);

      const query = new Query<User>().where('name').is('Joe');
      const found = Resource.find<User>(User, query);

      await expect(found).resolves.toEqual([new User(user)]);

      expect(db.prepare).toHaveBeenCalledWith('SELECT * FROM user WHERE name = ?');
      expect(mock.all).toHaveBeenCalledWith(['Joe']);
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
      const { db, mock } = setup([null, [{ id: 1 }]]);

      @Model('group')
      class Group extends Resource {
        @Primary() @Property(Number) oid: number;
        @Property(String) name: string;
        @Property(String) type: string;
        @Property(Boolean) enabled: boolean;
      }

      const group = new Group({ name: 'group', enabled: true });
      const id = await group.save();

      expect(id).toBe('1');
      expect(db.prepare).toHaveBeenCalledWith('REPLACE INTO group (name,type,enabled) VALUES (?,?,?)');
      expect(mock.run).toHaveBeenCalledWith(['group', '', 1]);
    });

    it('should reject if item cannot be stored', async () => {
      setup(undefined, [new Error('Nope')]);

      @Model('group')
      class Group extends Resource { }
      const group = new Group({});
      await expect(group.save()).rejects.toThrowError(new Error('Cannot store item: Nope'));
    });
  });

  describe('remove()', () => {
    it('should remove items from a table', async () => {
      const { db, mock } = setup();
      @Model('group')
      class Group extends Resource {
        @Primary() @Property(Number) oid: number;
        @Property(String) name: string;
      }

      const user = new Group({ oid: 123 });
      await user.remove();

      expect(db.prepare).toHaveBeenCalledWith('DELETE FROM group WHERE oid = ?');
      expect(mock.run).toHaveBeenCalledWith([123]);
    });

    it('should reject if removal failed', async () => {
      setup(undefined, [new Error('bang')]);

      @Model('group')
      class Group extends Resource {
        @Primary() @Property(Number) oid: number;
      }

      const user = new Group({ oid: 123 });
      await expect(user.remove()).rejects.toThrowError(new Error('Unable to remove: bang'));
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

      expect(ids).toEqual(['1', '2']);
      const savedHeroes = await Resource.find(Hero, new Query<Hero>());

      expect(savedHeroes.length).toBe(2);
      expect(savedHeroes[0].dead).toBe(true);
      expect(savedHeroes[1].dead).toBe(false);

      const [tonyStark] = await Resource.find(Hero, new Query<Hero>().where('name').is('Tony'));
      expect(tonyStark).not.toBeUndefined();
      expect(tonyStark.id).toBe(1);
      expect(tonyStark.dead).toBe(true);

      const tonyStarkById = await new Hero({ id: 1 }).find();
      expect(tonyStarkById).toEqual(tonyStark);

      await tonyStark.remove();
      const [drStranger] = await Resource.find(Hero, new Query());
      expect(drStranger.properties).toEqual(heroes[1].properties);

      drStranger.dead = true;
      await drStranger.save();

      const [deadDrStranger] = await Resource.find(Hero, new Query());
      expect(deadDrStranger.dead).toBe(true);
    });
  });
});
