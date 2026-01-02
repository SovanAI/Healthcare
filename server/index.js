const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./db');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

const app = express();
// Allow requests from any origin during development to avoid CORS issues.
// In production, restrict this to your known frontend origin(s).
app.use(cors());
app.use(express.json());

// Basic request logging for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

app.post('/upload', upload.single('image'), async (req, res) => {
  if (!req.file) {
    console.warn('Upload attempted with no file');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const file = req.file;
  console.log(`Upload received: ${file.originalname} (${file.mimetype}, ${file.size} bytes) -> ${file.path}`);

  try {
    const id = await db.insertImage({
      filename: file.filename,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: file.path,
    });
    res.json({ success: true, id });
  } catch (err) {
    console.error('Error inserting image into DB:', err && err.message ? err.message : err);
    // Return the error message in development for easier debugging
    res.status(500).json({ error: err && err.message ? err.message : 'Internal server error' });
  }
});

app.get('/images/:id', async (req, res) => {
  try {
    const row = await db.getImage(req.params.id);
    if (!row) return res.status(404).json({ error: 'Image not found' });
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/uploads', express.static(UPLOAD_DIR));

// Global error handler to surface multer/other errors as JSON
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err && err.message ? err.message : err);
  res.status(500).json({ error: err && err.message ? err.message : 'Internal server error' });
});

// Use port 3003 by default per project configuration (can be overridden via PORT env var)
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
