// server.js
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs'); // bcryptjs avoids native build failures
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(express.json());
app.use(cookieParser());

// serve static frontend from /public
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// config
const CHAR_LIMIT = 500;
const COOLDOWN_MS = 15 * 60 * 1000;
const EXEMPT_USERNAME = 'fries';
const BCRYPT_ROUNDS = 10;

// helpers
async function findUser(username) {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, password_hash')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getLatestPostTimestamp(username) {
  const { data, error } = await supabase
    .from('posts')
    .select('timestamp')
    .eq('author', username)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? new Date(data.timestamp).getTime() : null;
}

// auth routes
app.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username+password required' });

    const existing = await findUser(username);
    if (existing) return res.status(400).json({ error: 'user exists' });

    const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password_hash: hash }])
      .select('username')
      .maybeSingle();

    if (error) throw error;
    res.cookie('user', data.username, { httpOnly: true, sameSite: 'lax' });
    return res.json({ status: 'ok', user: data.username });
  } catch (err) {
    console.error('signup error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username+password required' });

    const user = await findUser(username);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = bcrypt.compareSync(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    res.cookie('user', user.username, { httpOnly: true, sameSite: 'lax' });
    return res.json({ status: 'ok', user: user.username });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.post('/logout', (req, res) => {
  res.clearCookie('user');
  res.json({ status: 'ok' });
});

// validate cookie and return user
app.get('/me', async (req, res) => {
  try {
    const username = req.cookies.user || null;
    if (!username) return res.json({ user: null });

    const user = await findUser(username);
    if (!user) {
      res.clearCookie('user');
      return res.json({ user: null });
    }
    return res.json({ user: user.username });
  } catch (err) {
    console.error('me error', err);
    return res.json({ user: null });
  }
});

// posts
app.get('/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, author, content, timestamp')
      .order('timestamp', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('get posts error', err);
    return res.status(500).json([]);
  }
});

app.post('/posts', async (req, res) => {
  try {
    const username = req.cookies.user;
    if (!username) return res.status(401).json({ error: 'not logged in' });

    const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
    if (!content) return res.status(400).json({ error: 'content required' });
    if (content.length > CHAR_LIMIT) return res.status(400).json({ error: `content > ${CHAR_LIMIT} chars` });

    if (username !== EXEMPT_USERNAME) {
      const lastTs = await getLatestPostTimestamp(username);
      if (lastTs !== null) {
        const now = Date.now();
        if (now - lastTs < COOLDOWN_MS) {
          const left = Math.ceil((COOLDOWN_MS - (now - lastTs)) / 1000);
          return res.status(429).json({ error: `cooldown active ${left}s` });
        }
      }
    }

    const { data, error } = await supabase
      .from('posts')
      .insert([{ author: username, content }])
      .select('id, author, content, timestamp')
      .maybeSingle();

    if (error) throw error;
    return res.json({ post: data });
  } catch (err) {
    console.error('create post error', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// fallback for unknown routes (serve index for SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`server.js running on ${PORT}`));
