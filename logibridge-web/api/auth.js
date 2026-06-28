// Simple in-memory auth API for Vercel Serverless
const users = new Map();

module.exports = async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  
  if (req.method === 'POST' && pathname === '/api/auth/register') {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ detail: 'Missing fields' });
    }
    if (password.length < 6) {
      return res.status(400).json({ detail: 'Password too short' });
    }
    if (users.has(email.toLowerCase())) {
      return res.status(409).json({ detail: 'Email already registered' });
    }
    const user = {
      id: Math.random().toString(36).slice(2, 14),
      email: email.toLowerCase(),
      name,
      createdAt: new Date().toISOString(),
      password,
    };
    users.set(email.toLowerCase(), user);
    return res.status(201).json({
      access_token: 'tok_' + user.id,
      token_type: 'bearer',
      user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    });
  }
  
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    const { email, password } = req.body;
    const user = users.get(email?.toLowerCase());
    if (!user || user.password !== password) {
      return res.status(401).json({ detail: 'Invalid credentials' });
    }
    return res.status(200).json({
      access_token: 'tok_' + user.id,
      token_type: 'bearer',
      user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt },
    });
  }

  res.status(404).json({ detail: 'Not found' });
};
