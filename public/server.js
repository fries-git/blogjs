// blog.js
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 3000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname)); // serve index.html etc.

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

// endpoints

// signup
app.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username+password required' });

    const existing = await findUser(username);
    if (existing) return res.status(400).json({ error: 'user exists' });

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const { data, error } = await supabase
      .from('users')
      .insert([{ username, password_hash: hash }])
      .select('username')
      .maybeSingle();

    if (error) throw error;
    res.cookie('user', data.username, { httpOnly: true, sameSite: 'lax' });
    return res.json({ status: 'ok', user: data.username });
  } catch (err) {
    console.error('signup', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// login
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username+password required' });

    const user = await findUser(username);
    if (!user) return res.status(401).json({ error: 'invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });

    res.cookie('user', user.username, { httpOnly: true, sameSite: 'lax' });
    return res.json({ status: 'ok', user: user.username });
  } catch (err) {
    console.error('login', err);
    return res.status(500).json({ error: 'server error' });
  }
});

// logout
app.post('/logout', (req, res) => {
  res.clearCookie('user');
  res.json({ status: 'ok' });
});

// me (validates cookie against DB)
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
    console.error('me', err);
    return res.json({ user: null });
  }
});

// get posts (newest-first)
app.get('/posts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, author, content, timestamp')
      .order('timestamp', { ascending: false });
    if (error) throw error;
    return res.json(data || []);
  } catch (err) {
    console.error('get posts', err);
    return res.status(500).json([]);
  }
});

// create post (enforce char limit and cooldown)
app.post('/posts', async (req, res) => {
  try {
    const username = req.cookies.user;
    if (!username) return res.status(401).json({ error: 'not logged in' });

    const content = (req.body && typeof req.body.content === 'string') ? req.body.content.trim() : '';
    if (!content) return res.status(400).json({ error: 'content required' });
    if (content.length > CHAR_LIMIT) return res.status(400).json({ error: `content > ${CHAR_LIMIT} chars` });

    // cooldown: check latest post timestamp for this user
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
    console.error('create post', err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.listen(PORT, () => console.log(`blog.js running on ${PORT}`));
