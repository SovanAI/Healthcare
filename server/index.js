const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const db = require('./db');

// Load .env into process.env (OPENAI_API_KEY, USE_EXTERNAL_LLM, PORT, etc.)
try {
  require('dotenv').config();
} catch (e) {
  // dotenv is optional in environments where env vars are already provided
  console.warn('dotenv not loaded (it may not be installed)');
}

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

// Return chats for a given image id
app.get('/chats', async (req, res) => {
  const imageId = req.query.imageId;
  if (!imageId) return res.status(400).json({ error: 'imageId query param required' });
  try {
    const chats = await db.getChatsByImage(imageId);
    res.json(chats);
  } catch (err) {
    console.error('Failed to fetch chats:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: call external LLM (OpenAI) if configured
async function callExternalLLM(message, image) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  // system prompt restricts scope to food/nutrition/ingredients/health
  const systemPrompt = `You are an assistant that only answers user questions about food, ingredients, nutrition, and general health-related food guidance (e.g., sugar, allergens, diet suitability). Do NOT provide medical diagnoses, professional medical advice, or answer questions outside this domain. If the user asks about unrelated topics, reply briefly that you can only help with food and health related questions.`;

  const context = image ? `Uploaded product: ${image.originalname} (mime: ${image.mimetype}, size: ${image.size} bytes).` : 'No uploaded product context.';

  const userPrompt = `${context}\nUser question: ${message}`;

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 400,
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`LLM request failed: ${resp.status} ${resp.statusText} - ${txt}`);
  }

  const j = await resp.json();
  const content = j?.choices?.[0]?.message?.content?.trim();
  return content;
}

// Simple chat endpoint: record user message and return a bot reply (and persist it)
app.post('/chat', async (req, res) => {
  const { message, imageId } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message required' });

  try {
    // insert user message
    await db.insertChat({ imageId: imageId || null, role: 'user', text: message });

    let reply = null;

    // If configured, call the external LLM for a reply
    if (process.env.USE_EXTERNAL_LLM === 'true' || process.env.USE_EXTERNAL_LLM === '1') {
      try {
        const img = imageId ? await db.getImage(imageId) : null;
        const llmResp = await callExternalLLM(message, img);

        // Basic domain filter: ensure the reply mentions a food/health keyword, otherwise refuse
        const allowedKeywords = ['food','nutrition','ingredient','sugar','fat','calories','allergen','vitamin','protein','carb','sodium','cholesterol','diet','health','allergy','ingredient'];
        const lc = (llmResp || '').toLowerCase();
        if (!allowedKeywords.some(k => lc.includes(k))) {
          reply = 'I can only answer food and health related questions — please ask a question about ingredients, nutrition, or dietary concerns.';
        } else {
          reply = llmResp;
        }
      } catch (err) {
        console.error('LLM error:', err && err.message ? err.message : err);
        reply = 'Sorry, I could not reach the external assistant; I can still help with basic food-related answers.';
      }
    }

    // Fallback simple reply when LLM disabled
    if (!reply) {
      reply = `Thanks — I received your message: "${message}".`;
      if (imageId) {
        const img = await db.getImage(imageId);
        if (img) {
          reply = `I reviewed the uploaded image (${img.originalname}). ${reply}`;
        } else {
          reply = `I couldn't find the uploaded image, but ${reply}`;
        }
      }
    }

    // insert bot reply
    await db.insertChat({ imageId: imageId || null, role: 'bot', text: reply });

    res.json({ success: true, reply });
  } catch (err) {
    console.error('Chat handling error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health endpoint: reports basic server status and LLM configuration (no secrets)
app.get('/health', (req, res) => {
  const llmEnabled = process.env.USE_EXTERNAL_LLM === 'true' || process.env.USE_EXTERNAL_LLM === '1';
  const llmConfigured = !!process.env.OPENAI_API_KEY;
  res.json({
    ok: true,
    llmEnabled,
    llmConfigured,
    preferredPorts,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// Diagnostic endpoint to test external LLM connectivity and configuration
app.get('/llm-test', async (req, res) => {
  const llmEnabled = process.env.USE_EXTERNAL_LLM === 'true' || process.env.USE_EXTERNAL_LLM === '1';
  const apiKey = process.env.OPENAI_API_KEY;
  if (!llmEnabled) return res.status(400).json({ error: 'LLM is disabled. Set USE_EXTERNAL_LLM=true to enable.' });
  if (!apiKey) return res.status(400).json({ error: 'OPENAI_API_KEY is not configured.' });

  try {
    const reply = await callExternalLLM('Is this product high in added sugars? Answer briefly using food/health terms only.', null);
    res.json({ ok: true, reply });
  } catch (err) {
    console.error('LLM test error:', err && err.message ? err.message : err);
    res.status(500).json({ error: err && err.message ? err.message : 'LLM test failed' });
  }
});

app.use('/uploads', express.static(UPLOAD_DIR));

// Global error handler to surface multer/other errors as JSON
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err && err.message ? err.message : err);
  res.status(500).json({ error: err && err.message ? err.message : 'Internal server error' });
});

// Attempt to bind to an available port from a preferred list (env PORT, 3000, 3002, 4000).
// By default we prefer port 3000 as requested; if it's in use we'll fall back to 3002 or 4000.
const preferredPorts = [process.env.PORT ? Number(process.env.PORT) : null, 3000, 3002, 4000].filter(Boolean);

(async function startServer() {
  for (const port of preferredPorts) {
    try {
      await new Promise((resolve, reject) => {
        const server = app.listen(port)
          .on('listening', () => {
            console.log(`Server listening on ${port}`);
            resolve(server);
          })
          .on('error', (err) => reject(err));
      });
      // If we've started successfully, break out of the loop
      break;
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`Port ${port} in use, trying next port...`);
        continue;
      }
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  }
})();
