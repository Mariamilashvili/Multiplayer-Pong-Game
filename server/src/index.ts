import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 10;
const PADDLE_SPEED = 5;
const BALL_SPEED = 4;

// Game state interface
interface GameState {
  ball: {
    x: number;
    y: number;
    dx: number;
    dy: number;
  };
  paddles: {
    left: {
      y: number;
      playerId: string | null;
    };
    right: {
      y: number;
      playerId: string | null;
    };
  };
  score: {
    left: number;
    right: number;
  };
  gameActive: boolean;
  players: string[];
}

// Room management
interface Room {
  id: string;
  gameState: GameState;
  gameLoop?: NodeJS.Timeout;
}

const rooms = new Map<string, Room>();
const playerRooms = new Map<string, string>();

// Initialize game state
function createGameState(): GameState {
  return {
    ball: {
      x: GAME_WIDTH / 2,
      y: GAME_HEIGHT / 2,
      dx: Math.random() > 0.5 ? BALL_SPEED : -BALL_SPEED,
      dy: Math.random() > 0.5 ? BALL_SPEED : -BALL_SPEED
    },
    paddles: {
      left: {
        y: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
        playerId: null
      },
      right: {
        y: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
        playerId: null
      }
    },
    score: {
      left: 0,
      right: 0
    },
    gameActive: false,
    players: []
  };
}

// Game physics and collision detection
function updateBall(gameState: GameState): void {
  const { ball, paddles, score } = gameState;
  
  // Move ball
  ball.x += ball.dx;
  ball.y += ball.dy;
  
  // Ball collision with top/bottom walls
  if (ball.y <= 0 || ball.y >= GAME_HEIGHT - BALL_SIZE) {
    ball.dy = -ball.dy;
  }
  
  // Ball collision with paddles
  // Left paddle
  if (ball.x <= PADDLE_WIDTH && 
      ball.y >= paddles.left.y && 
      ball.y <= paddles.left.y + PADDLE_HEIGHT) {
    ball.dx = Math.abs(ball.dx);
    // Add some angle based on where ball hits paddle
    const hitPos = (ball.y - paddles.left.y) / PADDLE_HEIGHT;
    ball.dy = (hitPos - 0.5) * BALL_SPEED * 2;
  }
  
  // Right paddle
  if (ball.x >= GAME_WIDTH - PADDLE_WIDTH - BALL_SIZE && 
      ball.y >= paddles.right.y && 
      ball.y <= paddles.right.y + PADDLE_HEIGHT) {
    ball.dx = -Math.abs(ball.dx);
    // Add some angle based on where ball hits paddle
    const hitPos = (ball.y - paddles.right.y) / PADDLE_HEIGHT;
    ball.dy = (hitPos - 0.5) * BALL_SPEED * 2;
  }
  
  // Ball goes out of bounds - scoring
  if (ball.x < 0) {
    score.right++;
    resetBall(gameState);
  } else if (ball.x > GAME_WIDTH) {
    score.left++;
    resetBall(gameState);
  }
}

function resetBall(gameState: GameState): void {
  gameState.ball.x = GAME_WIDTH / 2;
  gameState.ball.y = GAME_HEIGHT / 2;
  gameState.ball.dx = Math.random() > 0.5 ? BALL_SPEED : -BALL_SPEED;
  gameState.ball.dy = Math.random() > 0.5 ? BALL_SPEED : -BALL_SPEED;
}

function startGameLoop(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  
  room.gameLoop = setInterval(() => {
    updateBall(room.gameState);
    
    // Emit updated game state to all players in room
    io.to(roomId).emit('gameState', room.gameState);
  }, 1000 / 60); // 60 FPS
}

function stopGameLoop(roomId: string): void {
  const room = rooms.get(roomId);
  if (room && room.gameLoop) {
    clearInterval(room.gameLoop);
    room.gameLoop = undefined;
  }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);
  
  // Join game room
  socket.on('joinGame', () => {
    let roomId = 'room1'; // Simple room assignment - you can make this more complex
    let room = rooms.get(roomId);
    
    if (!room) {
      room = {
        id: roomId,
        gameState: createGameState()
      };
      rooms.set(roomId, room);
    }
    
    // Add player to room
    socket.join(roomId);
    playerRooms.set(socket.id, roomId);
    room.gameState.players.push(socket.id);
    
    // Assign paddle
    if (!room.gameState.paddles.left.playerId) {
      room.gameState.paddles.left.playerId = socket.id;
      socket.emit('paddleAssignment', 'left');
    } else if (!room.gameState.paddles.right.playerId) {
      room.gameState.paddles.right.playerId = socket.id;
      socket.emit('paddleAssignment', 'right');
    }
    
    // Start game if we have 2 players
    if (room.gameState.players.length === 2) {
      room.gameState.gameActive = true;
      startGameLoop(roomId);
      io.to(roomId).emit('gameStart');
    }
    
    // Send initial game state
    socket.emit('gameState', room.gameState);
    
    console.log(`Player ${socket.id} joined room ${roomId}. Players: ${room.gameState.players.length}`);
  });
  
  // Handle paddle movement
  socket.on('paddleMove', (direction: 'up' | 'down') => {
    const roomId = playerRooms.get(socket.id);
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (!room) return;
    
    const { paddles } = room.gameState;
    let paddle = null;
    
    if (paddles.left.playerId === socket.id) {
      paddle = paddles.left;
    } else if (paddles.right.playerId === socket.id) {
      paddle = paddles.right;
    }
    
    if (paddle) {
      if (direction === 'up' && paddle.y > 0) {
        paddle.y = Math.max(0, paddle.y - PADDLE_SPEED);
      } else if (direction === 'down' && paddle.y < GAME_HEIGHT - PADDLE_HEIGHT) {
        paddle.y = Math.min(GAME_HEIGHT - PADDLE_HEIGHT, paddle.y + PADDLE_SPEED);
      }
      
      // Emit paddle update immediately for responsiveness
      io.to(roomId).emit('paddleUpdate', { 
        side: paddles.left.playerId === socket.id ? 'left' : 'right',
        y: paddle.y 
      });
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);
    
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        // Remove player from game state
        room.gameState.players = room.gameState.players.filter(id => id !== socket.id);
        
        // Reset paddle assignments
        if (room.gameState.paddles.left.playerId === socket.id) {
          room.gameState.paddles.left.playerId = null;
        }
        if (room.gameState.paddles.right.playerId === socket.id) {
          room.gameState.paddles.right.playerId = null;
        }
        
        // Stop game if no players left
        if (room.gameState.players.length === 0) {
          stopGameLoop(roomId);
          rooms.delete(roomId);
        } else {
          room.gameState.gameActive = false;
          stopGameLoop(roomId);
          io.to(roomId).emit('playerDisconnected');
        }
      }
      
      playerRooms.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});