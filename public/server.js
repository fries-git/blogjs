const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

const postsFile = path.join(__dirname, 'posts.json');
const usersFile = path.join(__dirname, 'users.json');

app.use(express.json());
app.use(cookieParser());
app.use(express.static(__dirname));

function hashPassword(pw) {
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function getUsers() {
  if (!fs.existsSync(usersFile)) return [];
  return JSON.parse(fs.readFileSync(usersFile));
}

function saveUsers(users) {
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function getPosts() {
  if (!fs.existsSync(postsFile)) return [];
  return JSON.parse(fs.readFileSync(postsFile));
}

function savePosts(posts) {
  fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2));
}

app.post('/signup', (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: "User exists" });
  }
  users.push({ username, password: hashPassword(password) });
  saveUsers(users);
  res.cookie('user', username, { httpOnly: true });
  res.json({ status: 'signed up' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const users = getUsers();
  const user = users.find(u => u.username === username && u.password === hashPassword(password));
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  res.cookie('user', username, { httpOnly: true });
  res.json({ status: 'logged in' });
});

app.get('/posts', (req, res) => {
  res.json(getPosts());
});

app.post('/posts', (req, res) => {
  const user = req.cookies.user;
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const posts = getPosts();
  posts.push({
    author: req.body.author,
    content: req.body.content,
    timestamp: new Date().toISOString(),
    user
  });
  savePosts(posts);
  res.json({ status: 'ok' });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
