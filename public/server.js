const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = __dirname;
const postsFile = path.join(DATA_DIR, 'posts.json');
const usersFile = path.join(DATA_DIR, 'users.json');
const uploadsDir = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(DATA_DIR));
app.use('/uploads', express.static(uploadsDir));

// simple sha256 for demo (not as secure as bcrypt)
function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}
function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file)); }
  catch { return []; }
}
function writeJSON(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = Date.now() + '-' + Math.random().toString(36).slice(2) + ext;
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB limit

// auth
app.post('/signup', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username+password required' });
  const users = readJSON(usersFile);
  if (users.find(u => u.username === username)) return res.status(400).json({ error: 'user exists' });
  users.push({ username, password: hashPassword(password) });
  writeJSON(usersFile, users);
  res.cookie('user', username, { httpOnly: true });
  res.json({ status: 'ok' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username+password required' });
  const users = readJSON(usersFile);
  const user = users.find(u => u.username === username && u.password === hashPassword(password));
  if (!user) return res.status(401).json({ error: 'invalid credentials' });
  res.cookie('user', username, { httpOnly: true });
  res.json({ status: 'ok' });
});

app.post('/logout', (req, res) => {
  res.clearCookie('user');
  res.json({ status: 'ok' });
});

app.get('/me', (req, res) => {
  const user = req.cookies.user || null;
  res.json({ user });
});

// posts
app.get('/posts', (req, res) => {
  const posts = readJSON(postsFile);
  res.json(posts);
});

// Accept multipart/form-data with optional "image" file and "content" field
app.post('/posts', upload.single('image'), (req, res) => {
  const username = req.cookies.user;
  if (!username) {
    // cleanup uploaded file if any
    if (req.file) fs.unlinkSync(req.file.path);
    return res.status(401).json({ error: 'not logged in' });
  }

  const content = req.body.content || '';
  const posts = readJSON(postsFile);

  const post = {
    author: username,
    content,
    timestamp: new Date().toISOString(),
    image: req.file ? ('/uploads/' + req.file.filename) : null
  };

  posts.unshift(post); // newest first
  writeJSON(postsFile, posts);
  res.json({ status: 'ok', post });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
