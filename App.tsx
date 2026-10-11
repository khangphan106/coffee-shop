// tslint:disable
/* eslint-disable */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  RotateCw,
  Volume2,
  VolumeX,
  Trophy,
  Shield,
  Sparkles,
  Clock,
  Settings,
  HelpCircle,
  Zap,
  Award,
  Undo2,
  Lightbulb,
  Flame,
  BookOpen,
  X,
  ChevronDown,
} from 'lucide-react';
import { THEME } from './constants';
import {
  formatTime,
  gameAudio,
  GameState,
  MenuOverlay,
  Overlay,
  prepareCanvas,
  useAutoFocus,
  useIsMobile,
} from './utils/helper';
import {
  usePlayground,
  usePlaygroundGameLifecycle,
  useRpc,
} from './utils/usePlayground';

// --- TYPES & INTERFACES ---
export type Side = 'red' | 'black';
export type PieceType =
  | 'general'
  | 'advisor'
  | 'elephant'
  | 'horse'
  | 'chariot'
  | 'cannon'
  | 'soldier';

export interface Piece {
  id: string;
  side: Side;
  type: PieceType;
  x: number; // 0..8
  y: number; // 0..9
}

export interface Move {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  piece: Piece;
  captured?: Piece;
  notationZh?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface MoveAnimation {
  piece: Piece;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  currentX: number;
  currentY: number;
  progress: number;
  captured?: Piece;
  onComplete?: () => void;
}

// --- PIECE METADATA & CHINESE CHARACTERS ---
const PIECE_NAMES: Record<
  PieceType,
  { red: string; black: string; en: string; val: number }
> = {
  general: { red: '帥', black: '將', en: 'General', val: 10000 },
  advisor: { red: '仕', black: '士', en: 'Advisor', val: 220 },
  elephant: { red: '相', black: '象', en: 'Elephant', val: 220 },
  horse: { red: '傌', black: '馬', en: 'Horse', val: 450 },
  chariot: { red: '俥', black: '車', en: 'Chariot', val: 950 },
  cannon: { red: '炮', black: '砲', en: 'Cannon', val: 480 },
  soldier: { red: '兵', black: '卒', en: 'Soldier', val: 120 },
};

// Initial Xiangqi Board Setup
function createInitialBoard(): Piece[] {
  const pieces: Piece[] = [];
  let idCounter = 1;

  const add = (side: Side, type: PieceType, x: number, y: number) => {
    pieces.push({
      id: `${side}_${type}_${idCounter++}`,
      side,
      type,
      x,
      y,
    });
  };

  // Black pieces (Top: rows 0..4)
  add('black', 'chariot', 0, 0);
  add('black', 'horse', 1, 0);
  add('black', 'elephant', 2, 0);
  add('black', 'advisor', 3, 0);
  add('black', 'general', 4, 0);
  add('black', 'advisor', 5, 0);
  add('black', 'elephant', 6, 0);
  add('black', 'horse', 7, 0);
  add('black', 'chariot', 8, 0);
  add('black', 'cannon', 1, 2);
  add('black', 'cannon', 7, 2);
  add('black', 'soldier', 0, 3);
  add('black', 'soldier', 2, 3);
  add('black', 'soldier', 4, 3);
  add('black', 'soldier', 6, 3);
  add('black', 'soldier', 8, 3);

  // Red pieces (Bottom: rows 5..9)
  add('red', 'chariot', 0, 9);
  add('red', 'horse', 1, 9);
  add('red', 'elephant', 2, 9);
  add('red', 'advisor', 3, 9);
  add('red', 'general', 4, 9);
  add('red', 'advisor', 5, 9);
  add('red', 'elephant', 6, 9);
  add('red', 'horse', 7, 9);
  add('red', 'chariot', 8, 9);
  add('red', 'cannon', 1, 7);
  add('red', 'cannon', 7, 7);
  add('red', 'soldier', 0, 6);
  add('red', 'soldier', 2, 6);
  add('red', 'soldier', 4, 6);
  add('red', 'soldier', 6, 6);
  add('red', 'soldier', 8, 6);

  return pieces;
}

// --- XIANGQI RULE ENGINE & MOVE GENERATION ---

export function getPieceAt(pieces: Piece[], x: number, y: number): Piece | undefined {
  return pieces.find((p) => p.x === x && p.y === y);
}

// Check if position is inside palace
function isInPalace(x: number, y: number, side: Side): boolean {
  if (x < 3 || x > 5) return false;
  if (side === 'black') return y >= 0 && y <= 2;
  return y >= 7 && y <= 9;
}

// Generate pseudo-legal moves for a specific piece
export function getPseudoMoves(piece: Piece, board: Piece[]): { x: number; y: number }[] {
  const moves: { x: number; y: number }[] = [];
  const { x, y, side, type } = piece;

  const isFriendly = (tx: number, ty: number) => {
    const target = getPieceAt(board, tx, ty);
    return target && target.side === side;
  };

  const isEnemy = (tx: number, ty: number) => {
    const target = getPieceAt(board, tx, ty);
    return target && target.side !== side;
  };

  const isEmpty = (tx: number, ty: number) => !getPieceAt(board, tx, ty);

  switch (type) {
    case 'general': {
      const dirs = [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ];
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (isInPalace(nx, ny, side) && !isFriendly(nx, ny)) {
          moves.push({ x: nx, y: ny });
        }
      }
      break;
    }
    case 'advisor': {
      const dirs = [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ];
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (isInPalace(nx, ny, side) && !isFriendly(nx, ny)) {
          moves.push({ x: nx, y: ny });
        }
      }
      break;
    }
    case 'elephant': {
      const dirs = [
        [2, 2],
        [2, -2],
        [-2, 2],
        [-2, -2],
      ];
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        // Elephant cannot cross river
        if (side === 'black' && ny > 4) continue;
        if (side === 'red' && ny < 5) continue;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 9) continue;

        // Elephant eye check
        const eyeX = x + dx / 2;
        const eyeY = y + dy / 2;
        if (isEmpty(eyeX, eyeY) && !isFriendly(nx, ny)) {
          moves.push({ x: nx, y: ny });
        }
      }
      break;
    }
    case 'horse': {
      const horseSteps = [
        { dx: 1, dy: 2, legX: 0, legY: 1 },
        { dx: -1, dy: 2, legX: 0, legY: 1 },
        { dx: 1, dy: -2, legX: 0, legY: -1 },
        { dx: -1, dy: -2, legX: 0, legY: -1 },
        { dx: 2, dy: 1, legX: 1, legY: 0 },
        { dx: 2, dy: -1, legX: 1, legY: 0 },
        { dx: -2, dy: 1, legX: -1, legY: 0 },
        { dx: -2, dy: -1, legX: -1, legY: 0 },
      ];
      for (const step of horseSteps) {
        const nx = x + step.dx;
        const ny = y + step.dy;
        if (nx < 0 || nx > 8 || ny < 0 || ny > 9) continue;

        const legX = x + step.legX;
        const legY = y + step.legY;
        if (isEmpty(legX, legY) && !isFriendly(nx, ny)) {
          moves.push({ x: nx, y: ny });
        }
      }
      break;
    }
    case 'chariot': {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dx, dy] of dirs) {
        let nx = x + dx;
        let ny = y + dy;
        while (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 9) {
          if (isEmpty(nx, ny)) {
            moves.push({ x: nx, y: ny });
          } else {
            if (isEnemy(nx, ny)) {
              moves.push({ x: nx, y: ny });
            }
            break;
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    }
    case 'cannon': {
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [dx, dy] of dirs) {
        let nx = x + dx;
        let ny = y + dy;
        let jumped = false;
        while (nx >= 0 && nx <= 8 && ny >= 0 && ny <= 9) {
          if (!jumped) {
            if (isEmpty(nx, ny)) {
              moves.push({ x: nx, y: ny });
            } else {
              jumped = true; // Screen piece encountered
            }
          } else {
            if (!isEmpty(nx, ny)) {
              if (isEnemy(nx, ny)) {
                moves.push({ x: nx, y: ny });
              }
              break;
            }
          }
          nx += dx;
          ny += dy;
        }
      }
      break;
    }
    case 'soldier': {
      if (side === 'red') {
        // Red moves UP (dy = -1)
        if (y - 1 >= 0 && !isFriendly(x, y - 1)) {
          moves.push({ x, y: y - 1 });
        }
        // Crossed river (y <= 4)
        if (y <= 4) {
          if (x - 1 >= 0 && !isFriendly(x - 1, y)) moves.push({ x: x - 1, y });
          if (x + 1 <= 8 && !isFriendly(x + 1, y)) moves.push({ x: x + 1, y });
        }
      } else {
        // Black moves DOWN (dy = 1)
        if (y + 1 <= 9 && !isFriendly(x, y + 1)) {
          moves.push({ x, y: y + 1 });
        }
        // Crossed river (y >= 5)
        if (y >= 5) {
          if (x - 1 >= 0 && !isFriendly(x - 1, y)) moves.push({ x: x - 1, y });
          if (x + 1 <= 8 && !isFriendly(x + 1, y)) moves.push({ x: x + 1, y });
        }
      }
      break;
    }
  }

  return moves;
}

// Check if Flying Generals condition occurs
export function isFlyingGeneral(board: Piece[]): boolean {
  const redGeneral = board.find((p) => p.side === 'red' && p.type === 'general');
  const blackGeneral = board.find((p) => p.side === 'black' && p.type === 'general');
  if (!redGeneral || !blackGeneral) return false;

  if (redGeneral.x === blackGeneral.x) {
    const minY = Math.min(redGeneral.y, blackGeneral.y);
    const maxY = Math.max(redGeneral.y, blackGeneral.y);
    let blockers = 0;
    for (let y = minY + 1; y < maxY; y++) {
      if (getPieceAt(board, redGeneral.x, y)) {
        blockers++;
      }
    }
    if (blockers === 0) return true;
  }
  return false;
}

// Check if side's General is attacked
export function isSideInCheck(board: Piece[], side: Side): boolean {
  const general = board.find((p) => p.side === side && p.type === 'general');
  if (!general) return true;

  if (isFlyingGeneral(board)) return true;

  const enemySide = side === 'red' ? 'black' : 'red';
  const enemyPieces = board.filter((p) => p.side === enemySide);

  for (const enemy of enemyPieces) {
    const moves = getPseudoMoves(enemy, board);
    if (moves.some((m) => m.x === general.x && m.y === general.y)) {
      return true;
    }
  }

  return false;
}

// Filter legal moves (cannot leave own general in check)
export function getLegalMovesForPiece(piece: Piece, board: Piece[]): { x: number; y: number }[] {
  const pseudo = getPseudoMoves(piece, board);
  const legal: { x: number; y: number }[] = [];

  for (const target of pseudo) {
    // Simulate move
    const simulated = board
      .filter((p) => !(p.x === target.x && p.y === target.y))
      .map((p) => {
        if (p.id === piece.id) {
          return { ...p, x: target.x, y: target.y };
        }
        return p;
      });

    if (!isSideInCheck(simulated, piece.side)) {
      legal.push(target);
    }
  }

  return legal;
}

export function getAllLegalMoves(board: Piece[], side: Side): Move[] {
  const pieces = board.filter((p) => p.side === side);
  const allMoves: Move[] = [];

  for (const piece of pieces) {
    const targets = getLegalMovesForPiece(piece, board);
    for (const target of targets) {
      const captured = getPieceAt(board, target.x, target.y);
      allMoves.push({
        fromX: piece.x,
        fromY: piece.y,
        toX: target.x,
        toY: target.y,
        piece,
        captured,
      });
    }
  }

  return allMoves;
}

// Convert Xiangqi move to authentic notation
export function formatNotation(move: Move): string {
  const { piece, fromX, fromY, toX, toY } = move;
  const isRed = piece.side === 'red';
  const nameZh = PIECE_NAMES[piece.type][isRed ? 'red' : 'black'];
  const zhDigits = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const redFromCol = 9 - fromX; // Red columns 1..9 from right to left
  const redToCol = 9 - toX;
  const blackFromCol = fromX + 1; // Black columns 1..9 from right to left
  const blackToCol = toX + 1;

  if (isRed) {
    const colStr = zhDigits[redFromCol - 1];
    if (fromY === toY) {
      return `${nameZh}${colStr}平${zhDigits[redToCol - 1]}`;
    } else if (toY < fromY) {
      const dist =
        piece.type === 'horse' || piece.type === 'elephant' || piece.type === 'advisor'
          ? zhDigits[redToCol - 1]
          : zhDigits[fromY - toY - 1];
      return `${nameZh}${colStr}進${dist}`;
    } else {
      const dist =
        piece.type === 'horse' || piece.type === 'elephant' || piece.type === 'advisor'
          ? zhDigits[redToCol - 1]
          : zhDigits[toY - fromY - 1];
      return `${nameZh}${colStr}退${dist}`;
    }
  } else {
    const colStr = blackFromCol.toString();
    if (fromY === toY) {
      return `${nameZh}${colStr}平${blackToCol}`;
    } else if (toY > fromY) {
      const dist =
        piece.type === 'horse' || piece.type === 'elephant' || piece.type === 'advisor'
          ? blackToCol.toString()
          : (toY - fromY).toString();
      return `${nameZh}${colStr}進${dist}`;
    } else {
      const dist =
        piece.type === 'horse' || piece.type === 'elephant' || piece.type === 'advisor'
          ? blackToCol.toString()
          : (fromY - toY).toString();
      return `${nameZh}${colStr}退${dist}`;
    }
  }
}

// --- EVALUATION & AI ENGINE (MINIMAX WITH ALPHA-BETA) ---

const PST_SOLDIER_RED = [
  [0, 3, 6, 9, 12, 9, 6, 3, 0],
  [10, 18, 22, 35, 40, 35, 22, 18, 10],
  [10, 16, 20, 28, 30, 28, 20, 16, 10],
  [10, 14, 18, 20, 20, 20, 18, 14, 10],
  [6, 8, 12, 14, 14, 14, 12, 8, 6],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, -2, 0, 4, 0, -2, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
];

const PST_HORSE = [
  [0, -4, 0, 0, 0, 0, 0, -4, 0],
  [0, 2, 4, 4, 4, 4, 4, 2, 0],
  [4, 8, 8, 12, 12, 12, 8, 8, 4],
  [4, 8, 12, 14, 16, 14, 12, 8, 4],
  [6, 10, 14, 16, 18, 16, 14, 10, 6],
  [6, 10, 14, 16, 18, 16, 14, 10, 6],
  [4, 8, 12, 14, 16, 14, 12, 8, 4],
  [2, 4, 6, 8, 8, 8, 6, 4, 2],
  [0, 2, 4, 4, 4, 4, 4, 2, 0],
  [0, -4, 0, 0, 0, 0, 0, -4, 0],
];

export function evaluateBoard(board: Piece[]): number {
  let score = 0;

  for (const p of board) {
    const baseVal = PIECE_NAMES[p.type].val;
    let posVal = 0;

    if (p.type === 'soldier') {
      if (p.side === 'red') {
        posVal = PST_SOLDIER_RED[p.y]?.[p.x] || 0;
      } else {
        posVal = PST_SOLDIER_RED[9 - p.y]?.[p.x] || 0;
      }
    } else if (p.type === 'horse') {
      posVal = PST_HORSE[p.y]?.[p.x] || 0;
    } else if (p.type === 'chariot') {
      posVal = 10;
    }

    const total = baseVal + posVal;
    if (p.side === 'red') {
      score += total;
    } else {
      score -= total;
    }
  }

  return score;
}

export function findBestAIMove(
  board: Piece[],
  difficulty: number,
  side: Side = 'black',
): { move: Move; score: number } | null {
  const isMaximizing = side === 'red';
  const allMoves = getAllLegalMoves(board, side);

  if (allMoves.length === 0) return null;

  if (difficulty === 1 && Math.random() < 0.28) {
    const captures = allMoves.filter((m) => m.captured);
    if (captures.length > 0 && Math.random() < 0.65) {
      return {
        move: captures[Math.floor(Math.random() * captures.length)],
        score: 0,
      };
    }
    return {
      move: allMoves[Math.floor(Math.random() * allMoves.length)],
      score: 0,
    };
  }

  allMoves.sort((a, b) => {
    const valA = a.captured ? PIECE_NAMES[a.captured.type].val : 0;
    const valB = b.captured ? PIECE_NAMES[b.captured.type].val : 0;
    return valB - valA;
  });

  const searchDepth = difficulty === 1 ? 1 : difficulty === 2 ? 2 : 3;

  function minimax(
    curBoard: Piece[],
    depth: number,
    alpha: number,
    beta: number,
    maximizing: boolean,
  ): number {
    if (depth === 0) {
      return evaluateBoard(curBoard);
    }

    const currentSide: Side = maximizing ? 'red' : 'black';
    const moves = getAllLegalMoves(curBoard, currentSide);

    if (moves.length === 0) {
      return maximizing ? -99999 + (4 - depth) : 99999 - (4 - depth);
    }

    if (maximizing) {
      let maxEval = -Infinity;
      for (const m of moves) {
        const nextBoard = curBoard
          .filter((p) => !(p.x === m.toX && p.y === m.toY))
          .map((p) => (p.id === m.piece.id ? { ...p, x: m.toX, y: m.toY } : p));
        const ev = minimax(nextBoard, depth - 1, alpha, beta, false);
        maxEval = Math.max(maxEval, ev);
        alpha = Math.max(alpha, ev);
        if (beta <= alpha) break;
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (const m of moves) {
        const nextBoard = curBoard
          .filter((p) => !(p.x === m.toX && p.y === m.toY))
          .map((p) => (p.id === m.piece.id ? { ...p, x: m.toX, y: m.toY } : p));
        const ev = minimax(nextBoard, depth - 1, alpha, beta, true);
        minEval = Math.min(minEval, ev);
        beta = Math.min(beta, ev);
        if (beta <= alpha) break;
      }
      return minEval;
    }
  }

  let bestMove = allMoves[0];
  let bestVal = isMaximizing ? -Infinity : Infinity;

  for (const m of allMoves) {
    const nextBoard = board
      .filter((p) => !(p.x === m.toX && p.y === m.toY))
      .map((p) => (p.id === m.piece.id ? { ...p, x: m.toX, y: m.toY } : p));

    const val = minimax(
      nextBoard,
      searchDepth - 1,
      -Infinity,
      Infinity,
      !isMaximizing,
    );

    if (isMaximizing) {
      if (val > bestVal) {
        bestVal = val;
        bestMove = m;
      }
    } else {
      if (val < bestVal) {
        bestVal = val;
        bestMove = m;
      }
    }
  }

  return { move: bestMove, score: bestVal };
}

// --- MAIN REACT COMPONENT ---

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isMobile = useIsMobile();

  // --- PLAYGROUND SDK INTEGRATION ---
  const { sdk } = usePlayground();

  const canvasWidth = 800;
  const canvasHeight = 940;

  // --- GAME STATE ---
  const [gameState, setGameState] = useState<GameState>({
    status: 'START',
    score: 0,
    level: 2,
  });

  const [aiDifficulty, setAiDifficulty] = useState<number>(2);
  const [playerSide] = useState<Side>('red');
  const [currentTurn, setCurrentTurn] = useState<Side>('red');
  const [board, setBoard] = useState<Piece[]>(() => createInitialBoard());
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<Move[]>([]);
  const [boardHistory, setBoardHistory] = useState<Piece[][]>([]);
  const [capturedRed, setCapturedRed] = useState<Piece[]>([]);
  const [capturedBlack, setCapturedBlack] = useState<Piece[]>([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<Side | null>(null);
  const [hintMove, setHintMove] = useState<Move | null>(null);
  const [hintsRemaining, setHintsRemaining] = useState<number>(5);
  const [undosRemaining, setUndosRemaining] = useState<number>(8);

  // Audio mute state (SFX only, BGM removed)
  const [sfxMuted, setSfxMuted] = useState(false);

  // Modals
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [turnTimer, setTurnTimer] = useState<number>(120);

  // Animation & Particle refs
  const animationRef = useRef<MoveAnimation | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const boardRef = useRef<Piece[]>(board);
  boardRef.current = board;

  const currentTurnRef = useRef<Side>(currentTurn);
  currentTurnRef.current = currentTurn;

  const lastMoveRef = useRef<Move | null>(null);

  // --- PLAYGROUND LIFECYCLE ---
  usePlaygroundGameLifecycle(gameState, sdk);

  useEffect(() => {
    (window as any).canHandleBackKey = gameState.status !== 'START';
  }, [gameState.status]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isRulesOpen) setIsRulesOpen(false);
      }
      if (e.key === 'h' || e.key === 'H') {
        handleHint();
      }
      if (e.key === 'u' || e.key === 'U') {
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // Calculate grid layout coordinates on the 800x940 canvas
  const gridLayout = useMemo(() => {
    const marginX = 72;
    const marginTop = 70;
    const marginBottom = 70;
    const boardWidth = canvasWidth - marginX * 2; // 656
    const boardHeight = canvasHeight - marginTop - marginBottom; // 800
    const cellWidth = boardWidth / 8; // 82
    const cellHeight = boardHeight / 9; // 88.88
    const pieceRadius = 35;

    const getCoord = (gx: number, gy: number) => ({
      x: marginX + gx * cellWidth,
      y: marginTop + gy * cellHeight,
    });

    return {
      marginX,
      marginTop,
      boardWidth,
      boardHeight,
      cellWidth,
      cellHeight,
      pieceRadius,
      getCoord,
    };
  }, [canvasWidth, canvasHeight]);

  // Selected piece legal moves
  const legalMoves = useMemo(() => {
    if (!selectedPieceId || gameState.status !== 'PLAYING' || isAiThinking) return [];
    const piece = board.find((p) => p.id === selectedPieceId);
    if (!piece || piece.side !== currentTurn) return [];
    return getLegalMovesForPiece(piece, board);
  }, [selectedPieceId, board, currentTurn, gameState.status, isAiThinking]);

  // Real-time evaluation score
  const evalScore = useMemo(() => {
    return evaluateBoard(board);
  }, [board]);

  // Sound effects on game status
  useEffect(() => {
    if (gameState.status === 'GAME_OVER') {
      gameAudio.playDefeatMotif();
    } else if (gameState.status === 'VICTORY') {
      gameAudio.playVictoryFanfare();
    }
  }, [gameState.status]);

  // Turn timer tick
  useEffect(() => {
    if (gameState.status !== 'PLAYING' || isRulesOpen) return;
    const interval = setInterval(() => {
      setTurnTimer((prev) => {
        if (prev <= 1) {
          gameAudio.playErrorBuzz();
          return 120;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [gameState.status, isRulesOpen]);

  // Initialize match
  const initGame = useCallback(
    (difficulty = aiDifficulty) => {
      const initial = createInitialBoard();
      setBoard(initial);
      boardRef.current = initial;
      setSelectedPieceId(null);
      setCurrentTurn('red');
      currentTurnRef.current = 'red';
      setMoveHistory([]);
      setBoardHistory([initial]);
      setCapturedRed([]);
      setCapturedBlack([]);
      setCheckStatus(null);
      setHintMove(null);
      setAiDifficulty(difficulty);
      setHintsRemaining(5);
      setUndosRemaining(8);
      setTurnTimer(120);
      setIsAiThinking(false);
      setIsRulesOpen(false);
      lastMoveRef.current = null;
      animationRef.current = null;
      particlesRef.current = [];

      setGameState({
        status: 'PLAYING',
        score: 0,
        level: difficulty,
      });

      gameAudio.playPowerupChime();

      if (sdk) {
        sdk.startGame();
      }
    },
    [aiDifficulty, sdk],
  );

  // Spawn particle shockwave on capture
  const spawnCaptureParticles = (cx: number, cy: number, isRedPiece: boolean) => {
    const palette = isRedPiece
      ? ['#ef4444', '#dc2626', '#f59e0b', '#fde68a', '#e2ba7e']
      : ['#38bdf8', '#0284c7', '#475569', '#f8fafc', '#d97706'];
    for (let i = 0; i < 28; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 6.5;
      particlesRef.current.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 0.5 + Math.random() * 0.4,
        color: palette[Math.floor(Math.random() * palette.length)],
        size: 3 + Math.random() * 4,
      });
    }
  };

  // --- EXECUTE MOVE ---
  const executeMove = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number) => {
      const currentBoard = boardRef.current;
      const piece = getPieceAt(currentBoard, fromX, fromY);
      if (!piece) return;

      const captured = getPieceAt(currentBoard, toX, toY);
      const zh = formatNotation({ fromX, fromY, toX, toY, piece, captured });

      const moveObj: Move = {
        fromX,
        fromY,
        toX,
        toY,
        piece,
        captured,
        notationZh: zh,
      };
      lastMoveRef.current = moveObj;

      const startCoord = gridLayout.getCoord(fromX, fromY);
      const targetCoord = gridLayout.getCoord(toX, toY);

      animationRef.current = {
        piece,
        startX: startCoord.x,
        startY: startCoord.y,
        targetX: targetCoord.x,
        targetY: targetCoord.y,
        currentX: startCoord.x,
        currentY: startCoord.y,
        progress: 0,
        captured,
        onComplete: () => {
          if (captured) {
            // Punchy rich resonant wooden capture clack
            gameAudio.playWoodCapture();
            spawnCaptureParticles(targetCoord.x, targetCoord.y, captured.side === 'red');
          } else {
            // Tactile crisp wood snap
            gameAudio.playWoodSnap();
          }

          const nextBoard = currentBoard
            .filter((p) => !(p.x === toX && p.y === toY))
            .map((p) => (p.id === piece.id ? { ...p, x: toX, y: toY } : p));

          setBoard(nextBoard);
          boardRef.current = nextBoard;
          setBoardHistory((prev) => [...prev, nextBoard]);
          setMoveHistory((prev) => [...prev, moveObj]);

          if (captured) {
            if (captured.side === 'red') {
              setCapturedRed((prev) => [...prev, captured]);
            } else {
              setCapturedBlack((prev) => [...prev, captured]);
            }
          }

          setTurnTimer(120);

          const nextTurn: Side = piece.side === 'red' ? 'black' : 'red';
          const isEnemyInCheck = isSideInCheck(nextBoard, nextTurn);
          const enemyMoves = getAllLegalMoves(nextBoard, nextTurn);

          if (isEnemyInCheck) {
            setCheckStatus(nextTurn);
            gameAudio.playMeleePunch();
          } else {
            setCheckStatus(null);
          }

          if (enemyMoves.length === 0) {
            if (nextTurn === playerSide) {
              setGameState((prev) => ({
                ...prev,
                status: 'GAME_OVER',
                score: Math.max(0, 500 - (moveHistory.length + 1) * 10),
              }));
            } else {
              const victoryBonus =
                aiDifficulty === 3 ? 3500 : aiDifficulty === 2 ? 2200 : 1200;
              setGameState((prev) => ({
                ...prev,
                status: 'VICTORY',
                score: Math.max(
                  1000,
                  victoryBonus +
                    (capturedBlack.length + (captured ? 1 : 0)) * 220 -
                    (moveHistory.length + 1) * 12,
                ),
              }));
            }
            return;
          }

          setCurrentTurn(nextTurn);
          currentTurnRef.current = nextTurn;
          setSelectedPieceId(null);
          setHintMove(null);
        },
      };
    },
    [gridLayout, aiDifficulty, playerSide, moveHistory.length, capturedBlack.length],
  );

  // --- AI TURN EFFECT ---
  useEffect(() => {
    if (
      gameState.status !== 'PLAYING' ||
      currentTurn === playerSide ||
      isAiThinking ||
      animationRef.current !== null
    ) {
      return;
    }

    setIsAiThinking(true);
    const thinkDelay = 350 + Math.random() * 350;

    const timer = setTimeout(() => {
      const best = findBestAIMove(boardRef.current, aiDifficulty, 'black');
      setIsAiThinking(false);
      if (best && best.move) {
        executeMove(
          best.move.fromX,
          best.move.fromY,
          best.move.toX,
          best.move.toY,
        );
      } else {
        setGameState((prev) => ({ ...prev, status: 'VICTORY', score: 2500 }));
      }
    }, thinkDelay);

    return () => clearTimeout(timer);
  }, [currentTurn, gameState.status, playerSide, aiDifficulty, executeMove]);

  // --- HINT FUNCTIONALITY ---
  const handleHint = useCallback(() => {
    if (
      gameState.status !== 'PLAYING' ||
      currentTurn !== playerSide ||
      isAiThinking ||
      hintsRemaining <= 0
    ) {
      gameAudio.playErrorBuzz();
      return;
    }

    const best = findBestAIMove(boardRef.current, 3, playerSide);
    if (best && best.move) {
      setHintMove(best.move);
      setSelectedPieceId(best.move.piece.id);
      setHintsRemaining((prev) => prev - 1);
      gameAudio.playConfirmSelect();
    }
  }, [gameState.status, currentTurn, playerSide, isAiThinking, hintsRemaining]);

  // --- UNDO FUNCTIONALITY ---
  const handleUndo = useCallback(() => {
    if (
      gameState.status !== 'PLAYING' ||
      isAiThinking ||
      boardHistory.length < 3 ||
      undosRemaining <= 0
    ) {
      gameAudio.playErrorBuzz();
      return;
    }

    const targetBoardIndex = boardHistory.length - 3;
    const targetBoard = boardHistory[targetBoardIndex];
    const newBoardHistory = boardHistory.slice(0, targetBoardIndex + 1);
    const newMoveHistory = moveHistory.slice(0, moveHistory.length - 2);

    setBoard(targetBoard);
    boardRef.current = targetBoard;
    setBoardHistory(newBoardHistory);
    setMoveHistory(newMoveHistory);
    setCurrentTurn(playerSide);
    currentTurnRef.current = playerSide;
    setSelectedPieceId(null);
    setHintMove(null);
    setCheckStatus(null);
    setUndosRemaining((prev) => prev - 1);
    lastMoveRef.current = newMoveHistory[newMoveHistory.length - 1] || null;

    const initial = createInitialBoard();
    const currentRedIds = new Set(targetBoard.filter((p) => p.side === 'red').map((p) => p.id));
    const currentBlackIds = new Set(targetBoard.filter((p) => p.side === 'black').map((p) => p.id));

    setCapturedRed(initial.filter((p) => p.side === 'red' && !currentRedIds.has(p.id)));
    setCapturedBlack(initial.filter((p) => p.side === 'black' && !currentBlackIds.has(p.id)));

    gameAudio.playWoodSnap();
  }, [gameState.status, isAiThinking, boardHistory, moveHistory, undosRemaining, playerSide]);

  // --- CANVAS POINTER CLICK HANDLER ---
  const handleCanvasClick = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (
      gameState.status !== 'PLAYING' ||
      currentTurn !== playerSide ||
      isAiThinking ||
      animationRef.current !== null
    ) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    const { marginX, marginTop, cellWidth, cellHeight, pieceRadius } = gridLayout;
    const gridX = Math.round((clickX - marginX) / cellWidth);
    const gridY = Math.round((clickY - marginTop) / cellHeight);

    if (gridX < 0 || gridX > 8 || gridY < 0 || gridY > 9) {
      setSelectedPieceId(null);
      return;
    }

    const intersectX = marginX + gridX * cellWidth;
    const intersectY = marginTop + gridY * cellHeight;
    const dist = Math.hypot(clickX - intersectX, clickY - intersectY);

    if (dist > pieceRadius * 1.35) {
      return;
    }

    const clickedPiece = getPieceAt(board, gridX, gridY);

    if (selectedPieceId) {
      const isLegal = legalMoves.some((m) => m.x === gridX && m.y === gridY);
      if (isLegal) {
        const selPiece = board.find((p) => p.id === selectedPieceId);
        if (selPiece) {
          executeMove(selPiece.x, selPiece.y, gridX, gridY);
          return;
        }
      }
    }

    if (clickedPiece && clickedPiece.side === playerSide) {
      setSelectedPieceId(clickedPiece.id);
      setHintMove(null);
      gameAudio.playCrispClick();
    } else {
      setSelectedPieceId(null);
    }
  };

  // --- RENDERING & ANIMATION LOOP ---
  useEffect(() => {
    let raf = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (animationRef.current) {
        const anim = animationRef.current;
        anim.progress += dt * 5.2; // Smooth 190ms slide
        if (anim.progress >= 1) {
          anim.progress = 1;
          anim.currentX = anim.targetX;
          anim.currentY = anim.targetY;
          const complete = anim.onComplete;
          animationRef.current = null;
          if (complete) complete();
        } else {
          const t = anim.progress;
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          anim.currentX = anim.startX + (anim.targetX - anim.startX) * ease;
          anim.currentY = anim.startY + (anim.targetY - anim.startY) * ease;
        }
      }

      if (particlesRef.current.length > 0) {
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.15; // subtle gravity
          p.life -= dt / p.maxLife;
          if (p.life <= 0) {
            particlesRef.current.splice(i, 1);
          }
        }
      }

      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) {
        renderCanvas(ctx);
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  });

  // --- PROCEDURAL LUXURY CHESSBOARD & 3D PIECES RENDERING ---
  const renderCanvas = (ctx: CanvasRenderingContext2D) => {
    prepareCanvas(ctx, canvasWidth, canvasHeight);

    const {
      marginX,
      marginTop,
      boardWidth,
      boardHeight,
      cellWidth,
      cellHeight,
      pieceRadius,
      getCoord,
    } = gridLayout;

    // 1. Procedural Luxury Wood Board Surface
    // Outer Rosewood Bevel Table Frame
    const frameGrad = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    frameGrad.addColorStop(0, '#2e180d');
    frameGrad.addColorStop(0.5, '#422212');
    frameGrad.addColorStop(1, '#241208');
    ctx.fillStyle = frameGrad;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Inner Zelkova Playing Wood Bed
    const pad = 24;
    const playX = marginX - pad;
    const playY = marginTop - pad;
    const playW = boardWidth + pad * 2;
    const playH = boardHeight + pad * 2;

    ctx.save();
    // Drop shadow under playing board inlay
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 6;

    // Warm Zelkova / Boxwood Woodgrain Gradient
    const woodGrad = ctx.createRadialGradient(
      canvasWidth / 2,
      canvasHeight / 2,
      50,
      canvasWidth / 2,
      canvasHeight / 2,
      canvasWidth * 0.7,
    );
    woodGrad.addColorStop(0, '#ebd1a5');
    woodGrad.addColorStop(0.5, '#dfbf8c');
    woodGrad.addColorStop(0.85, '#cca268');
    woodGrad.addColorStop(1, '#b7894d');

    ctx.fillStyle = woodGrad;
    ctx.beginPath();
    ctx.roundRect(playX, playY, playW, playH, 14);
    ctx.fill();
    ctx.restore();

    // Subtle Wood Grain Fibers
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(playX, playY, playW, playH, 14);
    ctx.clip();
    ctx.strokeStyle = 'rgba(120, 70, 25, 0.045)';
    ctx.lineWidth = 1;
    for (let gy = playY; gy <= playY + playH; gy += 6) {
      ctx.beginPath();
      ctx.moveTo(playX, gy);
      ctx.bezierCurveTo(
        playX + playW * 0.3,
        gy + 2,
        playX + playW * 0.7,
        gy - 2,
        playX + playW,
        gy,
      );
      ctx.stroke();
    }
    ctx.restore();

    // Board Inlay Borders (Double gold/lacquer inlays)
    ctx.save();
    ctx.strokeStyle = 'rgba(84, 44, 16, 0.85)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.roundRect(playX + 8, playY + 8, playW - 16, playH - 16, 8);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(217, 168, 92, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(playX + 13, playY + 13, playW - 26, playH - 26, 6);
    ctx.stroke();
    ctx.restore();

    // 2. Traditional Xiangqi Grid Lines
    ctx.save();
    ctx.strokeStyle = 'rgba(74, 38, 14, 0.85)';
    ctx.lineWidth = 1.8;

    // Horizontal grid lines (10 lines)
    for (let r = 0; r < 10; r++) {
      const y = marginTop + r * cellHeight;
      ctx.beginPath();
      ctx.moveTo(marginX, y);
      ctx.lineTo(marginX + boardWidth, y);
      ctx.stroke();
    }

    // Vertical grid lines (9 lines, river break for columns 1..7)
    for (let c = 0; c < 9; c++) {
      const x = marginX + c * cellWidth;
      if (c === 0 || c === 8) {
        ctx.beginPath();
        ctx.moveTo(x, marginTop);
        ctx.lineTo(x, marginTop + boardHeight);
        ctx.stroke();
      } else {
        // Top territory
        ctx.beginPath();
        ctx.moveTo(x, marginTop);
        ctx.lineTo(x, marginTop + 4 * cellHeight);
        ctx.stroke();
        // Bottom territory
        ctx.beginPath();
        ctx.moveTo(x, marginTop + 5 * cellHeight);
        ctx.lineTo(x, marginTop + boardHeight);
        ctx.stroke();
      }
    }

    // 3. Traditional Palace Diagonals (九宮)
    // Black Palace (Top)
    ctx.beginPath();
    ctx.moveTo(marginX + 3 * cellWidth, marginTop);
    ctx.lineTo(marginX + 5 * cellWidth, marginTop + 2 * cellHeight);
    ctx.moveTo(marginX + 5 * cellWidth, marginTop);
    ctx.lineTo(marginX + 3 * cellWidth, marginTop + 2 * cellHeight);
    ctx.stroke();

    // Red Palace (Bottom)
    ctx.beginPath();
    ctx.moveTo(marginX + 3 * cellWidth, marginTop + 7 * cellHeight);
    ctx.lineTo(marginX + 5 * cellWidth, marginTop + 9 * cellHeight);
    ctx.moveTo(marginX + 5 * cellWidth, marginTop + 7 * cellHeight);
    ctx.lineTo(marginX + 3 * cellWidth, marginTop + 9 * cellHeight);
    ctx.stroke();

    // 4. Refined Chu River / Han Border Calligraphy Text (楚河 漢界)
    const riverY = marginTop + 4.5 * cellHeight;
    ctx.fillStyle = 'rgba(84, 42, 16, 0.8)';
    ctx.font = 'bold 30px "Noto Serif SC", "Kaiti SC", "Songti SC", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('楚   河', marginX + 2 * cellWidth, riverY);
    ctx.fillText('漢   界', marginX + 6 * cellWidth, riverY);

    // 5. Star / Crosshair Markers at Cannon & Soldier Positions
    const markers = [
      // Black cannons & soldiers
      { x: 1, y: 2 },
      { x: 7, y: 2 },
      { x: 0, y: 3 },
      { x: 2, y: 3 },
      { x: 4, y: 3 },
      { x: 6, y: 3 },
      { x: 8, y: 3 },
      // Red cannons & soldiers
      { x: 1, y: 7 },
      { x: 7, y: 7 },
      { x: 0, y: 6 },
      { x: 2, y: 6 },
      { x: 4, y: 6 },
      { x: 6, y: 6 },
      { x: 8, y: 6 },
    ];

    const d = 4;
    const l = 9;
    ctx.strokeStyle = 'rgba(74, 38, 14, 0.75)';
    ctx.lineWidth = 1.4;

    for (const m of markers) {
      const { x: px, y: py } = getCoord(m.x, m.y);
      if (m.x > 0) {
        // Top-left
        ctx.beginPath();
        ctx.moveTo(px - d - l, py - d);
        ctx.lineTo(px - d, py - d);
        ctx.lineTo(px - d, py - d - l);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(px - d - l, py + d);
        ctx.lineTo(px - d, py + d);
        ctx.lineTo(px - d, py + d + l);
        ctx.stroke();
      }
      if (m.x < 8) {
        // Top-right
        ctx.beginPath();
        ctx.moveTo(px + d + l, py - d);
        ctx.lineTo(px + d, py - d);
        ctx.lineTo(px + d, py - d - l);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(px + d + l, py + d);
        ctx.lineTo(px + d, py + d);
        ctx.lineTo(px + d, py + d + l);
        ctx.stroke();
      }
    }
    ctx.restore();

    // 6. Highlight Last Move
    if (lastMoveRef.current) {
      const from = getCoord(lastMoveRef.current.fromX, lastMoveRef.current.fromY);
      const to = getCoord(lastMoveRef.current.toX, lastMoveRef.current.toY);

      ctx.save();
      // Line connecting move
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.4)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // From ring
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(from.x, from.y, pieceRadius * 0.85, 0, Math.PI * 2);
      ctx.stroke();

      // To aura
      ctx.fillStyle = 'rgba(245, 158, 11, 0.16)';
      ctx.beginPath();
      ctx.arc(to.x, to.y, pieceRadius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 7. Highlight Selected Piece
    if (selectedPieceId) {
      const selected = board.find((p) => p.id === selectedPieceId);
      if (selected) {
        const { x, y } = getCoord(selected.x, selected.y);
        ctx.save();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(x, y, pieceRadius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 8. Highlight Legal Moves for Selected Piece
    if (legalMoves.length > 0) {
      ctx.save();
      for (const move of legalMoves) {
        const { x, y } = getCoord(move.x, move.y);
        const targetPiece = getPieceAt(board, move.x, move.y);

        if (targetPiece) {
          // Capture target: glowing red target ring
          ctx.strokeStyle = '#dc2626';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(x, y, pieceRadius + 4, 0, Math.PI * 2);
          ctx.stroke();
        } else {
          // Empty square: refined jade green target point
          ctx.fillStyle = '#10b981';
          ctx.shadowColor = '#10b981';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(x, y, 7.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = 'rgba(16, 185, 129, 0.55)';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(x, y, pieceRadius * 0.72, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 9. Highlight Hint Move
    if (hintMove) {
      const from = getCoord(hintMove.fromX, hintMove.fromY);
      const to = getCoord(hintMove.toX, hintMove.toY);
      ctx.save();
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(from.x, from.y, pieceRadius + 5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(to.x, to.y, pieceRadius + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 10. Draw Board Pieces (except the one actively gliding)
    const anim = animationRef.current;

    for (const piece of board) {
      if (anim && anim.piece.id === piece.id) continue;
      const { x, y } = getCoord(piece.x, piece.y);
      drawPiece(ctx, piece, x, y, pieceRadius);
    }

    // 11. Draw Animating Piece with Smooth Elevation
    if (anim) {
      drawPiece(ctx, anim.piece, anim.currentX, anim.currentY, pieceRadius, 1.14);
    }

    // 12. Draw Check Warning
    if (checkStatus) {
      const general = board.find((p) => p.side === checkStatus && p.type === 'general');
      if (general) {
        const { x, y } = getCoord(general.x, general.y);
        ctx.save();
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.arc(x, y, pieceRadius + 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // 13. Draw Splinter/Spark Particles
    if (particlesRef.current.length > 0) {
      ctx.save();
      for (const p of particlesRef.current) {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  // --- PROCEDURAL 3D WOODEN TOKEN DRAWING ---
  const drawPiece = (
    ctx: CanvasRenderingContext2D,
    piece: Piece,
    cx: number,
    cy: number,
    radius: number,
    scale = 1.0,
  ) => {
    const isRed = piece.side === 'red';
    const r = radius * scale;

    ctx.save();

    // 1. Piece Drop Shadow (Realistic wooden piece thickness)
    ctx.shadowColor = 'rgba(25, 12, 5, 0.65)';
    ctx.shadowBlur = 9 * scale;
    ctx.shadowOffsetX = 2.5 * scale;
    ctx.shadowOffsetY = 4.5 * scale;

    // 2. Base Wooden Token Chamfer Disc
    const tokenGrad = ctx.createRadialGradient(
      cx - r * 0.35,
      cy - r * 0.4,
      r * 0.1,
      cx,
      cy,
      r,
    );
    // Boxwood / Zelkova warm light tones with smooth bevel edge
    tokenGrad.addColorStop(0, '#fffbeb');
    tokenGrad.addColorStop(0.3, '#fde68a');
    tokenGrad.addColorStop(0.75, '#f59e0b');
    tokenGrad.addColorStop(0.95, '#d97706');
    tokenGrad.addColorStop(1, '#92400e');

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = tokenGrad;
    ctx.fill();

    // Reset shadow for crisp inner engraving
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // 3. Carved Outer Rim Bevel
    ctx.lineWidth = 1.8 * scale;
    ctx.strokeStyle = 'rgba(120, 53, 15, 0.4)';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.5 * scale, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Recessed Inner Carved Ring Accent (Traditional Xiangqi Disc Inset)
    const innerR = r * 0.82;
    const innerGrad = ctx.createRadialGradient(
      cx + r * 0.1,
      cy + r * 0.1,
      innerR * 0.2,
      cx,
      cy,
      innerR,
    );
    innerGrad.addColorStop(0, '#fef3c7');
    innerGrad.addColorStop(0.7, '#fde68a');
    innerGrad.addColorStop(1, '#f59e0b');

    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fill();

    // Inner ring groove stroke
    ctx.lineWidth = 1.6 * scale;
    ctx.strokeStyle = isRed ? 'rgba(185, 28, 28, 0.45)' : 'rgba(30, 41, 59, 0.45)';
    ctx.stroke();

    // 5. Authentic Bold Chinese Calligraphy Character
    const char = PIECE_NAMES[piece.type][isRed ? 'red' : 'black'];
    ctx.font = `900 ${Math.round(r * 1.06)}px "Noto Serif SC", "Kaiti SC", "Songti SC", "SimSun", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Inset Carving Shadow behind Character
    ctx.fillStyle = isRed ? 'rgba(127, 29, 29, 0.35)' : 'rgba(15, 23, 42, 0.3)';
    ctx.fillText(char, cx + 0.8 * scale, cy + 1.2 * scale);

    // Deep Vermilion or Obsidian Pigment
    ctx.fillStyle = isRed ? '#b91c1c' : '#0f172a';
    ctx.fillText(char, cx, cy);

    ctx.restore();
  };

  // Advantage Percentage for real-time evaluation bar
  const redAdvantagePct = useMemo(() => {
    const normalized = Math.max(-1500, Math.min(1500, evalScore));
    return 50 + (normalized / 1500) * 40;
  }, [evalScore]);

  // Primary Button Auto-focus
  const startButtonRef = useAutoFocus<HTMLButtonElement>(gameState.status === 'START');

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden touch-none flex flex-col bg-stone-950 text-stone-100 font-sans select-none">
      {/* Sleek Modern Header */}
      <header className="w-full bg-stone-900/95 border-b border-amber-900/40 px-3 py-2 flex items-center justify-between gap-2 z-20 shrink-0 backdrop-blur-md">
        {/* Left: Turn Status & Difficulty Badge */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-1.5 bg-stone-950/80 px-2.5 py-1 rounded-lg border border-stone-800">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                currentTurn === 'red'
                  ? 'bg-rose-500 shadow-[0_0_8px_#f43f5e] animate-pulse'
                  : 'bg-amber-400 animate-spin'
              }`}
            />
            <span
              className={`text-xs font-bold ${
                currentTurn === 'red' ? 'text-rose-400' : 'text-amber-300'
              }`}>
              {currentTurn === 'red' ? 'Your Turn' : 'AI Thinking...'}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[11px] text-amber-200/90 bg-amber-950/40 px-2 py-1 rounded-lg border border-amber-700/40">
            <Trophy size={13} className="text-amber-400" />
            <span className="font-semibold">
              {aiDifficulty === 1
                ? 'Novice'
                : aiDifficulty === 2
                ? 'Adept'
                : 'Master'}
            </span>
          </div>
        </div>

        {/* Center: Turn Timer & Move Count */}
        <div className="flex items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1 bg-stone-950/80 px-2 py-1 rounded-lg border border-stone-800 text-stone-300">
            <Clock size={12} className="text-amber-400" />
            <span
              className={
                turnTimer <= 15 ? 'text-rose-400 font-bold animate-pulse' : 'text-stone-200 font-mono'
              }>
              {formatTime(turnTimer)}
            </span>
          </div>
          <div className="hidden xs:block text-[11px] text-stone-400 font-medium">
            Moves: <span className="text-stone-200 font-bold">{moveHistory.length}</span>
          </div>
        </div>

        {/* Right: Sound Toggle & Rules */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const muted = gameAudio.toggleMute();
              setSfxMuted(muted);
            }}
            aria-label="Sound Toggle"
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors border border-stone-700">
            {sfxMuted ? <VolumeX size={16} className="text-rose-400" /> : <Volume2 size={16} className="text-amber-400" />}
          </button>
          <button
            onClick={() => setIsRulesOpen(true)}
            aria-label="Rules and Guide"
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 transition-colors border border-stone-700">
            <HelpCircle size={16} />
          </button>
        </div>
      </header>

      {/* Advantage Evaluation Bar */}
      <div className="w-full h-1 bg-stone-800 flex overflow-hidden shrink-0">
        <div
          className="h-full bg-gradient-to-r from-rose-700 to-amber-500 transition-all duration-300"
          style={{ width: `${redAdvantagePct}%` }}
        />
        <div
          className="h-full bg-gradient-to-r from-stone-700 to-sky-600 transition-all duration-300"
          style={{ width: `${100 - redAdvantagePct}%` }}
        />
      </div>

      {/* Captured Trays (Compact Mobile & Desktop) */}
      <div className="w-full bg-stone-900/70 border-b border-amber-950/40 px-3 py-1 flex items-center justify-between text-xs shrink-0">
        {/* Black captures */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] text-sky-400/80 font-bold uppercase tracking-wider">AI Lost:</span>
          {capturedBlack.length === 0 ? (
            <span className="text-[10px] text-stone-500 italic">None</span>
          ) : (
            <div className="flex items-center gap-1">
              {capturedBlack.slice(-6).map((p, i) => (
                <span
                  key={i}
                  className="w-5 h-5 rounded-full bg-stone-800 border border-stone-600 text-stone-300 text-[10px] font-bold flex items-center justify-center">
                  {PIECE_NAMES[p.type].black}
                </span>
              ))}
              {capturedBlack.length > 6 && (
                <span className="text-[10px] text-stone-400">+{capturedBlack.length - 6}</span>
              )}
            </div>
          )}
        </div>

        {/* Red captures */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-[10px] text-rose-400/80 font-bold uppercase tracking-wider">You Lost:</span>
          {capturedRed.length === 0 ? (
            <span className="text-[10px] text-stone-500 italic">None</span>
          ) : (
            <div className="flex items-center gap-1">
              {capturedRed.slice(-6).map((p, i) => (
                <span
                  key={i}
                  className="w-5 h-5 rounded-full bg-rose-950/80 border border-rose-700 text-rose-200 text-[10px] font-bold flex items-center justify-center">
                  {PIECE_NAMES[p.type].red}
                </span>
              ))}
              {capturedRed.length > 6 && (
                <span className="text-[10px] text-stone-400">+{capturedRed.length - 6}</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Chessboard Canvas Area */}
      <main className="flex-1 w-full min-h-0 relative flex items-center justify-center bg-stone-950 p-1 sm:p-2 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onPointerDown={handleCanvasClick}
          style={{
            aspectRatio: `${canvasWidth} / ${canvasHeight}`,
            width: `min(100%, calc((100vh - 128px) * ${canvasWidth} / ${canvasHeight}))`,
          }}
          className="h-auto max-w-full max-h-full drop-shadow-2xl rounded-xl cursor-pointer touch-none"
        />

        {/* Check Notification Banner */}
        {checkStatus && (
          <div className="absolute top-3 pointer-events-none animate-bounce">
            <div className="bg-rose-950/95 border-2 border-rose-500 px-4 py-1.5 rounded-full shadow-[0_0_20px_#f43f5e] flex items-center gap-2">
              <Flame size={16} className="text-rose-400 animate-pulse" />
              <span className="text-xs font-black tracking-widest text-rose-200 uppercase">
                {checkStatus === 'red' ? 'Check on Your General!' : 'Check on AI General!'}
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Modern Bottom Action Bar */}
      <footer className="w-full bg-stone-900/95 border-t border-amber-950/50 px-3 py-2 flex items-center justify-around sm:justify-center sm:gap-4 z-20 shrink-0 backdrop-blur-md">
        <button
          onClick={handleUndo}
          disabled={undosRemaining <= 0 || boardHistory.length < 3 || isAiThinking}
          className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 disabled:opacity-35 disabled:cursor-not-allowed border border-stone-700 text-stone-200 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow">
          <Undo2 size={16} className="text-amber-400" />
          <span>Undo ({undosRemaining})</span>
        </button>

        <button
          onClick={handleHint}
          disabled={hintsRemaining <= 0 || currentTurn !== playerSide || isAiThinking}
          className="min-h-[44px] px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-35 disabled:cursor-not-allowed text-stone-950 text-xs font-black flex items-center gap-1.5 transition-all shadow-md active:scale-95">
          <Lightbulb size={16} />
          <span>Hint ({hintsRemaining})</span>
        </button>

        <button
          onClick={() => initGame(aiDifficulty)}
          className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 border border-stone-700 text-stone-200 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow">
          <RotateCw size={15} className="text-amber-400" />
          <span>Restart</span>
        </button>
      </footer>

      {/* --- START MATCH MODAL --- */}
      {gameState.status === 'START' && (
        <MenuOverlay tone="neutral" zIndex={40}>
          <div className="w-full max-w-md bg-stone-900 border-2 border-amber-700/60 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center backdrop-blur-xl">
            {/* Calligraphy Token Emblem */}
            <div className="w-18 h-18 rounded-full bg-gradient-to-br from-amber-100 via-amber-200 to-amber-500 border-3 border-amber-600 flex items-center justify-center text-4xl font-black text-rose-800 shadow-[0_0_24px_rgba(245,158,11,0.4)] mb-3">
              帥
            </div>

            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-100 tracking-wide mb-1">
              XIANGQI REALM
            </h1>
            <p className="text-xs text-amber-200/70 mb-5 font-serif">
              Authentic Chinese Chess Tactical Engine
            </p>

            {/* AI Difficulty Selector */}
            <div className="w-full bg-stone-950/80 p-3 rounded-xl border border-amber-700/30 mb-5">
              <span className="text-xs font-bold text-amber-400 mb-2.5 block uppercase tracking-wider">
                Select Difficulty
              </span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { level: 1, label: 'Novice', icon: Shield, desc: 'Casual' },
                  { level: 2, label: 'Adept', icon: Zap, desc: 'Tactical' },
                  { level: 3, label: 'Master', icon: Award, desc: 'Grandmaster' },
                ].map((diff) => {
                  const Icon = diff.icon;
                  const isSelected = aiDifficulty === diff.level;
                  return (
                    <button
                      key={diff.level}
                      onClick={() => setAiDifficulty(diff.level)}
                      className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                        isSelected
                          ? 'bg-amber-600/30 border-amber-400 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                          : 'bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700'
                      }`}>
                      <Icon size={16} className={isSelected ? 'text-amber-400' : 'text-stone-500'} />
                      <span className="text-xs font-bold">{diff.label}</span>
                      <span className="text-[9px] opacity-75">{diff.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="w-full space-y-2.5">
              <button
                ref={startButtonRef}
                autoFocus
                onClick={() => initGame(aiDifficulty)}
                className="w-full py-3.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 hover:brightness-110 text-stone-950 rounded-xl font-black text-base transition-all shadow-lg flex items-center justify-center gap-2 active:scale-98">
                <Play size={20} />
                <span>PLAY NOW</span>
              </button>

              <button
                onClick={() => setIsRulesOpen(true)}
                className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-xl font-bold text-xs transition-colors border border-stone-700 flex items-center justify-center gap-2">
                <BookOpen size={14} className="text-amber-400" />
                <span>How to Play & Rules</span>
              </button>
            </div>
          </div>
        </MenuOverlay>
      )}

      {/* --- HOW TO PLAY GUIDE MODAL --- */}
      {isRulesOpen && (
        <MenuOverlay tone="neutral" zIndex={50}>
          <div className="w-full max-w-lg bg-stone-900 border-2 border-amber-600/60 rounded-2xl p-6 shadow-2xl flex flex-col text-left">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800 mb-4">
              <h2 className="text-lg font-black text-amber-400 flex items-center gap-2">
                <BookOpen size={18} />
                <span>Xiangqi Master Guide</span>
              </h2>
              <button
                onClick={() => setIsRulesOpen(false)}
                className="p-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300">
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[60vh] space-y-3.5 text-xs text-stone-300 pr-1">
              <div>
                <h4 className="font-bold text-amber-300 mb-1">1. The Board & Palace</h4>
                <p>
                  Played on a 9×10 grid. The 3×3 square marked with an X is the <strong>Palace (九宮)</strong>. The General and Advisors must stay within the Palace.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-amber-300 mb-1">2. Chu River (楚河漢界)</h4>
                <p>
                  The river divides the territories. Elephants cannot cross the river. Soldiers gain the power to move sideways once they cross.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-amber-300 mb-1">3. Piece Movement</h4>
                <ul className="space-y-1.5 list-disc pl-4 mt-1">
                  <li>
                    <strong className="text-amber-200">General (帥/將):</strong> 1 step orthogonally in the palace. Two opposing generals cannot directly face each other on an open file (Flying General rule).
                  </li>
                  <li>
                    <strong className="text-amber-200">Advisor (仕/士):</strong> 1 step diagonally in the palace.
                  </li>
                  <li>
                    <strong className="text-amber-200">Elephant (相/象):</strong> 2 steps diagonally. Cannot cross the river; blocked if the diagonal eye is occupied.
                  </li>
                  <li>
                    <strong className="text-amber-200">Horse (傌/馬):</strong> 1 step orthogonal + 1 step diagonal. Blocked if the adjacent orthogonal step is occupied.
                  </li>
                  <li>
                    <strong className="text-amber-200">Chariot (俥/車):</strong> Moves any number of open squares orthogonally.
                  </li>
                  <li>
                    <strong className="text-amber-200">Cannon (炮/砲):</strong> Moves like a Chariot, but must jump over exactly ONE piece to capture.
                  </li>
                  <li>
                    <strong className="text-amber-200">Soldier (兵/卒):</strong> 1 step forward. After crossing the river, can also step left or right. Never retreats.
                  </li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-amber-300 mb-1">4. Win Conditions</h4>
                <p>
                  Checkmate the opponent's General or cause a Stalemate (in traditional Chinese Chess, having no legal moves is an immediate loss).
                </p>
              </div>
            </div>

            <button
              autoFocus
              onClick={() => setIsRulesOpen(false)}
              className="mt-4 w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-xl text-xs transition-colors">
              CLOSE GUIDE
            </button>
          </div>
        </MenuOverlay>
      )}

      {/* --- GAME OVER & VICTORY OVERLAYS --- */}
      {gameState.status === 'GAME_OVER' && (
        <Overlay
          title="CHECKMATE"
          description={`The AI has triumphed. Final Score: ${gameState.score}`}
          actionLabel="TRY AGAIN"
          onAction={() => initGame(aiDifficulty)}
          icon={<RotateCw size={20} />}
          tone="danger"
        />
      )}

      {gameState.status === 'VICTORY' && (
        <Overlay
          title="GRAND VICTORY"
          description={`Tactical Checkmate achieved! Final Score: ${gameState.score}`}
          actionLabel="PLAY AGAIN"
          onAction={() => initGame(aiDifficulty)}
          icon={<Sparkles size={20} />}
          tone="victory"
        />
      )}
    </div>
  );
}
