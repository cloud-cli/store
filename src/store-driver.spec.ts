import { StoreDriver, Resource, Property, Model, Primary, Query } from './index';

const storeUrl = 'http://localhost:1234/store-id/';
const headers = { 'content-type': 'application/json' };

beforeAll(() => {
  jest.spyOn(StoreDriver, 'fetch');
  jest.spyOn(StoreDriver, 'uid');
});

function setup() {
  const driver = new StoreDriver(storeUrl);
  const fetch = StoreDriver.fetch as jest.SpyInstance;
  const uid = StoreDriver.uid as unknown as jest.SpyInstance;

  fetch.mockReset();
  uid.mockReset();
  Resource.use(driver);

  return { driver, fetch, uid };
}

describe('store driver', () => {
  describe('store url', () => {
    it('shoud use process.env.STORE_URL by default', async () => {
      process.env.STORE_URL = 'http://localhost:5678/store-url/';
      const driver = new StoreDriver();
      const fetch = (StoreDriver.fetch = jest.fn());

      @Model('user')
      class User extends Resource {}

      Resource.use(driver);
      await Resource.create(User);

      expect(fetch).toHaveBeenCalledWith('http://localhost:5678/store-url/user/0', expect.any(Object));
    });
  });

  describe('create()', () => {
    it('should create a table', async () => {
      @Model('user')
      class User extends Resource {}
      const { fetch } = setup();
      fetch.mockImplementation(() => Promise.resolve({ ok: true }));

      await Resource.create(User);
      expect(fetch).toHaveBeenCalledWith('http://localhost:1234/store-id/user/0', {
        method: 'POST',
        body: '{}',
        headers,
      });
      expect(fetch).toHaveBeenCalledWith('http://localhost:1234/store-id/user/0', { method: 'DELETE' });
    });

    it('should throw an error if creation fails', async () => {
      @Model('user')
      class User extends Resource {
        @Primary() @Property(Number) id: number;
      }

      const { fetch } = setup();
      fetch.mockImplementationOnce(() => Promise.resolve({ ok: true }));
      fetch.mockImplementationOnce(() => Promise.reject({ ok: false }));

      await expect(Resource.create(User)).rejects.toThrowError('Cannot create resource "user"');
    });
  });

  describe('find()', () => {
    @Model('fruit')
    class Fruit extends Resource {
      @Primary() @Property(String) name: string;
      @Property(String) color: string;
    }

    it('should find an item by its primary key', async () => {
      const { fetch } = setup();
      const found = new Fruit({ name: 'mango', color: 'yellow' });
      const fruit = new Fruit({ name: 'mango' });
      fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => found }));

      const result = await fruit.find();

      expect(result).not.toBe(fruit);
      expect(result).toBe(found);
      expect(fetch).toHaveBeenCalledWith('http://localhost:1234/store-id/fruit/mango');
    });

    it('should throw error if item does not exist', async () => {
      const { fetch } = setup();
      fetch.mockImplementationOnce(() => Promise.resolve({ ok: false }));

      const fruit = new Fruit({ name: 'pear' });
      const result = fruit.find();

      await expect(result).rejects.toThrowError('Not found');
    });
  });

  describe('remove()', () => {
    it('should remove an item', async () => {
      const { fetch } = setup();
      @Model('group')
      class Group extends Resource {
        @Primary() @Property(Number) oid: number;
      }

      fetch.mockImplementationOnce(() => Promise.resolve({ ok: true }));

      const user = new Group({ oid: 123 });
      await user.remove();

      expect(fetch).toHaveBeenCalledWith('http://localhost:1234/store-id/group/123', { method: 'DELETE' });
    });
  });

  describe('save()', () => {
    @Model('group')
    class Group extends Resource {
      @Primary() @Property(Number) oid: number;
      @Property(String) name: string;
      @Property(Boolean, true) enabled: string;
    }

    it('should add items to a table', async () => {
      const { fetch, uid } = setup();
      uid.mockImplementation(() => '123');
      fetch.mockImplementation(() => Promise.resolve({ ok: true }));

      const group = new Group({ name: 'test', enabled: false });
      const otherGroup = new Group({ name: 'other' });
      const id = await group.save();
      await otherGroup.save();

      expect(id).toBe('123');
      expect(fetch).toHaveBeenCalledWith('http://localhost:1234/store-id/group/123', {
        method: 'PUT',
        body: '{"name":"test","enabled":false,"oid":"123"}',
        headers,
      });
      expect(fetch).toHaveBeenCalledWith('http://localhost:1234/store-id/group/123', {
        method: 'PUT',
        body: '{"name":"other","oid":"123","enabled":true}',
        headers,
      });
    });

    it('should throw error', async () => {
      const { fetch } = setup();
      const result = { ok: false, status: 400, json: jest.fn() };
      fetch.mockImplementationOnce(() => Promise.resolve(result));

      const group = new Group({ name: 'test', enabled: true });
      await expect(group.save()).rejects.toThrowError('400');
      expect(result.json).not.toHaveBeenCalled();
    });
  });

  describe('findAll()', () => {
    @Model('person')
    class Person extends Resource {
      @Property(String) name: string;
      @Property(Number) age: number;
    }

    it('should find all items that match the query', async () => {
      const { fetch } = setup();
      const items = [
        new Person({ age: 25, name: 'Joebert' }),
        new Person({ age: 21, name: 'Joe' }),
        new Person({ age: 30, name: 'Paul' }),
        new Person({ age: 5, name: 'Joelle' }),
      ];

      fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, json: () => Promise.resolve(items) }));
      const query = new Query<Person>();
      query.where('name').isLike('Joe');
      query.where('age').gt(0);
      query.where('age').gte(20);
      query.where('age').isNot(1);
      query.where('age').lt(31);
      query.where('age').lte(30);
      query.where('age').is('21');
      // invalid operator is ignored
      query.push('age', 'nope', '');

      await expect(Resource.find(Person, query)).resolves.toEqual([new Person({ age: 21, name: 'Joe' })]);

      expect(fetch).toHaveBeenCalledWith('http://localhost:1234/store-id/person');
    });

    it('should throw error', async () => {
      const { fetch } = setup();
      const result = { ok: false, json: jest.fn() };
      fetch.mockImplementationOnce(() => Promise.resolve(result));

      await expect(Resource.find(Person, new Query())).rejects.toThrowError('Not found');
      expect(result.json).not.toHaveBeenCalled();
    });
  });
});
