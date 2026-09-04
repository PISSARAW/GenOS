class BaseRepository {
  constructor(db, table) {
    this.db = db;
    this.table = table;
  }

  async findById(id) {
    return this.db.get(`SELECT * FROM ${this.table} WHERE id = ?`, id);
  }

  async findAll() {
    return this.db.all(`SELECT * FROM ${this.table}`);
  }

  async create(data) {
    const keys = Object.keys(data);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders})`;
    
    const result = await this.db.run(sql, ...Object.values(data));
    return result.lastID;
  }

  async update(id, data) {
    const keys = Object.keys(data);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const sql = `UPDATE ${this.table} SET ${setClause} WHERE id = ?`;
    
    await this.db.run(sql, ...Object.values(data), id);
  }

  async delete(id) {
    await this.db.run(`DELETE FROM ${this.table} WHERE id = ?`, id);
  }
}

module.exports = BaseRepository;
