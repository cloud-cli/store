import sqlite3 from 'sqlite3';
import type { TableColumn } from './resource.js';
import { Query, Resource, ResourceDriver } from './resource.js';


export class SQLiteDriver extends ResourceDriver {
  readonly db: sqlite3.Database;

  /* istanbul ignore next */
  constructor(path = process.cwd() + 'cloud.db') {
    super();
    this.db = new sqlite3.Database(path);
  }

  async save<T extends Resource>(model: T) {
    const resource = Object.getPrototypeOf(model).constructor;
    const desc = Resource.describe(resource);
    const fields = desc.fields.filter(field => !field.primary);
    const columns = fields.map(f => f.name);
    const values = Array(columns.length).fill('?').join(',');
    const row = fields.map(field => {
      let value = model[field.name] || field.defaultValue || '';
      if (field.type === Number) {
        value = Number(value);
      }

      if (field.type === Object) {
        value = JSON.stringify(value);
      }

      return value;
    });

    return new Promise<number>((resolve, reject) => {
      this.db
        .prepare(`INSERT INTO ${desc.name} (${columns}) VALUES (${values})`)
        .run(row, (error: any) => {
          if (error) {
            return reject(new Error('Cannot store item: ' + error.message));
          }

          this.db.all('SELECT last_insert_rowid() as id', (_error, rows: any[]) => {
            resolve(rows[0].id);
          });
        });
    });
  }

  async remove<T extends Resource>(model: T): Promise<void> {
    const resource = Object.getPrototypeOf(model).constructor;
    const desc = Resource.describe(resource);

    return new Promise((resolve, reject) => {
      const primary = desc.fields.find(field => field.primary);
      const query = `DELETE FROM ${desc.name} WHERE ${primary.name} = ?`;

      this.db
        .prepare(query)
        .run([model[primary.name]], (error) => {
          if (error) {
            return reject(new Error('Unable to remove: ' + error.message));
          }
          resolve();
        });
    });
  }

  async find<T extends Resource>(model: T): Promise<T> {
    const Model = Object.getPrototypeOf(model).constructor;
    const desc = Resource.describe(Model);
    const columns = desc.fields.map(f => f.name);
    const primary = desc.fields.find(field => field.primary);
    const id = model[primary.name];

    return new Promise<T>((resolve, reject) => {
      this.db
        .prepare(`SELECT ${columns} FROM ${desc.name} WHERE ${primary.name} = ? LIMIT 1`)
        .all([id], (error, lines) => {
          if (!lines.length) {
            error = new Error('Not found');
          }

          if (error) {
            reject(error);
            return
          }

          const found = this.createModel(Model, lines[0]) as T;
          resolve(found);
        });
    });
  }

  async findAll<M extends Resource>(
    resource: typeof Resource,
    query: Query<M>,
  ): Promise<M[]> {
    const desc = Resource.describe(resource);
    const columns = desc.fields.map(f => f.name);
    const conditions = query.toJSON();
    const where = conditions.map(([field, operator]) => `${field} ${operator} ?`);
    const args = conditions.map(c => c[2]);
    const queryStr = `SELECT ${columns} FROM ${desc.name}${where.length ? ' WHERE ' + where.join(' AND ') : ''}`;

    return new Promise((resolve, reject) => {
      this.db.prepare(queryStr)
        .all(args, (error, value) => {
          if (error) {
            return reject(error);
          }

          resolve(value.map(data => this.createModel(resource, data)) as M[]);
        });
    });
  }

  private createModel(model: typeof Resource, data: any) {
    const desc = Resource.describe(model);
    const modelData = {};
    desc.fields.forEach(field => {
      let value = data[field.name];

      if (field.type === Number) {
        value = Number(value);
      }

      if (field.type === Object) {
        value = JSON.parse(value);
      }

      modelData[field.name] = value;
    });

    return new model(modelData);
  }

  async create(resource: typeof Resource): Promise<void> {
    const desc = Resource.describe(resource);
    const { name } = desc;
    const fields = desc.fields as TableColumn[];
    const names = fields.map(f => `${f.name} ${f.type === Number ? 'INTEGER' : 'TEXT'}` + (f.notNull && ' NOT NULL' || ''));
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

      this.db.serialize(() =>
        this.db.run(sql, (error) => {
          if (error) {
            return reject(new Error(`Cannot create table "${name}"`));
          }

          resolve(undefined);
        }),
      );
    });
  }
}
