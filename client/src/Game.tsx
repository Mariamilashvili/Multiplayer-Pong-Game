import React, { useEffect, useRef, useState, useCallback } from 'react';
import io, { Socket } from 'socket.io-client';

// Game constants (should match server)
const GAME_WIDTH = 800;
const GAME_HEIGHT = 400;
const PADDLE_WIDTH = 10;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 10;

// Interfaces
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

interface PaddleUpdate {
  side: 'left' | 'right';
  y: number;
}

const PongGame: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const keysPressed = useRef<Set<string>>(new Set());
  
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPaddle, setMyPaddle] = useState<'left' | 'right' | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const [gameStatus, setGameStatus] = useState<string>('Waiting for players...');

  // Initialize socket connection
  useEffect(() => {
    socketRef.current = io('http://localhost:3001');
    
    socketRef.current.on('connect', () => {
      setConnectionStatus('Connected');
      socketRef.current?.emit('joinGame');
    });
    
    socketRef.current.on('disconnect', () => {
      setConnectionStatus('Disconnected');
    });
    
    socketRef.current.on('paddleAssignment', (side: 'left' | 'right') => {
      setMyPaddle(side);
      setGameStatus(`You are the ${side} paddle`);
    });
    
    socketRef.current.on('gameState', (state: GameState) => {
      setGameState(state);
    });
    
    socketRef.current.on('paddleUpdate', (update: PaddleUpdate) => {
      setGameState(prevState => {
        if (!prevState) return prevState;
        return {
          ...prevState,
          paddles: {
            ...prevState.paddles,
            [update.side]: {
              ...prevState.paddles[update.side],
              y: update.y
            }
          }
        };
      });
    });
    
    socketRef.current.on('gameStart', () => {
      setGameStatus('Game Started!');
    });
    
    socketRef.current.on('playerDisconnected', () => {
      setGameStatus('Player disconnected. Waiting for players...');
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Handle keyboard input
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    keysPressed.current.add(event.key);
  }, []);

  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    keysPressed.current.delete(event.key);
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  // Send paddle movement to server
  useEffect(() => {
    const interval = setInterval(() => {
      if (!socketRef.current || !myPaddle) return;
      
      if (keysPressed.current.has('ArrowUp') || keysPressed.current.has('w') || keysPressed.current.has('W')) {
        socketRef.current.emit('paddleMove', 'up');
      }
      if (keysPressed.current.has('ArrowDown') || keysPressed.current.has('s') || keysPressed.current.has('S')) {
        socketRef.current.emit('paddleMove', 'down');
      }
    }, 1000 / 30); // 30 FPS for input

    return () => clearInterval(interval);
  }, [myPaddle]);

  // Render game
  useEffect(() => {
    if (!gameState) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw center line
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(GAME_WIDTH / 2, 0);
    ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw paddles
    ctx.fillStyle = '#fff';
    
    // Left paddle
    ctx.fillRect(0, gameState.paddles.left.y, PADDLE_WIDTH, PADDLE_HEIGHT);
    
    // Right paddle
    ctx.fillRect(GAME_WIDTH - PADDLE_WIDTH, gameState.paddles.right.y, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Highlight my paddle
    if (myPaddle) {
      ctx.fillStyle = '#0ff';
      if (myPaddle === 'left') {
        ctx.fillRect(0, gameState.paddles.left.y, PADDLE_WIDTH, PADDLE_HEIGHT);
      } else {
        ctx.fillRect(GAME_WIDTH - PADDLE_WIDTH, gameState.paddles.right.y, PADDLE_WIDTH, PADDLE_HEIGHT);
      }
    }

    // Draw ball
    ctx.fillStyle = '#fff';
    ctx.fillRect(gameState.ball.x, gameState.ball.y, BALL_SIZE, BALL_SIZE);

    // Draw score
    ctx.fillStyle = '#fff';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(gameState.score.left.toString(), GAME_WIDTH / 4, 60);
    ctx.fillText(gameState.score.right.toString(), (3 * GAME_WIDTH) / 4, 60);

  }, [gameState, myPaddle]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-4xl font-bold mb-4">Multiplayer Pong</h1>
      
      <div className="mb-4 text-center">
        <div className="mb-2">
          <span className={`inline-block w-3 h-3 rounded-full mr-2 ${
            connectionStatus === 'Connected' ? 'bg-green-500' : 'bg-red-500'
          }`}></span>
          Connection: {connectionStatus}
        </div>
        <div className="text-lg">{gameStatus}</div>
        {gameState && (
          <div className="text-sm text-gray-400">
            Players: {gameState.players.length}/2
          </div>
        )}
      </div>

      <div className="relative mb-4">
        <canvas
          ref={canvasRef}
          width={GAME_WIDTH}
          height={GAME_HEIGHT}
          className="border border-gray-600 bg-black"
          tabIndex={0}
        />
      </div>

      <div className="text-center text-sm text-gray-400 max-w-md">
        <div className="mb-2">
          <strong>Controls:</strong>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="font-semibold">Left Player:</div>
            <div>W/S or Arrow Keys</div>
          </div>
          <div>
            <div className="font-semibold">Right Player:</div>
            <div>W/S or Arrow Keys</div>
          </div>
        </div>
        <div className="mt-4 text-xs">
          Your paddle is highlighted in cyan. Wait for another player to join!
        </div>
      </div>

      {gameState && (
        <div className="mt-4 text-center">
          <div className="text-2xl font-bold">
            {gameState.score.left} - {gameState.score.right}
          </div>
          <div className="text-sm text-gray-400">
            {gameState.gameActive ? 'Game Active' : 'Game Paused'}
          </div>
        </div>
      )}
    </div>
  );
};

export default PongGame;