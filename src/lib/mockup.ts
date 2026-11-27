export interface TplSpec {
  name: string;
  tagline: string;
  accent: string;
  features: string[];
  pages: string[];
  board: string;
  category: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The page that best shows the real inner UI of a template; used for grid cards. */
export function coverPage(s: TplSpec): number {
  return s.category === 'Games' || s.category === 'SaaS' ? 1 : 0;
}

/* ---------- tiny svg helpers ---------- */
const svg = (vb: string, inner: string) => `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
const r = (x: number, y: number, w: number, h: number, f: string, rx = 0, x2 = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}" ${x2}/>`;
const c = (x: number, y: number, rad: number, f: string, x2 = '') => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${f}" ${x2}/>`;
const el = (x: number, y: number, rx: number, ry: number, f: string) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}"/>`;
const ln = (a: number, b: number, d: number, e: number, st: string, w = 4) => `<line x1="${a}" y1="${b}" x2="${d}" y2="${e}" stroke="${st}" stroke-width="${w}" stroke-linecap="round"/>`;
const t = (x: number, y: number, s: string, f: string, size: number, w = 700, x2 = '') =>
  `<text x="${x}" y="${y}" fill="${f}" font-size="${size}" font-weight="${w}" text-anchor="middle" dominant-baseline="central" font-family="ui-sans-serif,system-ui,sans-serif" ${x2}>${s}</text>`;
const each = (n: number, f: (i: number) => string) => Array.from({ length: n }, (_, i) => f(i)).join('');
const OUT = 'stroke="#000" stroke-width="4" paint-order="stroke"';

/* ---------- GAMES: each returns the real in-play screen ---------- */
const GAMES: Record<string, (a: string) => string> = {
  'Tic-Tac-Toe': (a) => {
    const m = 'XO..XO.OX'.replace('.', '.');
    const grid = ln(140, 24, 140, 376, '#2a3630', 6) + ln(260, 24, 260, 376, '#2a3630', 6) + ln(24, 140, 376, 140, '#2a3630', 6) + ln(24, 260, 376, 260, '#2a3630', 6);
    const cells = each(9, (i) => {
      const x = 80 + (i % 3) * 120, y = 80 + Math.floor(i / 3) * 120;
      const ch = 'XO.' + '.XO' + 'O.X';
      const k = ch[i];
      if (k === 'X') return ln(x - 34, y - 34, x + 34, y + 34, a, 14) + ln(x + 34, y - 34, x - 34, y + 34, a, 14);
      if (k === 'O') return `<circle cx="${x}" cy="${y}" r="34" fill="none" stroke="#eef3ef" stroke-width="12"/>`;
      return '';
    });
    void m;
    return svg('0 0 400 400', r(0, 0, 400, 400, '#121a16', 18) + grid + cells + ln(70, 70, 330, 330, '#fff', 6).replace('stroke-linecap', 'opacity="0.55" stroke-linecap'));
  },
  'Flappy Bird': () =>
    svg('0 0 400 400',
      r(0, 0, 400, 400, '#5ec8f2') + el(80, 70, 38, 14, '#fff') + el(300, 110, 46, 16, '#fff') + el(120, 340, 0, 0, '#000') +
      r(250, 0, 62, 120, '#5fbf3a', 0, 'stroke="#2f7a1b" stroke-width="3"') + r(244, 100, 74, 26, '#6fd043', 3, 'stroke="#2f7a1b" stroke-width="3"') +
      r(250, 250, 62, 100, '#5fbf3a', 0, 'stroke="#2f7a1b" stroke-width="3"') + r(244, 250, 74, 26, '#6fd043', 3, 'stroke="#2f7a1b" stroke-width="3"') +
      r(390, 0, 62, 60, '#5fbf3a') + r(390, 210, 62, 140, '#5fbf3a') +
      r(0, 350, 400, 50, '#ded895') + r(0, 350, 400, 10, '#73bf2e') +
      c(110, 190, 18, '#fbd33b', 'stroke="#222" stroke-width="2.5"') + el(100, 196, 9, 6, '#fff') + c(118, 185, 5.5, '#fff') + c(120, 185, 2.5, '#000') + el(132, 195, 9, 5, '#f97316') +
      t(200, 52, '12', '#fff', 52, 800, OUT)),
  Snake: (a) => {
    const body = [[5, 10], [6, 10], [7, 10], [8, 10], [8, 9], [8, 8], [9, 8], [10, 8], [11, 8], [12, 8], [12, 9]];
    return svg('0 0 400 400',
      r(0, 0, 400, 400, '#0d1711') + each(400, (i) => ((i % 20) + Math.floor(i / 20)) % 2 ? r((i % 20) * 20, Math.floor(i / 20) * 20, 20, 20, '#101d15') : '') +
      body.map(([x, y], i) => r(x * 20 + 1, y * 20 + 1, 18, 18, i === body.length - 1 ? '#fff' : a, 5, `opacity="${0.55 + i / 24}"`)).join('') +
      c(252, 189, 2.5, '#000') + c(262, 189, 2.5, '#000') + c(310, 290, 9, '#ef4444') + ln(310, 281, 316, 273, '#34d399', 3) + t(40, 16, 'Score 110', '#8a968f', 13, 600, 'text-anchor="start"'));
  },
  Chess: (a) => {
    const rows = ['r.bqkb.r', 'pppp.ppp', '..n..n..', '....p...', '..B.P...', '.....N..', 'PPPP.PPP', 'RNBQK..R'];
    const G: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
    return svg('0 0 400 400',
      each(64, (i) => r((i % 8) * 50, Math.floor(i / 8) * 50, 50, 50, ((i % 8) + Math.floor(i / 8)) % 2 ? '#7a5c3a' : '#e8d9b5')) +
      r(200, 200, 50, 50, a, 0, 'opacity=".45"') + r(250, 250, 50, 50, a, 0, 'opacity=".45"') +
      rows.map((row, y) => [...row].map((ch, x) => {
        if (ch === '.') return '';
        const white = ch === ch.toUpperCase();
        return t(x * 50 + 25, y * 50 + 28, G[ch.toLowerCase()], white ? '#fff' : '#111', 40, 400, `stroke="${white ? '#222' : '#ddd'}" stroke-width="1.4"`);
      }).join('')).join(''));
  },
  'Brick Breaker': (a) => {
    const col = ['#ef4444', '#f97316', '#fbbf24', '#34d399', '#7dd3fc'];
    return svg('0 0 400 400',
      r(0, 0, 400, 400, '#0b0f1a', 14) +
      each(40, (i) => { const row = Math.floor(i / 8), cc = i % 8; return (row * 3 + cc * 5) % 7 === 0 ? '' : r(12 + cc * 48, 46 + row * 24, 44, 19, col[row], 4); }) +
      c(236, 292, 5, '#fff', 'opacity=".25"') + c(228, 306, 6, '#fff', 'opacity=".4"') + c(214, 322, 7, '#fff') +
      r(150, 360, 100, 13, a, 7) + t(60, 20, 'SCORE 1,240', '#8a968f', 13, 600) + t(350, 20, '♥ ♥ ♥', '#ef4444', 14));
  },
  '2048': () => {
    const v = [[2, 4, 8, 16], [0, 2, 32, 64], [4, 0, 128, 256], [2, 512, 1024, 0]];
    const col: Record<number, string> = { 0: '#3a3a35', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f' };
    return svg('0 0 400 400', r(0, 0, 400, 400, '#2a2926', 14) + v.map((row, y) => row.map((n, x) => r(12 + x * 97, 12 + y * 97, 88, 88, col[n], 8) + (n ? t(56 + x * 97, 58 + y * 97, String(n), n <= 4 ? '#776e65' : '#fff', n >= 1024 ? 28 : n >= 128 ? 32 : 40, 800) : '')).join('')).join(''));
  },
  Minesweeper: () => {
    const nc = ['', '#7dd3fc', '#34d399', '#f87171', '#a78bfa'];
    return svg('0 0 400 400', each(64, (i) => {
      const x = (i % 8) * 50, y = Math.floor(i / 8) * 50, v = (Math.floor(i / 8) * 7 + (i % 8) * 3) % 11;
      if (v < 4) return r(x + 1, y + 1, 48, 48, '#3b4a43', 4) + r(x + 1, y + 1, 48, 6, '#51635a', 3) + (v === 0 ? t(x + 25, y + 27, '⚑', '#f87171', 26) : '');
      const n = (v - 3) % 5;
      return r(x + 1, y + 1, 48, 48, '#16201b', 3) + (n % 5 ? t(x + 25, y + 27, String(n % 5), nc[n % 5], 26, 800) : '');
    }));
  },
  'Memory Match': (a) => {
    const sy = ['★', '●', '▲', '◆', '♥', '♣', '☾', '✦'];
    const open = [0, 5, 6, 10, 15], ok = [3, 11];
    return svg('0 0 400 400', r(0, 0, 400, 400, '#111a16', 14) + each(16, (i) => {
      const x = 12 + (i % 4) * 97, y = 12 + Math.floor(i / 4) * 97;
      if (open.includes(i) || ok.includes(i)) return r(x, y, 88, 88, '#f4f0e6', 12, ok.includes(i) ? `stroke="#34d399" stroke-width="5"` : '') + t(x + 44, y + 46, sy[i % 8], ['#ef4444', '#2563eb', '#16a34a', '#d97706'][i % 4], 46);
      return r(x, y, 88, 88, a, 12, 'opacity=".85"') + t(x + 44, y + 46, '?', '#0b0f0d', 38, 800);
    }));
  },
  Tetris: () => {
    const C: Record<string, string> = { I: '#22d3ee', O: '#fbbf24', T: '#a78bfa', S: '#34d399', Z: '#f87171', J: '#60a5fa', L: '#fb923c' };
    const stack = ['.......T..', '.OO...TTT.', 'OOZZ..SSL.', 'IZZJJ.LSSL', 'IJJJLLLZZL', 'IOOSSLTZZO'];
    const fall = [[4, 3], [5, 3], [3, 4], [4, 4]];
    return svg('0 0 200 400', r(0, 0, 200, 400, '#0d1210') + each(200, (i) => r((i % 10) * 20, Math.floor(i / 10) * 20, 20, 20, 'none', 0, 'stroke="#18221d" stroke-width="1"')) +
      stack.map((row, y) => [...row].map((k, x) => (k === '.' ? '' : r(x * 20 + 1, (14 + y) * 20 + 1, 18, 18, C[k], 3))).join('')).join('') +
      fall.map(([x, y]) => r(x * 20 + 1, y * 20 + 1, 18, 18, C.S, 3)).join('') +
      [[4, 11], [5, 11], [3, 12], [4, 12]].map(([x, y]) => r(x * 20 + 1, y * 20 + 1, 18, 18, 'none', 3, 'stroke="#34d399" stroke-width="1.5" opacity=".4"')).join(''));
  },
  Pong: (a) =>
    svg('0 0 400 300', r(0, 0, 400, 300, '#080808', 12) + each(15, (i) => r(198, 8 + i * 20, 4, 12, '#444')) + r(14, 110, 10, 70, '#fff', 3) + r(376, 150, 10, 70, '#fff', 3) +
      c(270, 120, 8, a, 'opacity=".25"') + c(250, 130, 8, a, 'opacity=".5"') + c(228, 138, 8, a) + t(150, 44, '3', '#fff', 44, 800) + t(250, 44, '5', '#fff', 44, 800)),
  Sudoku: (a) => {
    const p = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
    const sol = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
    return svg('0 0 396 396', r(0, 0, 396, 396, '#f4f0e6', 8) + r(176, 176, 44, 44, a, 0, 'opacity=".3"') +
      each(81, (i) => {
        const x = (i % 9) * 44, y = Math.floor(i / 9) * 44;
        if (p[i] !== '0') return t(x + 22, y + 23, p[i], '#1b1f1c', 24, 700);
        return i % 5 === 0 ? t(x + 22, y + 23, sol[i], '#2563eb', 24, 600) : '';
      }) + each(10, (i) => ln(i * 44, 0, i * 44, 396, '#1b1f1c', i % 3 ? 1 : 3) + ln(0, i * 44, 396, i * 44, '#1b1f1c', i % 3 ? 1 : 3)));
  },
  'Connect Four': () => {
    const b = ['.......', '.......', '...R...', '..YR...', '..YYR..', '.RYRYR.'];
    return svg('0 0 350 330', r(0, 30, 350, 300, '#1d4ed8', 14) + c(175, 14, 14, '#fbbf24') +
      b.map((row, y) => [...row].map((k, x) => c(25 + x * 50, 55 + y * 50, 20, k === 'R' ? '#ef4444' : k === 'Y' ? '#fbbf24' : '#0b0f1a')).join('')).join(''));
  },
  Hangman: (a) =>
    svg('0 0 400 420', r(0, 0, 400, 420, '#111a16', 14) + ln(40, 340, 200, 340, '#8a968f', 6) + ln(80, 340, 80, 50, '#8a968f', 6) + ln(80, 50, 220, 50, '#8a968f', 6) + ln(220, 50, 220, 90, '#8a968f', 5) +
      `<circle cx="220" cy="115" r="25" fill="none" stroke="#fff" stroke-width="5"/>` + ln(220, 140, 220, 220, '#fff', 5) + ln(220, 160, 190, 195, '#fff', 5) + ln(220, 160, 250, 195, '#fff', 5) + ln(220, 220, 196, 270, '#fff', 5) +
      t(310, 120, 'MISSES', '#8a968f', 13, 600) + t(310, 150, 'X  Z  Q', '#f87171', 22, 700) +
      [...'P L _ N E _'].map((ch, i) => t(70 + i * 24, 385, ch, ch === '_' ? '#8a968f' : a, 28, 800)).join('')),
  'Wordle Clone': () => {
    const g = '#538d4e', y = '#b59f3b', b = '#3a3a3c';
    const rows: [string, string[]][] = [['CRANE', [b, y, b, b, g]], ['SLOPE', [b, b, b, b, g]], ['PLATE', [g, b, g, b, g]], ['PL', []]];
    return svg('0 0 330 400', rows.map(([w, st], ri) => each(5, (i) => {
      const x = 8 + i * 64, yy = 8 + ri * 64, ch = w[i] || '';
      return r(x, yy, 58, 58, st[i] || 'none', 3, st[i] ? '' : `stroke="${ch ? '#818384' : '#3a3a3c'}" stroke-width="2"`) + (ch ? t(x + 29, yy + 31, ch, '#fff', 30, 800) : '');
    })).join('') + each(10, (i) => r(8 + (i % 5) * 64, 264 + Math.floor(i / 5) * 64 - 0, 58, 58, 'none', 3, 'stroke="#3a3a3c" stroke-width="2"')));
  },
  'Space Invaders': () => {
    const col = ['#f87171', '#fbbf24', '#34d399', '#7dd3fc'];
    return svg('0 0 400 400', r(0, 0, 400, 400, '#05070a', 12) +
      each(32, (i) => {
        const row = Math.floor(i / 8), cc = i % 8;
        if ((row * 5 + cc * 3) % 9 === 4) return '';
        const x = 38 + cc * 40, y = 56 + row * 40;
        return r(x, y, 26, 16, col[row], 4) + r(x + 5, y + 5, 4, 4, '#05070a') + r(x + 17, y + 5, 4, 4, '#05070a') + r(x + 2, y + 16, 5, 5, col[row]) + r(x + 19, y + 16, 5, 5, col[row]);
      }) + each(3, (i) => r(50 + i * 120, 296, 56, 26, '#34d399', 6) + r(68 + i * 120, 310, 20, 12, '#05070a')) +
      r(204, 300, 4, 14, '#fff') + r(118, 250, 4, 12, '#f87171') + `<polygon points="200,350 226,372 174,372" fill="#34d399"/>` + r(194, 340, 12, 12, '#34d399') +
      t(60, 20, 'SCORE 0840', '#fff', 13, 600) + t(340, 20, '▲ ▲ ▲', '#34d399', 13));
  },
  'Maze Runner': (a) => {
    const N = 15;
    const wall = (x: number, y: number) => (x === 0 || y === 0 || x === N - 1 || y === N - 1 ? true : x % 2 === 0 && y % 2 === 0 ? true : x % 2 === 0 || y % 2 === 0 ? (x * 7 + y * 13) % 5 < 2 : false);
    return svg('0 0 390 390', r(0, 0, 390, 390, '#0b0f0d', 10) + each(N * N, (i) => { const x = i % N, y = Math.floor(i / N); return wall(x, y) ? r(x * 26 + 1, y * 26 + 1, 24, 24, '#1f3a2e', 6) : ''; }) +
      [[1, 1], [2, 1], [3, 1]].map(([x, y]) => c(x * 26 + 13, y * 26 + 13, 4, a, 'opacity=".5"')).join('') + c(13 + 4 * 26, 39, 9, a) + t(13 + 13 * 26, 13 + 13 * 26, '★', '#fbbf24', 22));
  },
  Checkers: () =>
    svg('0 0 400 400', each(64, (i) => r((i % 8) * 50, Math.floor(i / 8) * 50, 50, 50, ((i % 8) + Math.floor(i / 8)) % 2 ? '#7a5c3a' : '#e8d9b5')) +
      each(64, (i) => {
        const x = i % 8, y = Math.floor(i / 8);
        if ((x + y) % 2 === 0 || (y > 2 && y < 5) || (i * 3 + x) % 7 === 0) return '';
        const red = y > 4;
        return c(x * 50 + 25, y * 50 + 25, 20, red ? '#dc2626' : '#1c1c1c', 'stroke="#fff" stroke-opacity=".25" stroke-width="3"') + (i === 41 ? t(x * 50 + 25, y * 50 + 26, '♛', '#fbbf24', 24) : '');
      })),
  'Whack-a-Mole': () => {
    const up = [1, 4, 8];
    return svg('0 0 400 400', r(0, 0, 400, 400, '#2f7d32', 14) + t(70, 24, 'SCORE 18', '#fff', 15, 800) + t(340, 24, '0:24', '#fff', 15, 800) +
      each(9, (i) => {
        const x = 80 + (i % 3) * 120, y = 110 + Math.floor(i / 3) * 110;
        return el(x, y, 50, 17, '#1b1209') + (up.includes(i) ? r(x - 30, y - 50, 60, 56, '#8b5a2b', 28) + c(x - 12, y - 28, 4, '#000') + c(x + 12, y - 28, 4, '#000') + el(x, y - 16, 8, 6, '#f4a6a6') : '') + el(x, y + 6, 54, 12, '#6b4a2a');
      }));
  },
  'Trivia Quiz': (a) => {
    const opt = ['Jupiter', 'Saturn', 'Uranus', 'Neptune'];
    return `<div style="width:540px;height:100%;background:#121a16;border:1px solid #1f2924;border-radius:16px;padding:22px;display:flex;flex-direction:column;gap:14px;box-shadow:0 20px 60px -20px ${a}">
<div style="display:flex;justify-content:space-between;color:#8a968f;font-size:13px"><span>Question 4 of 10</span><span style="color:${a}">⏱ 0:12</span></div>
<div style="height:6px;background:#1f2924;border-radius:9px"><i style="display:block;width:40%;height:100%;background:${a};border-radius:9px"></i></div>
<h2 style="font-size:24px;margin:8px 0 4px;line-height:1.25">Which planet in our solar system has the most known moons?</h2>
${opt.map((o, i) => `<div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;border:1.5px solid ${i === 1 ? '#34d399' : i === 0 ? '#f87171' : '#2a3630'};background:${i === 1 ? '#34d39922' : i === 0 ? '#f8717122' : '#0f1612'};font-weight:600"><b style="width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:#1f2924;color:${a}">${'ABCD'[i]}</b>${o}<span style="margin-left:auto">${i === 1 ? '✓' : i === 0 ? '✕' : ''}</span></div>`).join('')}
<div style="margin-top:auto;display:flex;justify-content:space-between;color:#8a968f;font-size:13px"><span>Score <b style="color:#fff">300</b></span><span>Streak <b style="color:${a}">3 🔥</b></span></div></div>`.replace('🔥', '');
  },
  'Dino Runner': () =>
    svg('0 0 600 240', r(0, 0, 600, 240, '#f7f7f4', 14) + r(0, 178, 600, 2, '#535353') + each(14, (i) => r(10 + i * 43, 188 + (i % 3) * 6, 10 + (i % 4) * 3, 2, '#9a9a9a')) +
      el(110, 50, 32, 10, '#dcdcd8') + el(420, 70, 40, 11, '#dcdcd8') +
      r(70, 120, 38, 40, '#535353', 4) + r(88, 98, 42, 30, '#535353', 5) + r(116, 106, 6, 6, '#f7f7f4') + r(110, 124, 22, 5, '#f7f7f4') + r(52, 130, 20, 10, '#535353') + r(76, 160, 10, 20, '#535353') + r(94, 160, 10, 14, '#535353') +
      r(320, 128, 14, 52, '#2f7d32', 6) + r(304, 140, 10, 26, '#2f7d32', 5) + r(340, 134, 10, 24, '#2f7d32', 5) + r(440, 142, 12, 38, '#2f7d32', 5) + r(426, 150, 10, 18, '#2f7d32', 5) +
      t(500, 24, 'HI 01284   00342', '#535353', 16, 700)),
};

function game(s: TplSpec): string {
  const f = GAMES[s.name] || GAMES.Pong;
  return f(s.accent);
}

/* ---------- E-COMMERCE ---------- */
const STORE: Record<string, [string, string[]]> = {
  'Aurora Store': ['bag', ['Aurora Tote', 'Dusk Clutch', 'Nova Satchel', 'Lumen Pouch']],
  SneakerHub: ['shoe', ['Air Runner', 'Court Low', 'Trail Pro', 'Street Hi']],
  'Bloom Florist': ['flower', ['Peony Bouquet', 'Tulip Box', 'Rose Dozen', 'Wild Meadow']],
  TechNest: ['phone', ['Nest Phone X', 'Pulse Buds', 'Halo Watch', 'Volt Charger']],
  'Beanline Coffee': ['mug', ['Ethiopia Roast', 'Mocha Blend', 'Cold Brew Kit', 'Ceramic Mug']],
  'Luma Skincare': ['bottle', ['Glow Serum', 'Dew Cream', 'SPF Mist', 'Night Oil']],
  'Homestead Decor': ['box', ['Oak Shelf', 'Linen Throw', 'Ceramic Vase', 'Brass Lamp']],
  'PetPal Supplies': ['toy', ['Chew Bone', 'Cozy Bed', 'Treat Jar', 'Squeaky Ball']],
  'Pageturner Books': ['book', ['The Long Tide', 'Atlas of Dusk', 'Quiet Code', 'Field Notes']],
  'FitGear Pro': ['disc', ['Iron Dumbbell', 'Yoga Mat', 'Resist Bands', 'Shaker Pro']],
  'Jewel and Co': ['ring', ['Halo Ring', 'Pearl Studs', 'Gold Chain', 'Opal Pendant']],
  'Fresh Basket': ['leaf', ['Organic Greens', 'Berry Box', 'Farm Eggs', 'Sourdough']],
  'Kidzone Toys': ['toy', ['Stack Blocks', 'Rocket Set', 'Plush Bear', 'Puzzle Map']],
  'Vinyl Vault': ['disc', ['Blue Hour LP', 'Night Drive LP', 'Soul Sessions', 'Jazz Cuts']],
  'Outdoor Peak': ['bag', ['Summit Pack 40L', 'Trail Tent', 'Ridge Jacket', 'Camp Stove']],
  'Mobile Mart': ['phone', ['Galaxy S', 'Pixel Pro', 'Case Armor', 'Fast Charger']],
  'Artisan Market': ['mug', ['Hand Bowl', 'Woven Basket', 'Clay Mug', 'Linen Apron']],
  'Tea Atelier': ['leaf', ['Jasmine Pearl', 'Earl Grey', 'Matcha Tin', 'Chai Blend']],
  'Print Studio': ['book', ['Poster A2', 'Photo Book', 'Canvas Print', 'Sticker Pack']],
  'Wine Cellar': ['bottle', ['Merlot 2019', 'Chardonnay', 'Rosé Brut', 'Port Reserve']],
};

function glyph(g: string, f: string): string {
  const d = '#0b0f0d';
  const m: Record<string, string> = {
    shoe: `<path d="M8 64V46q22-2 32-18l14 9q6 12 26 15 12 2 12 14v4z" fill="${f}"/><rect x="8" y="68" width="88" height="9" rx="4" fill="#fff" opacity=".9"/><path d="M44 40l6 8M52 44l6 8" stroke="${d}" stroke-width="3"/>`,
    bottle: `<rect x="42" y="6" width="16" height="18" rx="3" fill="#fff" opacity=".9"/><rect x="30" y="22" width="40" height="72" rx="12" fill="${f}"/><rect x="36" y="44" width="28" height="26" rx="4" fill="${d}" opacity=".35"/>`,
    mug: `<rect x="16" y="28" width="52" height="54" rx="9" fill="${f}"/><path d="M68 40h6a12 12 0 010 28h-6" fill="none" stroke="${f}" stroke-width="7"/><path d="M30 12q6 6 0 12M44 12q6 6 0 12" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/>`,
    box: `<polygon points="50,8 92,28 92,72 50,92 8,72 8,28" fill="${f}"/><polygon points="50,8 92,28 50,48 8,28" fill="#fff" opacity=".3"/><line x1="50" y1="48" x2="50" y2="92" stroke="${d}" stroke-width="3" opacity=".4"/>`,
    book: `<rect x="20" y="10" width="62" height="80" rx="5" fill="${f}"/><rect x="20" y="10" width="9" height="80" rx="3" fill="${d}" opacity=".35"/><rect x="38" y="26" width="34" height="5" rx="2" fill="#fff"/><rect x="38" y="38" width="24" height="4" rx="2" fill="#fff" opacity=".7"/>`,
    flower: `${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="50" cy="26" rx="12" ry="18" fill="${f}" transform="rotate(${a} 50 42)"/>`).join('')}<circle cx="50" cy="42" r="9" fill="#fbbf24"/><path d="M50 52v42" stroke="#34d399" stroke-width="5"/>`,
    phone: `<rect x="28" y="6" width="44" height="88" rx="10" fill="${f}"/><rect x="33" y="14" width="34" height="68" rx="5" fill="${d}" opacity=".75"/><circle cx="50" cy="88" r="2.5" fill="#fff"/>`,
    ring: `<circle cx="50" cy="62" r="26" fill="none" stroke="${f}" stroke-width="9"/><polygon points="50,12 62,26 50,40 38,26" fill="#fff"/>`,
    bag: `<path d="M34 38v-8a16 16 0 0132 0v8" fill="none" stroke="${f}" stroke-width="6"/><rect x="16" y="36" width="68" height="54" rx="8" fill="${f}"/><rect x="40" y="50" width="20" height="8" rx="3" fill="${d}" opacity=".4"/>`,
    leaf: `<path d="M14 84Q14 16 86 16Q86 84 14 84Z" fill="${f}"/><path d="M20 80Q46 50 78 22" stroke="#fff" stroke-width="3" fill="none" opacity=".7"/>`,
    toy: `<rect x="14" y="58" width="34" height="30" rx="4" fill="${f}"/><rect x="52" y="58" width="34" height="30" rx="4" fill="#fff" opacity=".9"/><rect x="32" y="26" width="34" height="30" rx="4" fill="#fbbf24"/>`,
    disc: `<circle cx="50" cy="50" r="42" fill="${d}" stroke="${f}" stroke-width="4"/><circle cx="50" cy="50" r="28" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2"/><circle cx="50" cy="50" r="14" fill="${f}"/><circle cx="50" cy="50" r="3" fill="${d}"/>`,
  };
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">${m[g] || m.box}</svg>`;
}

const U = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=70`;
export const PHOTOS: Record<string, string> = {
  'Aurora Store': U('1558769132-cb1aea458c5e'),
  SneakerHub: U('1695073621086-aa692bc32a3d'),
  'Bloom Florist': U('1469317835793-6d02c2392778'),
  TechNest: U('1508873699372-7aeab60b44ab'),
  'Beanline Coffee': U('1506372023823-741c83b836fe'),
  'Luma Skincare': U('1583209814683-c023dd293cc6'),
  'Homestead Decor': U('1724582586529-62622e50c0b3'),
  'PetPal Supplies': U('1585130451336-b0ac5daa3495'),
  'Pageturner Books': U('1625053376622-e462848c453f'),
  'FitGear Pro': U('1534438327276-14e5300c3a48'),
};
let curPhoto = '';
const POS = ['20% 50%', '80% 40%', '50% 20%', '50% 85%'];

const tints = (a: string) => [a, '#ffffff', '#fbbf24', '#7dd3fc'];
const tile = (g: string, a: string, i: number, big = false) =>
  curPhoto
    ? `<div class="tile${big ? ' big' : ''}" style="background:#121a16 url('${curPhoto}') ${POS[i % 4]}/${big ? 'cover' : '260%'} no-repeat"></div>`
    : `<div class="tile${big ? ' big' : ''}" style="background:radial-gradient(circle at 30% 20%,${tints(a)[(i + 1) % 4]}33,#121a16 70%)">${glyph(g, tints(a)[i % 4])}</div>`;

/** True when a template has a scrollable live preview. */
export const hasLive = (s: TplSpec) => s.category === 'E-commerce' && Boolean(PHOTOS[s.name]);
export const LIVE_H = 2300;

/** Full-length interactive storefront: hero, products, accordion, testimonials, footer. */
export function liveHtml(s: TplSpec, tall = false): string {
  const a = esc(s.accent);
  const photo = PHOTOS[s.name];
  const [, names] = STORE[s.name] || ['box', s.features.slice(0, 4)];
  const price = (i: number) => (18 + ((i * 17 + s.name.length * 5) % 60) + i * 11).toFixed(2);
  const F = s.features.length ? s.features : ['Free shipping', 'Easy returns', 'Secure checkout'];
  const faqs = [
    ['Shipping & delivery', 'Orders ship within 24 hours with free tracked delivery on orders over $50.'],
    ['Returns & exchanges', 'Not happy? Return any item within 30 days for a full refund, no questions asked.'],
    ['Secure payment', 'We accept cards, mobile money and wallets, all protected by encrypted checkout.'],
    ['Customer support', 'Our team replies in under 2 hours, every day of the week.'],
  ];
  const reviews = [['Amina K.', 'Beautiful quality and it arrived fast. I will order again.'], ['David M.', 'Exactly as pictured. Checkout was effortless.'], ['Sofia R.', 'Great service, and the team helped me pick the right one.']];
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font:14px/1.55 ui-sans-serif,system-ui,sans-serif;background:#0b0f0d;color:#eef3ef;${tall ? 'overflow:hidden' : ''}}
nav{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:20px;padding:14px 32px;background:#0b0f0dee;border-bottom:1px solid #1f2924}nav b{color:${a};font-size:18px}nav span{color:#9aa79f;margin-left:auto;display:flex;gap:18px}nav i{font-style:normal;border:1px solid #2a3630;border-radius:99px;padding:3px 14px}
.hero{height:420px;background:linear-gradient(90deg,#0b0f0df0 10%,#0b0f0d22),url('${photo}') center/cover;display:flex;flex-direction:column;justify-content:center;padding:0 48px}
.hero small{color:${a};letter-spacing:.14em;font-weight:700}.hero h1{font-size:46px;line-height:1.08;margin:8px 0 12px;max-width:520px}.hero p{color:#c9d3cd;max-width:440px}.btn{display:inline-block;margin-top:18px;width:fit-content;background:${a};color:#0b0f0d;font-weight:700;border-radius:10px;padding:11px 22px}
section{padding:36px 48px}h2{font-size:26px;margin:0 0 4px}.sub{color:#8a968f;margin:0 0 20px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.pc{background:#121a16;border:1px solid #1f2924;border-radius:14px;padding:10px;transition:transform .25s,border-color .25s}.pc:hover{transform:translateY(-4px);border-color:${a}}.ph{height:170px;border-radius:10px;background-color:#1a2520;background-repeat:no-repeat}.pc h4{margin:10px 0 2px}.pr{display:flex;justify-content:space-between}.pr b{color:${a}}.pr em{font-style:normal;color:#fbbf24;font-size:12px}.add{display:block;text-align:center;margin-top:8px;border:1px solid ${a};color:${a};border-radius:8px;padding:5px;font-size:12px;font-weight:600}
.feat{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.feat div{background:#121a16;border:1px solid #1f2924;border-radius:14px;padding:18px}.feat b{color:${a}}
details{background:#121a16;border:1px solid #1f2924;border-radius:12px;margin-bottom:10px;padding:14px 18px}summary{cursor:pointer;font-weight:600;list-style:none;display:flex;justify-content:space-between}summary::after{content:'+';color:${a};font-size:20px;line-height:1}details[open] summary::after{content:'−'}details[open]{border-color:${a}}details p{color:#9aa79f;margin:10px 0 0}
.rev{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.rev div{background:#121a16;border:1px solid #1f2924;border-radius:14px;padding:18px}.rev .st{color:#fbbf24}.rev p{margin:8px 0;color:#c9d3cd}
footer{background:#080b09;border-top:1px solid #1f2924;padding:30px 48px;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:20px;color:#8a968f}footer b{color:#eef3ef;display:block;margin-bottom:6px}
</style></head><body>
<nav><b>${esc(s.name)}</b><span><u style="text-decoration:none">Shop</u><u style="text-decoration:none">About</u><u style="text-decoration:none">Contact</u></span><i>Cart (2)</i></nav>
<div class="hero"><small>NEW COLLECTION</small><h1>${esc(s.tagline)}</h1><p>${F.slice(0, 3).map(esc).join(' · ')}</p><span class="btn">Shop now</span></div>
<section><h2>Popular products</h2><p class="sub">Customer favourites this week</p><div class="grid">${names.map((n, i) => `<div class="pc"><div class="ph" style="background-image:url('${photo}');background-position:${POS[i % 4]};background-size:300%"></div><h4>${esc(n)}</h4><div class="pr"><b>$${price(i)}</b><em>★ 4.${9 - i}</em></div><span class="add">Add to cart</span></div>`).join('')}</div></section>
<section><h2>Why shop with us</h2><p class="sub">Everything handled, start to finish</p><div class="feat">${F.slice(0, 3).map((f) => `<div><b>${esc(f)}</b><p style="color:#9aa79f">Built into every order, at no extra cost.</p></div>`).join('')}</div></section>
<section><h2>Questions, answered</h2><p class="sub">Tap a question to expand it</p>${faqs.map(([q, ans], i) => `<details${i === 0 ? ' open' : ''}><summary>${q}</summary><p>${ans}</p></details>`).join('')}</section>
<section><h2>What customers say</h2><p class="sub">Over 2,000 five-star reviews</p><div class="rev">${reviews.map(([n, tx]) => `<div><span class="st">★★★★★</span><p>“${tx}”</p><b>${n}</b></div>`).join('')}</div></section>
<footer><div><b style="color:${a}">${esc(s.name)}</b>${esc(s.tagline)}</div><div><b>Shop</b>New<br>Popular<br>Sale</div><div><b>Help</b>Shipping<br>Returns<br>FAQ</div><div><b>Contact</b>hello@${esc(s.name.toLowerCase().replace(/[^a-z]/g, ''))}.com</div></footer>
</body></html>`;
}

function store(s: TplSpec, page: number, a: string): string {
  curPhoto = PHOTOS[s.name] || '';
  const [g, names] = STORE[s.name] || ['box', s.features.slice(0, 4)];
  const price = (i: number) => (18 + ((i * 17 + s.name.length * 5) % 60) + i * 11).toFixed(2);
  const bar = `<div class="shop"><b>${esc(s.name)}</b><div class="search">Search ${esc(names[0].split(' ')[0].toLowerCase())}…</div><span class="cart">Cart (${page === 2 ? 3 : 2})</span></div>`;
  if (page === 0)
    return bar + `<div class="chips"><u class="a">All</u><u>New</u><u>Popular</u><u>Sale -20%</u><u>Gifts</u></div>
<div class="banner"><div><small>NEW SEASON</small><h1>${esc(s.tagline)}</h1><span class="btn">Shop collection</span></div>${tile(g, a, 0, true)}</div>
<div class="pgrid">${names.map((n, i) => `<div class="pc">${tile(g, a, i)}<h4>${esc(n)}</h4><div class="pr"><b>$${price(i)}</b><em>★ 4.${9 - i}</em></div><span class="add">Add to cart</span></div>`).join('')}</div>`;
  if (page === 1)
    return bar + `<div class="split pd">${tile(g, a, 0, true)}<div><small class="crumb">Home / ${esc(s.name)} / ${esc(names[0])}</small><h1>${esc(names[0])}</h1><p class="stars">★★★★★ <span>128 reviews</span></p><h2 class="big">$${price(0)}</h2><p>${esc(s.tagline)}</p>
<div class="opts"><u class="a">S</u><u>M</u><u>L</u><u>XL</u></div><div class="opts">${tints(a).map((x) => `<i style="background:${x}"></i>`).join('')}</div>
<div style="display:flex;gap:10px;margin-top:16px"><span class="qty">− 1 +</span><span class="btn" style="margin:0;flex:1;text-align:center">Add to cart</span></div><ul>${s.features.slice(0, 3).map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div></div>`;
  return bar + `<div class="cartw"><div class="cl">${names.slice(0, 3).map((n, i) => `<div class="crow"><div class="th">${tile(g, a, i)}</div><div><h4>${esc(n)}</h4><small>Size M · In stock</small></div><span class="qty">− ${i + 1} +</span><b>$${(Number(price(i)) * (i + 1)).toFixed(2)}</b></div>`).join('')}</div>
<div class="sum"><h3>Order summary</h3><p><span>Subtotal</span><b>$${names.slice(0, 3).reduce((x, _n, i) => x + Number(price(i)) * (i + 1), 0).toFixed(2)}</b></p><p><span>Shipping</span><b>Free</b></p><p><span>Promo</span><b>-$5.00</b></p><span class="btn" style="display:block;text-align:center">Checkout</span></div></div>`;
}

/* ---------- SAAS ---------- */
const SAAS: Record<string, { v: string; cols?: string[] }> = {
  TaskFlow: { v: 'kanban' }, InvoiceEasy: { v: 'table', cols: ['Invoice', 'Client', 'Amount', 'Status'] }, MetricsHQ: { v: 'line' }, SupportDesk: { v: 'inbox' },
  HireLoop: { v: 'pipeline' }, 'DocuSign Lite': { v: 'editor' }, FormForge: { v: 'editor' }, ChatPilot: { v: 'chat' }, CalSync: { v: 'calendar' }, 'CodeReview AI': { v: 'code' },
  SocialPlanner: { v: 'calendar' }, StockWatch: { v: 'line' }, 'HR Compass': { v: 'table', cols: ['Employee', 'Role', 'Team', 'Status'] }, NoteNest: { v: 'editor' },
  UptimePulse: { v: 'status' }, SurveyBee: { v: 'bars' }, LedgerLite: { v: 'table', cols: ['Date', 'Account', 'Debit', 'Credit'] }, ClassBoard: { v: 'table', cols: ['Student', 'Class', 'Grade', 'Attendance'] },
  DevPortal: { v: 'code' }, 'CRM Spark': { v: 'pipeline' },
};
const pill = (txt: string, col: string) => `<span class="pill" style="color:${col};background:${col}22">${txt}</span>`;

function saasBody(s: TplSpec, v: string, a: string): string {
  const F = s.features.map(esc);
  const f = (i: number) => F[i % Math.max(F.length, 1)] || 'Item';
  if (v === 'kanban')
    return `<div class="kan">${['To do', 'In progress', 'Done'].map((col, ci) => `<div class="kc"><h5>${col} <em>${3 - ci + 1}</em></h5>${[0, 1, 2].slice(0, 3 - (ci === 1 ? 1 : 0)).map((i) => `<div class="kt"><p>${f(i + ci)}</p><div class="bars"><i style="width:${70 - i * 18}%"></i></div><div class="meta">${pill(['Design', 'Dev', 'Review'][(i + ci) % 3], ['#a78bfa', a, '#fbbf24'][(i + ci) % 3])}<span class="av"></span></div></div>`).join('')}</div>`).join('')}</div>`;
  if (v === 'table') {
    const cols = SAAS[s.name]?.cols || ['Name', 'Type', 'Date', 'Status'];
    const nm = ['Acme Corp', 'Northwind', 'Globex', 'Initech', 'Umbrella', 'Hooli'];
    const st = [['Paid', '#34d399'], ['Pending', '#fbbf24'], ['Overdue', '#f87171']];
    return `<div class="tbl"><div class="th2">${cols.map((x) => `<span>${x}</span>`).join('')}</div>${nm.map((n, i) => `<div class="tr">${[`#${1040 + i}`, n, `$${(i + 3) * 410}.00`].map((x) => `<span>${x}</span>`).join('')}<span>${pill(st[i % 3][0], st[i % 3][1])}</span></div>`).join('')}</div>`;
  }
  if (v === 'line')
    return `<div class="two"><div class="panel"><h5>${f(0)} · last 30 days</h5>${svg('0 0 400 170', `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}" stop-opacity=".45"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></linearGradient></defs>${each(4, (i) => ln(0, 20 + i * 42, 400, 20 + i * 42, '#1f2924', 1))}<path d="M0 140 L40 120 L80 130 L120 90 L160 100 L200 60 L240 78 L280 40 L320 56 L360 24 L400 34 L400 170 L0 170Z" fill="url(#g)"/><path d="M0 140 L40 120 L80 130 L120 90 L160 100 L200 60 L240 78 L280 40 L320 56 L360 24 L400 34" fill="none" stroke="${a}" stroke-width="3"/>`)}</div><div class="panel"><h5>Top sources</h5>${['Direct', 'Search', 'Social', 'Email'].map((x, i) => `<div class="hb"><span>${x}</span><div class="bars"><i style="width:${80 - i * 17}%"></i></div></div>`).join('')}</div></div>`;
  if (v === 'inbox')
    return `<div class="inbx"><div class="il">${['Refund request', 'Login issue', 'Billing question', 'Feature idea', 'Shipping delay'].map((x, i) => `<div class="im${i === 0 ? ' a' : ''}"><b>${x}</b><small>${['Maya', 'Tom', 'Ines', 'Jo', 'Kai'][i]} · ${i + 2}m ago</small></div>`).join('')}</div><div class="panel"><h5>Refund request ${pill('Open', '#fbbf24')}</h5><div class="bub">Hi, I was charged twice for my order. Can you help?</div><div class="bub me">Of course — I've started the refund. You'll see it in 2–3 days.</div><div class="reply">Write a reply…</div></div></div>`;
  if (v === 'chat')
    return `<div class="panel chat"><div class="bub">What can ${esc(s.name)} do for my team?</div><div class="bub me">${f(0)}, ${f(1)} and ${f(2)} — all in one place.</div><div class="bub">Can it answer customers 24/7?</div><div class="bub me typing">● ● ●</div><div class="reply">Message ${esc(s.name)}…</div></div>`;
  if (v === 'calendar')
    return `<div class="cal">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<h6>${d}</h6>`).join('')}${each(28, (i) => `<div class="cd"><small>${i + 1}</small>${i % 5 === 1 ? `<span class="ev">${f(i)}</span>` : i % 7 === 3 ? `<span class="ev b">Review</span>` : ''}</div>`)}</div>`;
  if (v === 'editor')
    return `<div class="doc"><div class="tool">${['B', 'I', 'U', '≡', '⌗', '✎'].map((x) => `<u>${x}</u>`).join('')}<span style="margin-left:auto">${pill('Saved', '#34d399')}</span></div><div class="page"><h2>${esc(s.name)} — ${f(0)}</h2><div class="ln w90"></div><div class="ln w80"></div><div class="ln w95"></div><div class="ln w60"></div><h3>${f(1)}</h3><div class="ln w90"></div><div class="ln w70"></div><div class="sig"><span>Signature</span><em>${esc(s.name.split(' ')[0])}</em></div></div></div>`;
  if (v === 'code')
    return `<div class="code">${[['', 'src/review.ts', 'h'], ['-', 'const result = await run(input)', 'd'], ['+', 'const result = await run(input, { retries: 2 })', 'a'], ['', 'if (!result.ok) return fail(result)', ''], ['+', 'logger.info("passed", result.id)', 'a'], ['-', 'return result', 'd'], ['+', 'return finalize(result)', 'a']].map(([m, tx, k], i) => `<div class="cl2 ${k}"><u>${i + 12}</u><b>${m}</b><code>${esc(tx)}</code></div>`).join('')}<div class="note">${pill('AI review', a)} Consider handling timeouts in <code>run()</code>.</div></div>`;
  if (v === 'bars')
    return `<div class="panel"><h5>How satisfied are you with ${esc(s.name)}?</h5>${['Very satisfied 54%', 'Satisfied 28%', 'Neutral 11%', 'Unhappy 7%'].map((x, i) => `<div class="hb"><span>${x.split(' ').slice(0, -1).join(' ')}</span><div class="bars"><i style="width:${[54, 28, 11, 7][i] * 1.5}%"></i></div><b>${x.split(' ').pop()}</b></div>`).join('')}</div>`;
  if (v === 'pipeline')
    return `<div class="two"><div class="panel"><h5>Pipeline</h5>${['New 120', 'Qualified 84', 'Proposal 46', 'Won 21'].map((x, i) => `<div class="fn" style="width:${100 - i * 20}%;opacity:${1 - i * 0.15}">${x}</div>`).join('')}</div><div class="panel"><h5>Recent</h5>${['Acme · $12k', 'Globex · $8k', 'Hooli · $21k', 'Initech · $5k'].map((x) => `<div class="hb"><span>${x}</span>${pill(['Hot', 'Warm', 'Hot', 'New'][x.length % 4], a)}</div>`).join('')}</div></div>`;
  return `<div class="panel"><h5>Status</h5>${['API', 'Website', 'Database', 'Payments', 'Auth'].map((x, i) => `<div class="up"><span>${x}</span><div>${each(32, (j) => `<i style="background:${(i * 7 + j * 3) % 29 === 0 ? '#f87171' : (i + j) % 17 === 0 ? '#fbbf24' : '#34d399'}"></i>`)}</div><b>99.${9 - (i % 3)}%</b></div>`).join('')}</div>`;
}

function saasApp(s: TplSpec, a: string, titleIdx: number): string {
  const v = SAAS[s.name]?.v || 'line';
  const F = s.features.slice(0, 4).map(esc);
  const kp = [['Active', '1,284', '+12%'], ['Growth', '8.4%', '+2.1%'], ['Revenue', '$24.6k', '+9%']];
  return `<div class="app"><aside><b class="logo">${esc(s.name)}</b>${F.map((x, i) => `<span class="${i === titleIdx ? 'on' : ''}">${x}</span>`).join('')}<small>Workspace</small><span>Settings</span></aside><main><div class="top"><h3>${F[titleIdx] || esc(s.name)}</h3><div class="srch">Search…</div><i class="av"></i></div>
<div class="kp">${kp.map(([k, val, d]) => `<div class="card"><small>${k}</small><h4>${val}</h4><em>${d}</em></div>`).join('')}</div>${saasBody(s, v, a)}</main></div>`;
}

function saas(s: TplSpec, page: number, a: string): string {
  const nav = `<nav><b>${esc(s.name)}</b><span>${s.pages.map((x, i) => `<u class="${i === page ? 'a' : ''}">${esc(x)}</u>`).join('')}</span></nav>`;
  if (page === 1) return saasApp(s, a, 0);
  if (page === 0)
    return nav + `<div class="lp"><div><small class="chip">${esc(s.category)}</small><h1>${esc(s.tagline)}</h1><p>${s.features.map(esc).join(' · ')}</p><span class="btn">Start free</span></div><div class="mini">${saasApp(s, a, 1)}</div></div>`;
  return nav + `<div class="hero sm"><h1>Simple pricing</h1><p>${esc(s.tagline)}</p></div><div class="pgrid three">${[['Starter', '$9', 0], ['Pro', '$29', 1], ['Team', '$79', 0]].map(([n, p, hot]) => `<div class="pc plan${hot ? ' hot' : ''}"><h4>${n}</h4><h2 class="big">${p}<small>/mo</small></h2>${s.features.slice(0, 3).map((x) => `<p class="chk">✓ ${esc(x)}</p>`).join('')}<span class="btn" style="display:block;text-align:center">Choose ${n}</span></div>`).join('')}</div>`;
}

/* ---------- LEAD GEN ---------- */
const LEAD: Record<string, [string, string[]]> = {
  'LeadGen AI': ['funnel', ['Name', 'Work email', 'Company']], Funnelly: ['funnel', ['Name', 'Email', 'Phone']], 'Webinar Magnet': ['video', ['Name', 'Email']],
  QuoteFast: ['quote', ['ZIP code', 'Email', 'Phone']], 'Ebook Capture': ['ebook', ['First name', 'Email']], 'Solar Leads': ['sun', ['Address', 'Monthly bill', 'Email']],
  'Agency Pitch': ['calendar', ['Name', 'Email', 'Budget']], 'Mortgage Match': ['quote', ['Home price', 'Down payment', 'Email']], 'Gym Trial Pass': ['ticket', ['Name', 'Phone', 'Goal']],
  'Dental Booker': ['calendar', ['Name', 'Phone', 'Preferred date']], 'Course Waitlist': ['video', ['Name', 'Email']], 'Legal Intake': ['shield', ['Name', 'Case type', 'Phone']],
  'Realtor Valuation': ['house', ['Address', 'Email', 'Phone']], 'Newsletter Pro': ['mail', ['Email']], 'Event RSVP': ['ticket', ['Name', 'Email', 'Guests']],
  'Coach Discovery': ['calendar', ['Name', 'Email', 'Your goal']], 'Insurance Compare': ['quote', ['ZIP code', 'Age', 'Email']], 'App Beta Signup': ['phone', ['Email', 'Device']],
  'Cleaning Quote': ['house', ['Rooms', 'ZIP code', 'Email']], 'Podcast Guest Form': ['mic', ['Name', 'Email', 'Topic']],
};

function leadVisual(k: string, a: string): string {
  const w = '#eef3ef';
  const m: Record<string, string> = {
    funnel: `<polygon points="20,8 180,8 150,36 50,36" fill="${a}" opacity=".9"/><polygon points="50,42 150,42 128,66 72,66" fill="${a}" opacity=".6"/><polygon points="72,72 128,72 112,94 88,94" fill="${a}" opacity=".35"/>`,
    video: `${r(20, 6, 160, 88, '#0b0f0d', 10, `stroke="${a}" stroke-width="2"`)}<polygon points="92,36 92,64 118,50" fill="${a}"/>${r(30, 80, 140, 4, '#2a3630', 2)}${r(30, 80, 70, 4, a, 2)}`,
    quote: `${t(100, 30, '$42/mo', w, 28, 800)}${r(30, 64, 140, 6, '#2a3630', 3)}${r(30, 64, 90, 6, a, 3)}${c(120, 67, 9, a)}`,
    ebook: `${r(66, 6, 70, 90, a, 6, 'transform="rotate(-6 100 50)"')}${r(76, 22, 46, 6, '#0b0f0d', 3, 'transform="rotate(-6 100 50)"')}${r(76, 34, 34, 5, '#0b0f0d', 2, 'transform="rotate(-6 100 50)" opacity=".6"')}`,
    sun: `${c(60, 34, 16, '#fbbf24')}${each(8, (i) => ln(60 + Math.cos(i * 0.785) * 22, 34 + Math.sin(i * 0.785) * 22, 60 + Math.cos(i * 0.785) * 30, 34 + Math.sin(i * 0.785) * 30, '#fbbf24', 3))}${r(96, 44, 80, 44, '#1d4ed8', 4)}${each(3, (i) => ln(96 + (i + 1) * 20, 44, 96 + (i + 1) * 20, 88, '#0b0f0d', 2))}${ln(96, 66, 176, 66, '#0b0f0d', 2)}`,
    calendar: each(6, (i) => r(14 + (i % 3) * 62, 14 + Math.floor(i / 3) * 40, 56, 32, i === 4 ? a : 'none', 8, `stroke="${a}" stroke-width="2"`) + t(42 + (i % 3) * 62, 31 + Math.floor(i / 3) * 40, ['9:00', '10:30', '12:00', '14:00', '15:30', '17:00'][i], i === 4 ? '#0b0f0d' : w, 13, 700)),
    ticket: `${r(20, 20, 160, 60, a, 10)}${c(20, 50, 9, '#121a16')}${c(180, 50, 9, '#121a16')}${ln(130, 26, 130, 74, '#0b0f0d', 2)}${t(75, 50, 'ADMIT ONE', '#0b0f0d', 16, 800)}`,
    house: `<polygon points="100,8 170,48 30,48" fill="${a}"/>${r(44, 48, 112, 46, w, 3, 'opacity=".9"')}${r(90, 62, 22, 32, '#0b0f0d', 3)}${r(54, 58, 22, 18, a, 2, 'opacity=".6"')}${r(126, 58, 22, 18, a, 2, 'opacity=".6"')}`,
    mail: `${r(26, 18, 148, 66, w, 8, 'opacity=".92"')}<polyline points="26,22 100,64 174,22" fill="none" stroke="${a}" stroke-width="5"/>${c(168, 20, 12, '#f87171')}`,
    phone: `${r(70, 4, 60, 92, '#0b0f0d', 12, `stroke="${a}" stroke-width="3"`)}${r(78, 18, 44, 10, a, 3)}${r(78, 34, 44, 24, a, 4, 'opacity=".4"')}${r(78, 64, 30, 6, '#2a3630', 3)}`,
    shield: `<path d="M100 6 L168 24 V54 Q168 84 100 96 Q32 84 32 54 V24Z" fill="${a}"/><polyline points="72,50 94,70 130,34" fill="none" stroke="#0b0f0d" stroke-width="8" stroke-linecap="round"/>`,
    mic: `${r(80, 6, 40, 56, a, 20)}<path d="M64 46q0 32 36 32t36-32" fill="none" stroke="${w}" stroke-width="5"/>${ln(100, 78, 100, 94, w, 5)}${ln(80, 94, 120, 94, w, 5)}`,
  };
  return `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">${m[k] || m.funnel}</svg>`;
}

function lead(s: TplSpec, page: number, a: string): string {
  const [vis, fields] = LEAD[s.name] || ['funnel', ['Name', 'Email']];
  const nav = `<nav><b>${esc(s.name)}</b><span>${s.pages.map((x, i) => `<u class="${i === page ? 'a' : ''}">${esc(x)}</u>`).join('')}</span></nav>`;
  const F = s.features.map(esc);
  if (page === 0)
    return nav + `<div class="split lg"><div><small class="chip">${esc(s.category)}</small><h1>${esc(s.tagline)}</h1><div class="ck">${F.map((x) => `<p class="chk">✓ ${x}</p>`).join('')}</div><div class="proof"><span><i></i><i></i><i></i><i></i></span><small><b>1,200+</b> people joined this month</small></div></div>
<div class="fcard"><div class="vis">${leadVisual(vis, a)}</div><h3>Get started free</h3>${fields.map((f) => `<label>${esc(f)}<i></i></label>`).join('')}<span class="btn" style="display:block;text-align:center;margin-top:14px">${esc(s.pages[1] === 'Funnel' ? 'Start now' : 'Get my access')}</span><small class="fine">No spam. Unsubscribe anytime.</small></div></div>`;
  if (page === 1)
    return nav + `<div class="stepw"><small>Step 2 of 3</small><div class="bars" style="height:8px"><i style="width:66%"></i></div><h1>${F[0] || esc(s.name)}: what matters most to you?</h1><div class="opt4">${['Save time', 'Grow revenue', 'Cut costs', 'Look professional'].map((x, i) => `<div class="op${i === 1 ? ' sel' : ''}">${i === 1 ? '✓ ' : ''}${x}</div>`).join('')}</div><span class="btn">Continue →</span></div>`;
  return nav + `<div class="thanks"><div class="ok">✓</div><h1>You're in!</h1><p>${esc(s.name)} will be in touch shortly.</p><div class="sumbox">${fields.map((f) => `<p><span>${esc(f)}</span><b>••••••</b></p>`).join('')}</div><div class="next">${F.slice(0, 3).map((x, i) => `<span><b>${i + 1}</b>${x}</span>`).join('')}</div></div>`;
}

/** Renders one page of a template as a standalone HTML mockup of the real app/game UI. All text comes from the spec, which is also what the prompt is built from. */
export function pageHtml(s: TplSpec, page: number): string {
  const a = esc(s.accent);
  const p = s.pages[page] || s.pages[0];
  const nav = `<nav><b>${esc(s.name)}</b><span>${s.pages.map((x, i) => `<u class="${i === page ? 'a' : ''}">${esc(x)}</u>`).join('')}</span></nav>`;
  let body = '';
  if (s.category === 'Games') {
    const stage = `<div class="stage">${game(s)}</div>`;
    if (page === 0)
      body = nav + `<div class="menu">${stage}<div class="ov"><h1>${esc(s.name)}</h1><p>${esc(s.tagline)}</p><span class="btn">▶ Play</span><small>${s.features.slice(0, 3).map(esc).join(' · ')}</small></div></div>`;
    else if (page === 1)
      body = nav + `<main class="gm"><div class="hud"><span>Score <b>${(s.name.length * 37) % 400 + 60}</b></span><span>${esc(s.name)}</span><span>Best <b>1,280</b></span></div>${stage}<div class="hint">${s.features.slice(0, 3).map((f) => `<u>${esc(f)}</u>`).join('')}</div></main>`;
    else
      body = nav + `<div class="hero sm"><h1>Leaderboard</h1><p>${esc(s.name)} · all time</p></div><div class="list">${['Ava', 'Kofi', 'Mina', 'Leo', 'Zed', 'Nia'].map((n, i) => `<div class="row"><b>${i + 1}</b><span>${n}</span><em>${(6 - i) * 240}</em></div>`).join('')}</div>`;
  } else if (s.category === 'E-commerce') body = store(s, page, a);
  else if (s.category === 'SaaS') body = saas(s, page, a);
  else body = lead(s, page, a);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(p)}</title><style>
*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}body{font:14px/1.5 ui-sans-serif,system-ui,sans-serif;background:#0b0f0d;color:#eef3ef;--a:${a}}
nav{display:flex;justify-content:space-between;align-items:center;padding:12px 28px;border-bottom:1px solid #1f2924}nav b{color:var(--a)}nav span{display:flex;gap:18px}nav u{text-decoration:none;color:#8a968f}nav u.a{color:#fff}
h1{font-size:clamp(24px,3.4vw,38px);line-height:1.12;margin:6px 0 10px}p{color:#9aa79f;margin:0}small{color:#8a968f}.btn{display:inline-block;margin-top:18px;background:var(--a);color:#0b0f0d;font-weight:700;border-radius:10px;padding:10px 20px}
.hero{text-align:center;padding:40px 24px 20px}.hero.sm{padding:22px}.chip{display:inline-block;border:1px solid var(--a);color:var(--a);border-radius:99px;padding:2px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.06em}
.big{font-size:34px;margin:6px 0}.big small{font-size:14px}
/* games */
.gm{display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px}.hud{display:flex;justify-content:space-between;width:min(560px,100%);color:#8a968f}.hud b{color:var(--a)}
.stage{height:455px;display:flex;align-items:center;justify-content:center}.stage svg{height:100%;width:auto;max-width:900px;border-radius:14px;box-shadow:0 0 0 1px #1f2924,0 24px 70px -24px var(--a)}.hint{display:flex;gap:8px}.hint u{text-decoration:none;font-size:12px;border:1px solid #2a3630;border-radius:99px;padding:2px 10px;color:#9aa79f}
.menu{position:relative}.menu .stage{height:590px;opacity:.28;filter:blur(1px)}.ov{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.ov h1{font-size:52px}
.list{max-width:560px;margin:0 auto;padding:0 24px;display:grid;gap:8px}.row{display:flex;gap:12px;align-items:center;background:#121a16;border:1px solid #1f2924;border-radius:12px;padding:12px 16px}.row b{color:var(--a)}.row span{flex:1}.row em{font-style:normal;color:var(--a)}
/* store */
.shop{display:flex;align-items:center;gap:16px;padding:12px 28px;border-bottom:1px solid #1f2924}.shop b{color:var(--a);font-size:17px}.search{flex:1;max-width:380px;margin:0 auto;background:#121a16;border:1px solid #1f2924;border-radius:99px;padding:6px 16px;color:#6b7770}.cart{background:#121a16;border:1px solid #2a3630;border-radius:99px;padding:5px 14px}
.chips{display:flex;gap:8px;padding:12px 28px}.chips u{text-decoration:none;border:1px solid #2a3630;border-radius:99px;padding:3px 14px;color:#9aa79f}.chips u.a{background:var(--a);color:#0b0f0d;border-color:var(--a)}
.banner{display:grid;grid-template-columns:1.3fr 1fr;gap:20px;margin:0 28px 14px;padding:20px 28px;border-radius:18px;background:linear-gradient(120deg,color-mix(in srgb,var(--a) 25%,#121a16),#121a16);align-items:center}.banner h1{font-size:30px}.banner .tile{height:150px}.banner small{color:var(--a);letter-spacing:.1em}
.tile{display:grid;place-items:center;border-radius:12px;height:150px;border:1px solid #1f2924}.tile svg{height:72%;width:auto}.tile.big{height:100%;min-height:150px}
.pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding:0 28px}.pgrid.three{grid-template-columns:repeat(3,1fr);max-width:820px;margin:0 auto}.pc{background:#121a16;border:1px solid #1f2924;border-radius:14px;padding:10px}.pc h4{margin:10px 0 2px;font-size:14px}.pr{display:flex;justify-content:space-between}.pr b{color:var(--a)}.pr em{font-style:normal;color:#fbbf24;font-size:12px}.add{display:block;text-align:center;margin-top:8px;border:1px solid var(--a);color:var(--a);border-radius:8px;padding:4px;font-size:12px;font-weight:600}
.split{display:grid;grid-template-columns:1fr 1fr;gap:32px;padding:28px;align-items:center}.pd .tile.big{height:430px}.crumb{font-size:12px}.stars{color:#fbbf24}.stars span{color:#8a968f}.opts{display:flex;gap:8px;margin-top:12px}.opts u{text-decoration:none;border:1px solid #2a3630;border-radius:8px;padding:4px 14px}.opts u.a{border-color:var(--a);color:var(--a)}.opts i{width:24px;height:24px;border-radius:99px;display:block;border:2px solid #0b0f0d;outline:1px solid #2a3630}.qty{border:1px solid #2a3630;border-radius:10px;padding:10px 16px}ul{color:#9aa79f;padding-left:18px}
.cartw{display:grid;grid-template-columns:1.6fr 1fr;gap:20px;padding:24px 28px}.cl{display:grid;gap:10px;align-content:start}.crow{display:grid;grid-template-columns:72px 1fr auto 80px;gap:14px;align-items:center;background:#121a16;border:1px solid #1f2924;border-radius:14px;padding:10px}.crow .th .tile{height:64px}.crow h4{margin:0}.sum{background:#121a16;border:1px solid #1f2924;border-radius:14px;padding:18px;height:fit-content}.sum h3{margin:0 0 10px}.sum p{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1f2924}
/* saas */
.app{display:grid;grid-template-columns:180px 1fr;height:100vh}.app aside{border-right:1px solid #1f2924;padding:16px 12px;display:flex;flex-direction:column;gap:4px;background:#0e1411}.app aside .logo{color:var(--a);font-size:16px;margin-bottom:12px}.app aside span{padding:7px 10px;border-radius:8px;color:#8a968f}.app aside span.on{background:color-mix(in srgb,var(--a) 16%,transparent);color:var(--a)}.app aside small{margin-top:14px;padding:0 10px;text-transform:uppercase;font-size:10px;letter-spacing:.1em}
.app main{padding:16px 20px;overflow:hidden;display:flex;flex-direction:column;gap:12px}.top{display:flex;align-items:center;gap:12px}.top h3{margin:0;font-size:18px}.srch{margin-left:auto;background:#121a16;border:1px solid #1f2924;border-radius:99px;padding:4px 16px;color:#6b7770;width:200px}.av{width:22px;height:22px;border-radius:99px;background:linear-gradient(135deg,var(--a),#7dd3fc);display:inline-block}
.kp{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.card{background:#121a16;border:1px solid #1f2924;border-radius:14px;padding:12px 14px}.card h4{margin:2px 0;font-size:24px}.card em{font-style:normal;color:#34d399;font-size:12px}
.panel{background:#121a16;border:1px solid #1f2924;border-radius:14px;padding:14px}.panel h5{margin:0 0 10px;font-size:13px;display:flex;gap:8px;align-items:center}.two{display:grid;grid-template-columns:1.6fr 1fr;gap:12px}.two svg{width:100%}
.bars{height:7px;background:#1f2924;border-radius:9px;overflow:hidden;flex:1}.bars i{display:block;height:100%;background:var(--a);border-radius:9px}.hb{display:flex;align-items:center;gap:10px;margin:9px 0;font-size:13px}.hb span{width:110px;color:#9aa79f}.hb b{width:36px;text-align:right}
.pill{border-radius:99px;padding:1px 9px;font-size:11px;font-weight:600}
.kan{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.kc{background:#0e1411;border:1px solid #1f2924;border-radius:14px;padding:10px;display:grid;gap:8px;align-content:start}.kc h5{margin:0;color:#9aa79f;font-size:12px}.kc h5 em{font-style:normal;color:var(--a)}.kt{background:#121a16;border:1px solid #1f2924;border-radius:10px;padding:10px}.kt p{color:#eef3ef;font-size:13px;margin-bottom:8px}.meta{display:flex;justify-content:space-between;margin-top:8px}
.tbl{border:1px solid #1f2924;border-radius:14px;overflow:hidden}.th2,.tr{display:grid;grid-template-columns:1fr 1.4fr 1fr 1fr;padding:9px 14px}.th2{background:#121a16;color:#8a968f;font-size:12px}.tr{border-top:1px solid #1f2924}
.inbx{display:grid;grid-template-columns:240px 1fr;gap:12px}.il{display:grid;gap:6px;align-content:start}.im{background:#121a16;border:1px solid #1f2924;border-radius:10px;padding:8px 12px;display:grid}.im.a{border-color:var(--a)}.bub{background:#1a2520;border-radius:12px 12px 12px 3px;padding:8px 12px;margin:8px 0;max-width:80%}.bub.me{background:var(--a);color:#0b0f0d;margin-left:auto;border-radius:12px 12px 3px 12px;font-weight:500}.reply{border:1px solid #2a3630;border-radius:10px;padding:8px 12px;color:#6b7770;margin-top:12px}.chat{min-height:330px}
.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}.cal h6{margin:0;color:#8a968f;font-size:11px;text-align:center}.cd{background:#121a16;border:1px solid #1f2924;border-radius:8px;min-height:50px;padding:3px 6px}.cd small{font-size:10px}.ev{display:block;background:color-mix(in srgb,var(--a) 25%,transparent);color:var(--a);border-radius:4px;padding:0 5px;font-size:10px;white-space:nowrap;overflow:hidden}.ev.b{background:#a78bfa33;color:#a78bfa}
.doc{background:#0e1411;border:1px solid #1f2924;border-radius:14px;padding:10px}.tool{display:flex;gap:6px;align-items:center;padding-bottom:8px}.tool u{text-decoration:none;border:1px solid #2a3630;border-radius:6px;padding:0 9px;color:#9aa79f}.page{background:#f4f0e6;color:#1b1f1c;border-radius:6px;padding:20px 30px;height:260px;overflow:hidden}.page h2{margin:0 0 10px;font-size:19px}.page h3{margin:12px 0 6px;font-size:14px}.ln{height:7px;background:#cfc9b8;border-radius:4px;margin:7px 0}.w90{width:90%}.w80{width:80%}.w95{width:95%}.w60{width:60%}.w70{width:70%}.sig{margin-top:14px;display:flex;gap:10px;align-items:end;border-bottom:1px solid #1b1f1c;width:260px}.sig span{font-size:11px;color:#777}.sig em{font:italic 22px Georgia,serif;color:#2563eb}
.code{background:#0a0f0c;border:1px solid #1f2924;border-radius:14px;padding:10px;font-family:ui-monospace,monospace;font-size:12px}.cl2{display:grid;grid-template-columns:30px 18px 1fr;padding:3px 6px;border-radius:4px}.cl2 u{color:#4b5a52;text-decoration:none}.cl2.a{background:#34d39918}.cl2.a b{color:#34d399}.cl2.d{background:#f8717118}.cl2.d b{color:#f87171}.cl2.h{color:#8a968f}.note{margin-top:10px;background:#121a16;border-radius:10px;padding:10px;font-family:system-ui;color:#9aa79f}
.fn{background:var(--a);color:#0b0f0d;font-weight:700;border-radius:8px;padding:8px 12px;margin:6px 0}.up{display:grid;grid-template-columns:90px 1fr 56px;gap:12px;align-items:center;margin:11px 0}.up div{display:flex;gap:3px}.up i{flex:1;height:22px;border-radius:3px;display:block}.up b{text-align:right}
.lp{display:grid;grid-template-columns:.9fr 1.3fr;gap:28px;padding:34px 28px;align-items:center}.mini{height:420px;overflow:hidden;border-radius:14px;border:1px solid #2a3630;position:relative}.mini .app{width:1000px;height:640px;transform:scale(.62);transform-origin:0 0}
.plan{padding:22px}.plan.hot{border-color:var(--a);box-shadow:0 0 40px -18px var(--a)}.chk{margin:8px 0;color:#c9d3cd}
/* lead gen */
.lg{padding-top:36px;gap:44px}.ck{margin:14px 0}.proof{display:flex;gap:12px;align-items:center;margin-top:16px}.proof span{display:flex}.proof i{width:28px;height:28px;border-radius:99px;background:linear-gradient(135deg,var(--a),#7dd3fc);border:2px solid #0b0f0d;margin-left:-8px}.proof span i:first-child{margin-left:0}
.fcard{background:#121a16;border:1px solid #2a3630;border-radius:18px;padding:20px;box-shadow:0 30px 80px -40px var(--a)}.vis{height:104px;background:#0e1411;border-radius:12px;margin-bottom:12px;display:grid;place-items:center}.vis svg{height:100%}.fcard h3{margin:0 0 6px}.fcard label{display:block;font-size:12px;color:#8a968f;margin-top:10px}.fcard label i{display:block;height:38px;border-radius:9px;background:#0b0f0d;border:1px solid #2a3630;margin-top:4px}.fine{display:block;text-align:center;margin-top:8px;font-size:11px}
.stepw{max-width:620px;margin:0 auto;padding:40px 24px;text-align:center}.stepw .bars{margin:10px 0 22px}.opt4{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}.op{border:1.5px solid #2a3630;border-radius:14px;padding:22px;background:#121a16;font-weight:600}.op.sel{border-color:var(--a);background:color-mix(in srgb,var(--a) 14%,#121a16);color:var(--a)}
.thanks{max-width:560px;margin:0 auto;padding:34px 24px;text-align:center}.ok{width:64px;height:64px;border-radius:99px;background:var(--a);color:#0b0f0d;font-size:32px;display:grid;place-items:center;margin:0 auto 10px;font-weight:800}.sumbox{background:#121a16;border:1px solid #1f2924;border-radius:14px;padding:10px 16px;margin:18px 0}.sumbox p{display:flex;justify-content:space-between;padding:6px 0}.next{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.next span{background:#121a16;border:1px solid #1f2924;border-radius:12px;padding:12px;font-size:12px;display:grid;gap:6px;justify-items:center}.next b{color:var(--a);font-size:18px}
</style></head><body>${body}</body></html>`;
}
