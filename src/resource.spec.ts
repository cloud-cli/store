import { Model, NotNull, Primary, Property, Query, Resource, ResourceDriver, Unique } from './index';

class Driver extends ResourceDriver {
  save = jest.fn();
  remove = jest.fn();
  find = jest.fn();
  findAll = jest.fn();
  create = jest.fn();
}

describe('Resource', () => {
  it('should have decorators to declare properties', () => {
    class Foo extends Resource {
      @NotNull()
      @Unique()
      @Property(String, 'Joe')
      name: string;

      @Property(Number)
      age: number;
    }

    const nameMeta = Resource.getMetadataOf(Foo, 'name');
    const ageMeta = Resource.getMetadataOf(Foo, 'age');

    expect(nameMeta).toEqual({
      name: 'name',
      type: String,
      notNull: true,
      unique: true,
      defaultValue: 'Joe',
    });

    expect(ageMeta).toEqual({
      name: 'age',
      type: Number,
    });
  });

  describe('operations', () => {
    @Model('user')
    class User extends Resource {
      @Primary() @NotNull() @Unique() @Property(Number) id: number;
      @Property(String) name: string;
    }

    it('should save, remove or find a resource', async () => {
      const driver = new Driver();
      Resource.use(driver);

      const userWithName = new User({ name: 'John' });
      const userWithNameAndAge = new User({ name: 'John', age: 22 });
      driver.find.mockResolvedValueOnce(userWithNameAndAge);

      const found = await userWithName.find();
      await found.save();
      await userWithName.remove();

      expect(driver.find).toHaveBeenCalledWith(userWithName);
      expect(driver.save).toHaveBeenCalledWith(userWithNameAndAge);
      expect(driver.remove).toHaveBeenCalledWith(userWithName);
    });

    it('should find all resources', async () => {
      const driver = new Driver();
      Resource.use(driver);

      const query = new Query<User>().where('id').gt(5).where('name').is('John');

      await Resource.find(User, query);

      expect(driver.findAll).toHaveBeenCalledWith(User, query);
      expect(query.toJSON()).toEqual([
        ['id', '>', 5],
        ['name', '=', 'John'],
      ]);
    });

    it('should describe a resource', () => {
      const description = Resource.describe(User);

      expect(description).toEqual({
        name: 'user',
        fields: [
          { name: 'id', type: Number, notNull: true, primary: true, unique: true, defaultValue: undefined },
          { name: 'name', type: String, defaultValue: undefined },
        ],
      });

      expect(() => Resource.describe(class extends Resource { })).toThrowError('Name is missing. Did you add @Model() to your class?');
    });

    it('should insert a primary key if not present', () => {
      @Model('user')
      class User extends Resource { }

      const description = Resource.describe(User);
      expect(description).toEqual({
        name: 'user',
        fields: [{ name: 'id', primary: true, type: Number }]
      });
    });

    it('should create the storage for a resource', () => {
      const driver = new Driver();
      Resource.use(driver);
      Resource.create(User);
      expect(driver.create).toHaveBeenCalledWith(User);
    });
  });
});
