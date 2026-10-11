/**
 * Configuration and constants for Xiangqi Realm (Chinese Chess)
 */

export const THEME = {
  primary: '#b91c1c', // Imperial Vermilion
  secondary: '#1e293b', // Deep Slate
  accent: '#f59e0b', // Imperial Gold
  boardWoodLight: '#e2ba7e', // Warm zelkova / beech wood
  boardWoodDark: '#c49553', // Aged zelkova wood
  boardFrameOuter: '#3d2314', // Deep rosewood frame
  boardFrameInner: '#5c351c', // Medium rosewood frame
  gridLine: 'rgba(74, 38, 14, 0.75)', // Deep lacquer line
  gridLineHighlight: 'rgba(245, 230, 200, 0.35)',
  riverText: 'rgba(92, 53, 28, 0.85)',
  highlightMove: '#10b981', // Jade green valid move
  highlightCapture: '#ef4444', // Crimson capture target
  highlightSelected: '#f59e0b', // Golden selection ring
  highlightHint: '#0ea5e9', // Cyan hint
  pieceWoodLight: '#fde5b4', // Boxwood light
  pieceWoodDark: '#e4b673', // Boxwood dark
  pieceWoodShadow: '#784315',
  fontFamily: '"Noto Serif SC", "Kaiti SC", "Songti SC", "SimSun", serif',
};

export const CONFIG = {
  title: {
    value: 'Xiangqi Realm',
    type: 'string',
    label: 'Game Title',
    group: 'GAME',
  },
  baseCanvasWidth: {
    value: 800,
    type: 'number',
    label: 'Base Canvas Width',
    group: 'GAME',
  },
  baseCanvasHeight: {
    value: 1000,
    type: 'number',
    label: 'Base Canvas Height',
    group: 'GAME',
  },
  targetFPS: {
    value: 60,
    type: 'number',
    label: 'Target FPS',
    group: 'SYSTEM',
  },
  stepMs: {
    value: 1000 / 60,
    type: 'number',
    label: 'Step MS',
    group: 'SYSTEM',
  },
  maxSubSteps: {
    value: 5,
    type: 'number',
    label: 'Max Sub Steps',
    group: 'SYSTEM',
  },
  aiDifficulty: {
    value: 2, // 1: Novice, 2: Adept, 3: Grandmaster
    type: 'number',
    label: 'AI Difficulty (1-3)',
    group: 'Rules',
  },
  turnTimeLimit: {
    value: 120, // 120 seconds per turn limit (0 for unlimited)
    type: 'number',
    label: 'Turn Time Limit (s)',
    group: 'Rules',
  },
  maxHintsPerGame: {
    value: 5,
    type: 'number',
    label: 'Max Hints per Match',
    group: 'Rules',
  },
  maxUndosPerGame: {
    value: 8,
    type: 'number',
    label: 'Max Undos per Match',
    group: 'Rules',
  },
  enableMoveSafety: {
    value: true,
    type: 'boolean',
    label: 'Show Danger Warnings',
    group: 'Rules',
  },
  enableRomanizedLabels: {
    value: true,
    type: 'boolean',
    label: 'Show English Piece Subtitles',
    group: 'Rules',
  },
  defaultMusicVolume: {
    value: 0.45,
    type: 'number',
    label: 'Default Music Volume',
    group: 'AUDIO',
  },
  defaultSfxVolume: {
    value: 0.7,
    type: 'number',
    label: 'Default SFX Volume',
    group: 'AUDIO',
  },
  backgroundColor: {
    value: '#090d16',
    type: 'color',
    label: 'Background Color',
    group: 'THEME',
  },
  primaryColor: {
    value: '#e11d48',
    type: 'color',
    label: 'Primary Color',
    group: 'THEME',
  },
  fontFamily: {
    value: 'system-ui, -apple-system, sans-serif',
    type: 'string',
    label: 'Font Family',
    group: 'THEME',
  },

  // Asset dimensions and aspect ratios from metadata
  assetBoardBgAspectRatio: {
    value: 768 / 1376,
    type: 'number',
    label: 'Board Background Aspect Ratio',
    group: 'ASSETS',
  },
  assetBoardBgWidth: {
    value: 768,
    type: 'number',
    label: 'Board Background Width',
    group: 'ASSETS',
  },
  assetBoardBgHeight: {
    value: 1376,
    type: 'number',
    label: 'Board Background Height',
    group: 'ASSETS',
  },
  assetPieceAspectRatio: {
    value: 1.0,
    type: 'number',
    label: 'Piece Token Aspect Ratio',
    group: 'ASSETS',
  },
  assetPieceWidth: {
    value: 72,
    type: 'number',
    label: 'Piece Token Render Width',
    group: 'ASSETS',
  },
  assetPieceHeight: {
    value: 72,
    type: 'number',
    label: 'Piece Token Render Height',
    group: 'ASSETS',
  },
};

// Merge customized config values if present (injected by Playground)
const { playgroundConfig } = globalThis as {
  playgroundConfig?: Record<string, unknown>;
};
if (playgroundConfig) {
  for (const [key, value] of Object.entries(playgroundConfig)) {
    if (key in CONFIG) {
      Object.assign(CONFIG[key as keyof typeof CONFIG], { value });
    }
  }
}

/** Type helper for reading values in game code */
export type ConfigKey = keyof typeof CONFIG;

/**
 * Gets a configuration value by key.
 * @param key The configuration key.
 * @return The configuration value.
 */
export function getConfig<K extends ConfigKey>(
  key: K,
): (typeof CONFIG)[K]['value'] {
  return CONFIG[key].value;
}

export const PRESETS = {};
