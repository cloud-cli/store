import SQLite, { Database } from 'better-sqlite3';
import type { ColumnType, ColumnValue, ConstructorOf, TableColumn } from './resource.js';
import { Query, Resource, ResourceDriver } from './resource.js';
import { Logger } from './logger.js';

export class SQLiteDriver extends ResourceDriver {
  readonly db: Database;

  /* istanbul ignore next */
  constructor(path = process.cwd() + '/cloud.db') {
    super();
    this.db = new SQLite(path);
    this.db.pragma('journal_mode = WAL');
  }

  static parse(type: ColumnType, value: ColumnValue) {
    if (type === Number) {
      return Number(value);
    }

    if (type === Boolean) {
      return Number(value) === 1;
    }

    if (type === Object) {
      return JSON.parse(String(value));
    }

    return String(value);
  }

  static serialize(type: ColumnType, value: ColumnValue) {
    if (type === Number) {
      return Number(value);
    }

    if (type === Object) {
      return JSON.stringify(value);
    }

    if (type === Boolean) {
      return Number(value) === 1 ? 1 : 0;
    }

    return String(value);
  }

  async save<T extends Resource>(model: T) {
    const resource = Object.getPrototypeOf(model).constructor;
    const desc = Resource.describe(resource);
    const fields = desc.fields.filter(field => !field.primary);
    const columns = fields.map(f => f.name);

    const row = fields.map(field => {
      return SQLiteDriver.serialize(field.type, model[field.name] || field.defaultValue || '');
    });

    const primary = desc.fields.find(field => field.primary);
    const isUpdate = model[primary.name] !== undefined;

    if (isUpdate) {
      columns.unshift(primary.name);
      row.unshift(model[primary.name]);
    }

    const values = Array(columns.length).fill('?').join(',');

    return new Promise<number>((resolve, reject) => {
      const sql = `REPLACE INTO ${desc.name} (${columns}) VALUES (${values})`;
      Logger.debug(sql, row);

      try {
        const statement = this.db.prepare(sql);
        const { lastInsertRowid } = statement.run(row);
        resolve(Number(lastInsertRowid));
      } catch (error) {
        reject(new Error('Cannot store item: ' + error.message))
      }
    });
  }

  async remove<T extends Resource>(model: T): Promise<void> {
    const resource = Object.getPrototypeOf(model).constructor;
    const desc = Resource.describe(resource);

    return new Promise((resolve, reject) => {
      const primary = desc.fields.find(field => field.primary);
      const query = `DELETE FROM ${desc.name} WHERE ${primary.name} = ?`;
      Logger.debug(query, model[primary.name]);

      try {
        const statement = this.db.prepare(query);
        statement.run([model[primary.name]]);
        resolve();
      } catch (error) {
        reject(new Error('Unable to remove: ' + error.message))
      }
    });
  }

  async find<T extends Resource>(model: T): Promise<T> {
    const Model = Object.getPrototypeOf(model).constructor;
    const desc = Resource.describe(Model);
    const columns = desc.fields.map(f => f.name);
    const primary = desc.fields.find(field => field.primary);
    const id = model[primary.name];

    const query = `SELECT ${columns} FROM ${desc.name} WHERE ${primary.name} = ? LIMIT 1`;
    Logger.debug(query, [id]);

    return new Promise<T>((resolve, reject) => {
      try {
        const statement = this.db.prepare(query);
        const result = statement.get([id]);

        if (!result) {
          reject(new Error('Not found'));
          return;
        }

        resolve(this.createModel(Model, result) as T);
      } catch (error) {
        reject(error);
      }
    });
  }

  async findAll<M extends Resource>(
    resource: ConstructorOf<M>,
    query: Query<M>,
  ): Promise<M[]> {
    const desc = Resource.describe(resource);
    const conditions = query.toJSON();
    const where = conditions.map(([field, operator]) => `${String(field)} ${operator} ?`);
    const args = conditions.map(c => c[2]);
    const queryStr = `SELECT * FROM ${desc.name}${where.length ? ' WHERE ' + where.join(' AND ') : ''}`;
    Logger.debug(queryStr, args);

    return new Promise((resolve, reject) => {
      try {
        const statement = this.db.prepare(queryStr);
        const value = statement.all(args);
        resolve(value.map(data => this.createModel(resource, data)) as M[])
      } catch (error) {
        reject(error);
      }
    });
  }

  private createModel(model: ConstructorOf<Resource>, data: any) {
    const desc = Resource.describe(model);
    const modelData = {};

    desc.fields.forEach(field => {
      modelData[field.name] = SQLiteDriver.parse(field.type, data[field.name] || field.defaultValue || '');
    });

    return new model(modelData);
  }

  async create(resource: typeof Resource): Promise<void> {
    const desc = Resource.describe(resource);
    const { name } = desc;
    const fields = desc.fields as TableColumn[];
    const names = fields.map(f => `${f.name} ${f.type === Number || f.type === Boolean ? 'INTEGER' : 'TEXT'}` + (f.notNull && ' NOT NULL' || ''));
    const unique = fields.filter((field) => field.unique).map(f => f.name);
    const primary = fields.filter(field => field.primary && field.type === Number);

    return new Promise((resolve, reject) => {
      if (!primary.length) {
        return reject(new Error('Invalid primary key. It has to be of type Number'));
      }

      const sql = [
        `CREATE TABLE IF NOT EXISTS ${name} (`,
        names.join(', '),
        (unique.length ? ', UNIQUE(' + unique.join(',') + ')' : ''),
        ', PRIMARY KEY(' + primary[0].name + ')',
        ')'
      ].join('');
      Logger.debug(sql);

      try {
        const s = this.db.prepare(sql);
        s.run([]);
        resolve(undefined);
      } catch (error) {
        return reject(new Error(`Cannot create table "${name}"`));
      }
    });
  }
}
