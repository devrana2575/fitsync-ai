const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const socketsByUser = new Map();
let io = null;

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Unauthorized'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (!user || !user.isActive) return next(new Error('Unauthorized'));
      socket.userId = String(user._id);
      next();
    } catch (error) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
    socketsByUser.get(userId).add(socket.id);

    socket.on('disconnect', () => {
      const set = socketsByUser.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) socketsByUser.delete(userId);
      }
    });
  });

  return io;
};

const emitToUser = (userId, event, data) => {
  if (!userId || !io) return false;
  const set = socketsByUser.get(String(userId));
  if (!set) return false;
  for (const socketId of set) {
    io.to(socketId).emit(event, data);
  }
  return set.size > 0;
};

module.exports = { initSocket, emitToUser };