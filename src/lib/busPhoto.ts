// A drawn stand-in "photo" of a Warrior vehicle, returned as an inline SVG data
// URI. The point (Rudy's): a picture removes all doubt — a driver or coach
// glancing at a trip should recognize the exact vehicle, not decode a name like
// "Warrior Big Bus 2 (27 plus driver)". Real photos can be uploaded per vehicle
// (Resource.photo); until someone does, this gives an unmistakable visual plus
// the number and seat count.

export function isVehicle(name: string): boolean {
  return /\b(bus|suburban|van)\b/i.test(name);
}

interface VehicleBits {
  kind: 'bus' | 'van';
  label: string; // big badge, e.g. "BUS 3", "SUBURBAN", "VAN"
  seats?: string; // "28"
}

function parseVehicle(name: string): VehicleBits {
  const seatM = /\((\d+)\s*plus/i.exec(name);
  const seats = seatM ? seatM[1] : undefined;
  const numM = /bus\s*(\d+)/i.exec(name);
  if (numM) return { kind: 'bus', label: `BUS ${numM[1]}`, seats };
  if (/suburban/i.test(name)) return { kind: 'van', label: 'SUBURBAN', seats };
  if (/van/i.test(name)) return { kind: 'van', label: 'VAN', seats };
  return { kind: 'bus', label: 'BUS', seats };
}

const GREEN = '#2d5035';
const GOLD = '#c3945d';

function busSvg(_b: VehicleBits): string {
  // Side view: long green body, gold stripe, window row, two wheels.
  return `
  <rect x="0" y="0" width="320" height="180" fill="url(#sky)"/>
  <rect x="0" y="150" width="320" height="30" fill="#cdbfa6"/>
  <g>
    <rect x="22" y="44" width="276" height="92" rx="14" fill="${GREEN}"/>
    <rect x="22" y="92" width="276" height="12" fill="${GOLD}"/>
    <!-- windshield -->
    <path d="M298 56 q8 2 8 14 v22 h-30 V60 q0-4 4-4 z" fill="#bfe0ea"/>
    <!-- window row -->
    ${[40, 86, 132, 178, 224].map((x) => `<rect x="${x}" y="58" width="36" height="26" rx="4" fill="#bfe0ea"/>`).join('')}
    <!-- door -->
    <rect x="270" y="98" width="22" height="38" rx="3" fill="#21392a"/>
    <!-- headlight + bumper -->
    <rect x="300" y="118" width="8" height="10" rx="2" fill="#ffe9a8"/>
    <rect x="20" y="130" width="284" height="8" rx="4" fill="#21392a"/>
    <!-- wheels -->
    <circle cx="84" cy="140" r="20" fill="#1b1b1b"/><circle cx="84" cy="140" r="8" fill="#9a9a9a"/>
    <circle cx="240" cy="140" r="20" fill="#1b1b1b"/><circle cx="240" cy="140" r="8" fill="#9a9a9a"/>
    <text x="150" y="124" font-family="Montserrat,Arial,sans-serif" font-size="13" font-weight="800" letter-spacing="1.5" fill="${GOLD}" text-anchor="middle">WARRIORS</text>
  </g>`;
}

function vanSvg(_b: VehicleBits): string {
  // Shorter, taller SUV/van silhouette.
  return `
  <rect x="0" y="0" width="320" height="180" fill="url(#sky)"/>
  <rect x="0" y="150" width="320" height="30" fill="#cdbfa6"/>
  <g>
    <path d="M40 132 V92 q0-10 10-12 l40-30 q6-4 14-4 h120 q12 0 12 14 v72 z" fill="${GREEN}"/>
    <rect x="40" y="104" width="216" height="10" fill="${GOLD}"/>
    <rect x="96" y="58" width="50" height="30" rx="4" fill="#bfe0ea"/>
    <rect x="154" y="58" width="44" height="30" rx="4" fill="#bfe0ea"/>
    <path d="M206 58 h26 q10 0 10 12 v18 h-36 z" fill="#bfe0ea"/>
    <rect x="246" y="116" width="8" height="10" rx="2" fill="#ffe9a8"/>
    <circle cx="96" cy="140" r="20" fill="#1b1b1b"/><circle cx="96" cy="140" r="8" fill="#9a9a9a"/>
    <circle cx="208" cy="140" r="20" fill="#1b1b1b"/><circle cx="208" cy="140" r="8" fill="#9a9a9a"/>
    <text x="150" y="128" font-family="Montserrat,Arial,sans-serif" font-size="12" font-weight="800" letter-spacing="1.5" fill="${GOLD}" text-anchor="middle">WARRIORS</text>
  </g>`;
}

export function busPhoto(name: string): string {
  const b = parseVehicle(name);
  const seatBadge = b.seats
    ? `<g><rect x="232" y="14" width="74" height="26" rx="13" fill="rgba(0,0,0,.5)"/><text x="269" y="31" font-family="Montserrat,Arial,sans-serif" font-size="12" font-weight="700" fill="#fff" text-anchor="middle">${b.seats} seats</text></g>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfeef5"/><stop offset="1" stop-color="#eef4ee"/></linearGradient></defs>
    ${b.kind === 'bus' ? busSvg(b) : vanSvg(b)}
    <g><rect x="14" y="14" width="${b.label.length * 11 + 20}" height="28" rx="6" fill="${GOLD}"/><text x="${24 + (b.label.length * 11) / 2}" y="33" font-family="Montserrat,Arial,sans-serif" font-size="15" font-weight="800" letter-spacing="1" fill="#1b2a20" text-anchor="middle">${b.label}</text></g>
    ${seatBadge}
  </svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}
