/**
 * Generates the placeholder terminal-capacity images used by the control panel's
 * capacity-analysis panel. These stand in for real Pearson concourse stills —
 * drop actual camera captures into `static/images/` with the same filenames to
 * swap them out.
 *
 *   npm run gen:images
 *
 * Output is deterministic (seeded PRNG) so re-running never churns the files.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'static', 'images');

const WIDTH = 640;
const HEIGHT = 400;

const LEVELS = [
  {
    filename: 'terminal-capacity-quiet.svg',
    title: 'TERMINAL 1 · DOMESTIC CHECK-IN',
    tier: 'QUIET',
    occupancy: 12,
    people: 9,
    queue: 0.05,
    tierColor: '#12A05C',
    clock: '04:52'
  },
  {
    filename: 'terminal-capacity-light.svg',
    title: 'TERMINAL 1 · DOMESTIC CHECK-IN',
    tier: 'LIGHT',
    occupancy: 34,
    people: 26,
    queue: 0.3,
    tierColor: '#4FA8E0',
    clock: '09:18'
  },
  {
    filename: 'terminal-capacity-moderate.svg',
    title: 'TERMINAL 3 · DEPARTURES CHECK-IN',
    tier: 'MODERATE',
    occupancy: 58,
    people: 48,
    queue: 0.55,
    tierColor: '#F2A900',
    clock: '12:41'
  },
  {
    filename: 'terminal-capacity-busy.svg',
    title: 'TERMINAL 3 · DEPARTURES CHECK-IN',
    tier: 'BUSY',
    occupancy: 79,
    people: 78,
    queue: 0.82,
    tierColor: '#E4761B',
    clock: '16:05'
  },
  {
    filename: 'terminal-capacity-critical.svg',
    title: 'TERMINAL 3 · DEPARTURES CHECK-IN',
    tier: 'AT CAPACITY',
    occupancy: 96,
    people: 118,
    queue: 1,
    tierColor: '#D22630',
    clock: '18:27'
  }
];

/** Deterministic 32-bit PRNG (mulberry32) so output never churns between runs. */
function prng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round = (n) => Math.round(n * 10) / 10;

/** One passenger silhouette: head + shoulders, scaled by perspective depth. */
function passenger(x, y, depth, tint) {
  const s = 0.5 + depth * 1.1;
  const head = round(3.4 * s);
  const bodyW = round(8.2 * s);
  const bodyH = round(15 * s);
  const opacity = round((0.4 + depth * 0.55) * 10) / 10;
  return (
    `<g opacity="${opacity}" fill="${tint}">` +
    `<circle cx="${round(x)}" cy="${round(y)}" r="${head}"/>` +
    `<rect x="${round(x - bodyW / 2)}" y="${round(y + head * 0.7)}" width="${bodyW}" height="${bodyH}" rx="${round(bodyW / 2.4)}"/>` +
    `</g>`
  );
}

function buildSvg(level) {
  const rand = prng(level.occupancy * 7919 + 13);
  const parts = [];

  // ── Crowd, painted back-to-front so nearer passengers overlap farther ones ──
  const crowd = [];
  for (let i = 0; i < level.people; i++) {
    const depth = rand();
    const y = 196 + depth * 176;
    // The hall narrows toward the back, so spread widens with depth.
    const spread = 60 + depth * 300;
    const x = 320 + (rand() - 0.5) * 2 * spread;
    if (x < 8 || x > WIDTH - 8) continue;
    const tint = i % 7 === 0 ? '#F2A900' : i % 3 === 0 ? '#A8D4F2' : '#DCE8F7';
    crowd.push({ depth, svg: passenger(x, y, depth, tint) });
  }
  crowd.sort((a, b) => a.depth - b.depth);

  // ── Queue snake feeding the counters, length scaled by the capacity tier ──
  const queue = [];
  const queueLength = Math.round(34 * level.queue);
  for (let i = 0; i < queueLength; i++) {
    const t = i / Math.max(1, queueLength);
    // Serpentine path across the hall floor.
    const lane = Math.floor(t * 3);
    const along = (t * 3) % 1;
    const x = lane % 2 === 0 ? 130 + along * 380 : 510 - along * 380;
    const y = 350 - lane * 42;
    const depth = 0.45 + lane * 0.12;
    queue.push(passenger(x, y, depth, '#FFFFFF'));
  }

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${level.title} — ${level.tier}">`);

  parts.push(`<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0A1628"/>
      <stop offset="1" stop-color="#152A47"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1B2E4C"/>
      <stop offset="1" stop-color="#0C1A2E"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2A4E7A" stop-opacity="0.9"/>
      <stop offset="1" stop-color="#0A1628" stop-opacity="0.2"/>
    </linearGradient>
    <linearGradient id="meter" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${level.tierColor}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${level.tierColor}"/>
    </linearGradient>
  </defs>`);

  // Hall shell
  parts.push(`<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>`);
  parts.push(`<rect y="188" width="${WIDTH}" height="${HEIGHT - 188}" fill="url(#floor)"/>`);

  // Curtain-wall glazing at the back of the hall
  parts.push(`<rect x="0" y="66" width="${WIDTH}" height="122" fill="url(#glass)"/>`);
  for (let x = 0; x <= WIDTH; x += 40) {
    parts.push(`<line x1="${x}" y1="66" x2="${x}" y2="188" stroke="#0A1628" stroke-opacity="0.55" stroke-width="3"/>`);
  }
  parts.push(`<line x1="0" y1="128" x2="${WIDTH}" y2="128" stroke="#0A1628" stroke-opacity="0.45" stroke-width="3"/>`);

  // Vaulted roof ribs
  for (let i = 0; i < 5; i++) {
    const y = 12 + i * 12;
    parts.push(`<path d="M -20 ${y + 26} Q 320 ${y - 14} 660 ${y + 26}" fill="none" stroke="#4FA8E0" stroke-opacity="0.12" stroke-width="2"/>`);
  }

  // Perspective floor grid
  for (let i = -7; i <= 7; i++) {
    parts.push(`<line x1="${320 + i * 26}" y1="188" x2="${320 + i * 130}" y2="${HEIGHT}" stroke="#FFFFFF" stroke-opacity="0.05" stroke-width="1"/>`);
  }
  for (let y = 200; y < HEIGHT; y += 22) {
    parts.push(`<line x1="0" y1="${y}" x2="${WIDTH}" y2="${y}" stroke="#FFFFFF" stroke-opacity="0.045" stroke-width="1"/>`);
  }

  // Check-in counter row with agent positions
  parts.push(`<rect x="0" y="176" width="${WIDTH}" height="26" fill="#0F2340" fill-opacity="0.9"/>`);
  for (let i = 0; i < 9; i++) {
    const x = 24 + i * 70;
    parts.push(`<rect x="${x}" y="178" width="54" height="22" rx="3" fill="#1D3A62"/>`);
    parts.push(`<circle cx="${x + 27}" cy="172" r="4" fill="#DCE8F7" fill-opacity="0.7"/>`);
  }

  // Overhead wayfinding gantry
  parts.push(`<rect x="0" y="46" width="${WIDTH}" height="22" fill="#00284D"/>`);
  parts.push(`<text x="16" y="62" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="bold" fill="#FFFFFF" letter-spacing="1.5">${level.title}</text>`);
  parts.push(`<text x="${WIDTH - 16}" y="62" text-anchor="end" font-family="Helvetica, Arial, sans-serif" font-size="13" font-weight="bold" fill="#F2A900">${level.clock}</text>`);

  // Crowd + queue
  parts.push(`<g>${crowd.map((c) => c.svg).join('')}</g>`);
  parts.push(`<g>${queue.join('')}</g>`);

  // Retractable belt barriers framing the queue
  parts.push(`<g stroke="#4FA8E0" stroke-opacity="0.35" stroke-width="2" fill="none">
    <path d="M 120 358 L 520 358"/>
    <path d="M 120 316 L 520 316"/>
    <path d="M 120 274 L 520 274"/>
  </g>`);

  // Camera overlay chrome
  parts.push(`<g fill="none" stroke="#4FA8E0" stroke-opacity="0.5" stroke-width="2">
    <path d="M 14 24 L 14 14 L 24 14"/>
    <path d="M ${WIDTH - 24} 14 L ${WIDTH - 14} 14 L ${WIDTH - 14} 24"/>
    <path d="M 14 ${HEIGHT - 24} L 14 ${HEIGHT - 14} L 24 ${HEIGHT - 14}"/>
    <path d="M ${WIDTH - 24} ${HEIGHT - 14} L ${WIDTH - 14} ${HEIGHT - 14} L ${WIDTH - 14} ${HEIGHT - 24}"/>
  </g>`);
  parts.push(`<circle cx="24" cy="36" r="5" fill="#D22630"/>`);
  parts.push(`<text x="36" y="40" font-family="monospace" font-size="12" fill="#FFFFFF" fill-opacity="0.85">CAM-YYZ-${String(level.occupancy).padStart(3, '0')}</text>`);

  // Capacity readout panel
  parts.push(`<rect x="16" y="${HEIGHT - 74}" width="266" height="56" rx="8" fill="#050D1A" fill-opacity="0.82"/>`);
  parts.push(`<text x="30" y="${HEIGHT - 54}" font-family="Helvetica, Arial, sans-serif" font-size="10" font-weight="bold" fill="#A8D4F2" letter-spacing="2">HALL OCCUPANCY</text>`);
  parts.push(`<text x="30" y="${HEIGHT - 32}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="bold" fill="#FFFFFF">${level.occupancy}%</text>`);
  parts.push(`<text x="86" y="${HEIGHT - 32}" font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="bold" fill="${level.tierColor}" letter-spacing="1.5">${level.tier}</text>`);
  parts.push(`<rect x="30" y="${HEIGHT - 26}" width="238" height="6" rx="3" fill="#FFFFFF" fill-opacity="0.15"/>`);
  parts.push(`<rect x="30" y="${HEIGHT - 26}" width="${round(238 * (level.occupancy / 100))}" height="6" rx="3" fill="url(#meter)"/>`);

  parts.push(`</svg>`);
  return parts.join('\n');
}

mkdirSync(OUT_DIR, { recursive: true });
for (const level of LEVELS) {
  const path = join(OUT_DIR, level.filename);
  writeFileSync(path, buildSvg(level) + '\n', 'utf8');
  console.log(`wrote ${level.filename}  (${level.occupancy}% · ${level.tier})`);
}
console.log(`\n${LEVELS.length} placeholder images written to static/images/`);
