const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["https://sirmemecord.vercel.app/", "https://sircord-backend.onrender.com"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: ["https://sirmemecord.vercel.app/", "https://sircord-backend.onrender.com"],
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

// Store users and messages in memory (for a real app, use a database)
const users = {};
const channels = {
  "general": {
    name: "general",
    messages: []
  },
  "random": {
    name: "random",
    messages: []
  }
};

// Routes
app.get('/', (req, res) => {
  res.send('Sircord API is running');
});

app.get('/api/channels', (req, res) => {
  res.json(Object.keys(channels));
});

app.get('/api/channels/:channelId/messages', (req, res) => {
  const channelId = req.params.channelId;
  if (channels[channelId]) {
    res.json(channels[channelId].messages);
  } else {
    res.status(404).json({ error: 'Channel not found' });
  }
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Handle user joining
  socket.on('join', ({ username, channel }) => {
    users[socket.id] = { username, channel };
    socket.join(channel);
    
    // Notify channel of new user
    socket.to(channel).emit('message', {
      username: 'System',
      text: `${username} has joined the channel`,
      timestamp: new Date().toISOString()
    });
    
    // Send user list to all clients in the channel
    const channelUsers = Object.values(users).filter(user => user.channel === channel);
    io.to(channel).emit('userList', channelUsers);
  });
  
  // Handle new messages
  socket.on('message', (messageData) => {
    const user = users[socket.id];
    if (!user) return;
    
    const message = {
      id: Date.now().toString(),
      username: user.username,
      text: messageData.text,
      timestamp: new Date().toISOString()
    };
    
    // Store message in memory
    if (channels[user.channel]) {
      channels[user.channel].messages.push(message);
      // Limit messages kept in memory
      if (channels[user.channel].messages.length > 100) {
        channels[user.channel].messages.shift();
      }
    }
    
    // Broadcast message to all users in the channel
    io.to(user.channel).emit('message', message);
  });
  
  // Handle channel switching
  socket.on('switchChannel', (newChannel) => {
    const user = users[socket.id];
    if (!user) return;
    
    // Leave current channel
    socket.leave(user.channel);
    
    // Join new channel
    user.channel = newChannel;
    socket.join(newChannel);
    
    // Notify channel of new user
    socket.to(newChannel).emit('message', {
      username: 'System',
      text: `${user.username} has joined the channel`,
      timestamp: new Date().toISOString()
    });
    
    // Send updated user list
    const channelUsers = Object.values(users).filter(u => u.channel === newChannel);
    io.to(newChannel).emit('userList', channelUsers);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      // Notify channel that user has left
      socket.to(user.channel).emit('message', {
        username: 'System',
        text: `${user.username} has left the channel`,
        timestamp: new Date().toISOString()
      });
      
      // Remove user from users object
      delete users[socket.id];
      
      // Send updated user list
      const channelUsers = Object.values(users).filter(u => u.channel === user.channel);
      io.to(user.channel).emit('userList', channelUsers);
    }
  });
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
