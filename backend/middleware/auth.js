const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // Accept token from httpOnly cookie or Authorization header
  let token = req.cookies?.pp_token;

  if (!token) {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      token = header.split(' ')[1];
    }
  }

  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.admin = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie('pp_token');
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
