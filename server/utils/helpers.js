const jwt = require('jsonwebtoken');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

const paginate = (query, page = 1, limit = 10) => {
  const skip = (parseInt(page) - 1) * parseInt(limit);
  return query.skip(skip).limit(parseInt(limit));
};

const buildFilter = (filters) => {
  const filter = {};
  if (filters.search) {
    filter.$or = [
      { name: { $regex: filters.search, $options: 'i' } },
      { email: { $regex: filters.search, $options: 'i' } }
    ];
  }
  if (filters.status) filter.isActive = filters.status === 'active';
  if (filters.role) filter.role = filters.role;
  return filter;
};

module.exports = { generateToken, paginate, buildFilter };
