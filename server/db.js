const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT,
      originalname TEXT,
      mimetype TEXT,
      size INTEGER,
      path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function insertImage({ filename, originalname, mimetype, size, path: filePath }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO images (filename, originalname, mimetype, size, path) VALUES (?, ?, ?, ?, ?)`,
      [filename, originalname, mimetype, size, filePath],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function getImage(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM images WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

module.exports = { insertImage, getImage };
