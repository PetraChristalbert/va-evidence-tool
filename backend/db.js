const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'jobs.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      vet_name TEXT,
      va_file_number TEXT,
      conditions TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

const getJob = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM jobs WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else {
        if (row && row.conditions) {
          row.conditions = JSON.parse(row.conditions);
        }
        resolve(row);
      }
    });
  });
};

const createJob = (id, vet_name, va_file_number, conditions) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO jobs (id, vet_name, va_file_number, conditions, status) VALUES (?, ?, ?, ?, ?)',
      [id, vet_name, va_file_number, JSON.stringify(conditions), 'parsed'],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
};

const updateJobStatus = (id, status) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, id],
      function (err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
};

module.exports = {
  db,
  getJob,
  createJob,
  updateJobStatus
};
