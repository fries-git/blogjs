const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const CHAR_LIMIT = 500;
const COOLDOWN_MS = 15 * 60 * 1000;
const lastPost = {};

app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

// hash password
async function hashPassword(pw) {
  return bcrypt.hash(pw, 10);
}
async function checkPassword(pw, hash) {
  return bcrypt.compare(pw, hash);
}

// signup
app.post('/signup', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing fields' });

  const { data: exists } = await supabase.from('users').select().eq('username', username).maybeSingle();
  if (exists) return res.status(400).json({ error: 'user exists' });

  const pwHash = await hashPassword(password);
  await supabase.from('users').insert([{ username, password_hash: pwHash }]);

  res.cookie('user', username, { httpOnly: true });
  res.json({ status: 'ok' });
});

// login
app.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const { data: user } = await supabase.from('users').select().eq('username', username).maybeSingle();
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const ok = await checkPassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid credentials' });

  res.cookie('user', username, { httpOnly: true });
  res.json({ status: 'ok' });
});

// logout
app.post('/logout', (req, res) => {
  res.clearCookie('user');
  res.json({ status: 'ok' });
});

// me
app.get('/me', (req, res) => {
  res.json({ user: req.cookies.user || null });
});

// get posts
app.get('/posts', async (req, res) => {
  const { data: posts } = await supabase
    .from('posts')
    .select()
    .order('timestamp', { ascending: false });
  res.json(posts || []);
});

// new post
app.post('/posts', async (req, res) => {
  const username = req.cookies.user;
  if (!username) return res.status(401).json({ error: 'not logged in' });

  const { content } = req.body || {};
  if (!content || content.length > CHAR_LIMIT) return res.status(400).json({ error: 'too long or empty' });

  const now = Date.now();
  if (username !== 'fries') {
    const last = lastPost[username] || 0;
    if (now - last < COOLDOWN_MS) {
      return res.status(429).json({ error: 'cooldown active' });
    }
  }

  const { data, error } = await supabase.from('posts').insert([{ author: username, content }]).select().single();
  if (error) return res.status(500).json({ error: error.message });

  lastPost[username] = now;
  res.json({ post: data });
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
