const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const postsFile = path.join(__dirname, 'posts.json');

app.use(express.json());
app.use(express.static(__dirname));

app.get('/posts', (req, res) => {
  if (!fs.existsSync(postsFile)) return res.json([]);
  const posts = JSON.parse(fs.readFileSync(postsFile));
  res.json(posts);
});

app.post('/posts', (req, res) => {
  let posts = [];
  if (fs.existsSync(postsFile)) {
    posts = JSON.parse(fs.readFileSync(postsFile));
  }
  posts.push({
    author: req.body.author,
    content: req.body.content,
    timestamp: new Date().toISOString()
  });
  fs.writeFileSync(postsFile, JSON.stringify(posts, null, 2));
  res.json({status: 'ok'});
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
