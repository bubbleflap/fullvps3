import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { X, Loader2, Wallet, ExternalLink, RefreshCw } from "lucide-react";
import { useLang } from "../lib/i18n";
import { ethers } from "ethers";

const LOTTERY_CONTRACT = import.meta.env.VITE_LOTTERY_CONTRACT || "";
const BFLAP_CA = "0xa2320fff1069ED5b4B02dDb386823E837A7e7777";
const USDT_CA  = "0x55d398326f99059fF775485246999027B3197955";
const LOTTERY_ABI = [
  "function purchaseSpinsBNB() payable",
  "function purchaseSpinsUSDT(uint256 usdtAmount)",
  "function purchaseSpinsBFLAP(uint256 bflapAmount)",
];
const ERC20_APPROVE_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
];
const ERC20_TRANSFER_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
];

const WHEEL_SEGMENTS = [
  { id: "try_again",   title: "ZONK",         label: "ZONK",       dropRate: 30, prize: 0,     bnbPrize: 0,     display: "ZONK! No prize this time.", icon: "tryagain" },
  { id: "bnb_002",     title: "0.02 BNB",     label: "0.02",       dropRate: 2,  prize: 0,     bnbPrize: 0.02,  display: "You won 0.02 BNB!", icon: "bnb" },
  { id: "bflap_500",   title: "500 BFLAP",    label: "500",        dropRate: 8,  prize: 500,   bnbPrize: 0,     display: "You won 500 BFLAP!", icon: "bflap" },
  { id: "usd_010",     title: "$0.10",         label: "$0.10",      dropRate: 20, prize: 0.1,   bnbPrize: 0,     display: "You won $0.10!", icon: "usdt" },
  { id: "bnb_001",     title: "0.01 BNB",     label: "0.01",       dropRate: 3,  prize: 0,     bnbPrize: 0.01,  display: "You won 0.01 BNB!", icon: "bnb" },
  { id: "bflap_3k",    title: "3000 BFLAP",   label: "3K",         dropRate: 5,  prize: 3000,  bnbPrize: 0,     display: "You won 3,000 BFLAP!", icon: "bflap" },
  { id: "try_again_2", title: "ZONK",         label: "ZONK",       dropRate: 15, prize: 0,     bnbPrize: 0,     display: "ZONK! No prize this time.", icon: "tryagain" },
  { id: "bnb_0005",    title: "0.005 BNB",    label: "0.005",      dropRate: 5,  prize: 0,     bnbPrize: 0.005, display: "You won 0.005 BNB!", icon: "bnb" },
  { id: "usd_050",     title: "$0.50",         label: "$0.50",      dropRate: 12, prize: 0.5,   bnbPrize: 0,     display: "You won $0.50!", icon: "usdt" },
  { id: "bflap_1k",    title: "1000 BFLAP",   label: "1K",         dropRate: 7,  prize: 1000,  bnbPrize: 0,     display: "You won 1,000 BFLAP!", icon: "bflap" },
  { id: "bnb_0003",    title: "0.003 BNB",    label: "0.003",      dropRate: 8,  prize: 0,     bnbPrize: 0.003, display: "You won 0.003 BNB!", icon: "bnb" },
  { id: "try_again_3", title: "ZONK",         label: "ZONK",       dropRate: 15, prize: 0,     bnbPrize: 0,     display: "ZONK! No prize this time.", icon: "tryagain" },
  { id: "bflap_10k",   title: "10000 BFLAP",  label: "10K",        dropRate: 5,  prize: 10000, bnbPrize: 0,     display: "You won 10,000 BFLAP!", icon: "bflap" },
  { id: "usd_100",     title: "$1.00",         label: "$1.00",      dropRate: 8,  prize: 1,     bnbPrize: 0,     display: "You won $1.00!", icon: "usdt" },
  { id: "bnb_01",      title: "0.1 BNB",      label: "0.1",        dropRate: 1,  prize: 0,     bnbPrize: 0.1,   display: "You won 0.1 BNB!", icon: "bnb" },
  { id: "bflap_50k",   title: "50000 BFLAP",  label: "50K",        dropRate: 2,  prize: 50000, bnbPrize: 0,     display: "You won 50,000 BFLAP!", icon: "bflap" },
  { id: "usd_1000",    title: "$10.00",        label: "$10.00",     dropRate: 3,  prize: 10,    bnbPrize: 0,     display: "You won $10.00!", icon: "usdt" },
  { id: "free_spin",   title: "Free Spin 2x", label: "Free 2x",    dropRate: 12, prize: -2,    bnbPrize: 0,     display: "You got 2 free spins!", icon: "freespin" },
];

const SEGMENT_COLOR_A = "#7a33fa";
const SEGMENT_COLOR_B = "#3e00ad";

const SEGMENT_COUNT = WHEEL_SEGMENTS.length;
const SEGMENT_ANGLE = 360 / SEGMENT_COUNT;

type TierKey = '049' | '099' | '150';
const TIER_CONFIG: Record<TierKey, { price: number; multiplier: number; label: string; jackpotBnb: number; jackpotUsd: number; col: string }> = {
  '049': { price: 0.49, multiplier: 0.5,  label: '$0.49', jackpotBnb: 0.05, jackpotUsd: 5,  col: 'spinsLeft049' },
  '099': { price: 0.99, multiplier: 1.0,  label: '$0.99', jackpotBnb: 0.10, jackpotUsd: 10, col: 'spinsLeft099' },
  '150': { price: 1.50, multiplier: 1.5,  label: '$1.5',  jackpotBnb: 0.15, jackpotUsd: 15, col: 'spinsLeft150' },
};

function buildSegmentPaths(n: number, outerR: number, innerR: number): string[] {
  const step = (2 * Math.PI) / n;
  return Array.from({ length: n }, (_, i) => {
    const a1 = i * step;
    const a2 = a1 + step;
    const f = (v: number) => v.toFixed(3);
    return `M${f(Math.cos(a1)*outerR)},${f(Math.sin(a1)*outerR)}A${outerR},${outerR},0,0,1,${f(Math.cos(a2)*outerR)},${f(Math.sin(a2)*outerR)}L${f(Math.cos(a2)*innerR)},${f(Math.sin(a2)*innerR)}A${innerR},${innerR},0,0,0,${f(Math.cos(a1)*innerR)},${f(Math.sin(a1)*innerR)}Z`;
  });
}

const f1 = buildSegmentPaths(SEGMENT_COUNT, 873, 588);

function makeArc(r: number, startAngle: number, endAngle: number) {
  const s = startAngle * Math.PI / 180;
  const e = endAngle * Math.PI / 180;
  const x1 = Math.cos(s) * r, y1 = Math.sin(s) * r;
  const x2 = Math.cos(e) * r, y2 = Math.sin(e) * r;
  return `M${x1},${y1}A${r},${r},0,0,1,${x2},${y2}`;
}

function needsFlip(_idx: number): boolean {
  return false;
}

function getTitlePath(idx: number): string {
  const startA = idx * SEGMENT_ANGLE;
  const endA = startA + SEGMENT_ANGLE;
  const r = 620;
  return makeArc(r, startA, endA);
}

function getDropPath(idx: number): string {
  const startA = idx * SEGMENT_ANGLE;
  const endA = startA + SEGMENT_ANGLE;
  const r = 630;
  if (needsFlip(idx)) {
    const s = endA * Math.PI / 180, e = startA * Math.PI / 180;
    return `M${Math.cos(s)*r},${Math.sin(s)*r}A${r},${r},0,0,0,${Math.cos(e)*r},${Math.sin(e)*r}`;
  }
  return makeArc(r, startA, endA);
}

const RAINBOW_COLORS = [
  '#ff4444', '#ff6600', '#ffcc00', '#44ff88', '#00ccff', '#cc44ff', '#ff44cc', '#ffffff',
  '#ff8800', '#ffff00', '#00ff88', '#0088ff', '#8844ff', '#ff0088',
];
const JACKPOT_COLORS = ['#ffd700', '#ffcc00', '#fff066', '#ffaa00', '#ffe55c', '#ffffff', '#ffc800'];

function SparkleOverlay({ isJackpot }: { isJackpot: boolean }) {
  const colors = isJackpot ? JACKPOT_COLORS : RAINBOW_COLORS;
  const count = isJackpot ? 48 : 30;
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => {
      const isStar = i % 3 === 0;
      return {
        id: i,
        angle: (360 / count) * i + (Math.random() - 0.5) * (360 / count) * 1.4,
        dist: (isJackpot ? 130 : 100) + Math.random() * (isJackpot ? 160 : 120),
        size: isStar ? (isJackpot ? 14 : 10) + Math.random() * 8 : (isJackpot ? 8 : 5) + Math.random() * 7,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: Math.random() * 0.25,
        duration: 0.7 + Math.random() * 0.6,
        isStar,
        twinkle: i % 5 === 0,
      };
    }),
  [isJackpot]);

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 25 }}>
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: p.size,
            height: p.size,
            borderRadius: p.isStar ? '2px' : '50%',
            background: p.color,
            boxShadow: `0 0 ${p.size * 2}px ${Math.ceil(p.size * 0.8)}px ${p.color}bb`,
            transformOrigin: '50% 50%',
            animation: p.twinkle
              ? `sparkle-burst ${p.duration}s ease-out ${p.delay}s both, sparkle-twinkle ${p.duration * 0.4}s ease-in-out ${p.delay}s`
              : `sparkle-burst ${p.duration}s ease-out ${p.delay}s both`,
            ['--sp-angle' as string]: `${p.angle}deg`,
            ['--sp-dist' as string]: `${p.dist}px`,
          }}
        />
      ))}
    </div>
  );
}

function BotRainOverlay({ isJackpot }: { isJackpot: boolean }) {
  const bots = useMemo(() =>
    Array.from({ length: 45 }, (_, i) => {
      const wobble = i % 3 !== 0;
      const cw = Math.random() > 0.5;
      return {
        id: i,
        left: 1 + Math.random() * 98,
        delay: Math.random() * 2.8,
        duration: 2.8 + Math.random() * 2.4,
        size: 30 + Math.floor(Math.random() * 40),
        anim: wobble
          ? (cw ? 'bot-fall-wobble-cw' : 'bot-fall-wobble-ccw')
          : (cw ? 'bot-fall-cw' : 'bot-fall-ccw'),
        glow: isJackpot
          ? `drop-shadow(0 0 ${6 + Math.floor(Math.random()*8)}px #ffd700) brightness(1.3)`
          : `drop-shadow(0 0 ${4 + Math.floor(Math.random()*6)}px #a855f7) brightness(1.1)`,
      };
    }), [isJackpot]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998, pointerEvents: 'none',
        overflow: 'hidden',
        animation: 'bot-rain-in 6s ease-out forwards',
      }}
    >
      {bots.map(b => (
        <img
          key={b.id}
          src="/assets/bot.png"
          alt=""
          style={{
            position: 'absolute',
            top: `-${b.size + 16}px`,
            left: `${b.left}%`,
            width: `${b.size}px`,
            height: `${b.size}px`,
            filter: b.glow,
            animation: `${b.anim} ${b.duration}s ${b.delay}s cubic-bezier(0.25,0.1,0.4,1) forwards`,
          }}
        />
      ))}
    </div>
  );
}

function getWinDisplay(seg: typeof WHEEL_SEGMENTS[0], m: number): { title: string; display: string } {
  if (seg.prize === 0 && seg.bnbPrize === 0) return { title: seg.title, display: seg.display };
  if (seg.prize === -2) return { title: seg.title, display: seg.display };
  if (seg.bnbPrize > 0) {
    const v = seg.bnbPrize * m;
    const fmt = v >= 0.1 ? v.toFixed(2).replace(/\.?0+$/, '') : v >= 0.01 ? v.toFixed(3).replace(/\.?0+$/, '') : v.toFixed(4).replace(/\.?0+$/, '');
    return { title: `${fmt} BNB`, display: `You won ${fmt} BNB!` };
  }
  if (seg.prize > 100) {
    const v = Math.round(seg.prize * m);
    return { title: `${v.toLocaleString()} BFLAP`, display: `You won ${v.toLocaleString()} BFLAP!` };
  }
  const v = (seg.prize * m);
  const fmt = `$${v % 1 === 0 ? v.toFixed(2) : v.toFixed(2)}`;
  return { title: fmt, display: `You won ${fmt}!` };
}

function scaledWheelLabel(seg: typeof WHEEL_SEGMENTS[0], m: number): string {
  if (m === 1) return seg.label;
  if (seg.prize === 0 && seg.bnbPrize === 0) return seg.label;
  if (seg.prize === -2) return seg.label;
  if (seg.bnbPrize > 0) {
    const v = seg.bnbPrize * m;
    if (v >= 0.1) return v.toFixed(2).replace(/\.?0+$/, '');
    if (v >= 0.01) return v.toFixed(3).replace(/\.?0+$/, '');
    return v.toFixed(4).replace(/\.?0+$/, '');
  }
  if (seg.prize > 100) {
    const v = Math.floor(seg.prize * m);
    if (v >= 1000) return `${(v / 1000) % 1 === 0 ? v / 1000 : (v / 1000).toFixed(1)}K`;
    return v.toString();
  }
  return `$${(seg.prize * m).toFixed(2)}`;
}

function WheelSVG({ rotation, wheelTransition, tierMultiplier }: { rotation: number; wheelTransition: string; tierMultiplier: number }) {
  return (
    <svg
      className="w-full h-full"
      viewBox="0 0 2000 2000"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>{`
        .wheel-spin {
          transform-origin: 1000px 1000px;
          transition: ${wheelTransition};
        }
        .wheel-segment {
          cursor: pointer;
          transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
          transform-box: fill-box;
          transform-origin: center;
        }
        .wheel-segment:hover {
          transform: scale(1.09);
        }
        .wheel-icon {
          transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
          transform-box: fill-box;
          transform-origin: center;
          cursor: pointer;
        }
        .wheel-segment:hover .wheel-icon {
          transform: scale(1.35);
        }
      `}</style>

      <mask id="wheel-mask" fill="white">
        <path d="M1922 1005C1922 1514.21 1509.21 1927 1000 1927C490.793 1927 78 1514.21 78 1005C78 495.793 490.793 83 1000 83C1509.21 83 1922 495.793 1922 1005ZM471.592 1005C471.592 1296.83 708.168 1533.41 1000 1533.41C1291.83 1533.41 1528.41 1296.83 1528.41 1005C1528.41 713.168 1291.83 476.592 1000 476.592C708.168 476.592 471.592 713.168 471.592 1005Z" />
      </mask>
      <path
        d="M1922 1005C1922 1514.21 1509.21 1927 1000 1927C490.793 1927 78 1514.21 78 1005C78 495.793 490.793 83 1000 83C1509.21 83 1922 495.793 1922 1005ZM471.592 1005C471.592 1296.83 708.168 1533.41 1000 1533.41C1291.83 1533.41 1528.41 1296.83 1528.41 1005C1528.41 713.168 1291.83 476.592 1000 476.592C708.168 476.592 471.592 713.168 471.592 1005Z"
        style={{ fill: "#100626e8", stroke: "#5b31fe55", strokeWidth: "13px" }}
        mask="url(#wheel-mask)"
      />

      <g className="wheel-spin" style={{ transform: `rotate(${rotation}deg)` }}>
        <g transform="translate(1000, 1000)">
          {WHEEL_SEGMENTS.map((seg, idx) => {
            const d = f1[idx];
            const isEven = idx % 2 === 0;
            const segFill = isEven ? SEGMENT_COLOR_A : SEGMENT_COLOR_B;
            const fontSize = Math.max(42, Math.min(62, SEGMENT_ANGLE * 2.5));
            const midAngleDeg = idx * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
            const midAngle = midAngleDeg * (Math.PI / 180);
            const iconR = 770;
            const ix = Math.cos(midAngle) * iconR;
            const iy = Math.sin(midAngle) * iconR;
            const sz = Math.max(80, Math.min(140, SEGMENT_ANGLE * 3.8));
            const iconRotDeg = midAngleDeg + 90;
            const iconSrc = seg.icon === "bflap" ? "/assets/bflap-logo.png"
              : seg.icon === "usdt" ? "/assets/usdt-logo.png"
              : seg.icon === "freespin" ? "/assets/free-spin-icon.png"
              : seg.icon === "tryagain" ? "/assets/try-again-icon.png"
              : seg.icon === "bnb" ? "https://flap.sh/bnb.svg"
              : null;
            return (
              <g key={idx} className="wheel-segment">
                <path d={d} style={{ fill: segFill, stroke: "rgba(255,255,255,0.15)", strokeWidth: "4" }} filter="url(#jelly-shadow)" />
                <path d={d} style={{ fill: "url(#jelly-gloss)", opacity: 0.4 }} />
                <path d={d} style={{ fill: "none", stroke: "rgba(255,255,255,0.3)", strokeWidth: "2" }} />
                <path d={getTitlePath(idx)} stroke="none" fill="none" id={`title_p_${idx}`} />
                <text dy={-8} style={{ fontSize: `${fontSize}px`, fontWeight: 700, fill: "#d5f704", filter: "url(#text-glow)" }}>
                  <textPath xlinkHref={`#title_p_${idx}`} textAnchor="middle" startOffset="50%">{scaledWheelLabel(seg, tierMultiplier)}</textPath>
                </text>
                {iconSrc ? (
                  <g transform={`translate(${ix}, ${iy}) rotate(${iconRotDeg})`}>
                    <image className="wheel-icon" href={iconSrc} x={-sz / 2} y={-sz / 2} width={sz} height={sz} />
                  </g>
                ) : (
                  <text
                    x={ix} y={iy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    transform={`rotate(${iconRotDeg}, ${ix}, ${iy})`}
                    style={{ fontSize: "44px" }}
                  >{seg.icon}</text>
                )}
              </g>
            );
          })}
        </g>
      </g>

      {(() => {
        const oR = 873 + 22, iR = 588 - 22;
        const halfRad = ((SEGMENT_ANGLE / 2 - 0.5) * Math.PI) / 180;
        const top = -Math.PI / 2;
        const a1 = top - halfRad, a2 = top + halfRad;
        const cx = 1000, cy = 1000;
        const f = (v: number) => v.toFixed(1);
        const ox1 = cx + oR * Math.cos(a1), oy1 = cy + oR * Math.sin(a1);
        const ox2 = cx + oR * Math.cos(a2), oy2 = cy + oR * Math.sin(a2);
        const ix2 = cx + iR * Math.cos(a2), iy2 = cy + iR * Math.sin(a2);
        const ix1 = cx + iR * Math.cos(a1), iy1 = cy + iR * Math.sin(a1);
        const d = `M${f(ox1)},${f(oy1)} A${oR},${oR} 0 0,1 ${f(ox2)},${f(oy2)} L${f(ix2)},${f(iy2)} A${iR},${iR} 0 0,0 ${f(ix1)},${f(iy1)} Z`;
        return (
          <g filter="url(#wheel-pointer-shadow)">
            <path d={d} fill="rgba(255,60,60,0.18)" stroke="#ff3131" strokeWidth="22" strokeLinejoin="round" />
            <path d={d} fill="none" stroke="rgba(255,160,160,0.35)" strokeWidth="6" strokeLinejoin="round" />
          </g>
        );
      })()}

      <defs>
        <filter id="jelly-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="8" result="blur" />
          <feOffset dx="4" dy="6" result="offsetBlur" />
          <feFlood floodColor="rgba(0,0,0,0.4)" result="color" />
          <feComposite in="color" in2="offsetBlur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id="jelly-gloss" cx="40%" cy="30%" r="70%">
          <stop offset="0%" stopColor="white" stopOpacity="0.6" />
          <stop offset="40%" stopColor="white" stopOpacity="0.15" />
          <stop offset="100%" stopColor="black" stopOpacity="0.2" />
        </radialGradient>

        <filter id="tint-yellow" x="0%" y="0%" width="100%" height="100%">
          <feColorMatrix type="matrix" values="0 0 0 0 0.835  0 0 0 0 0.969  0 0 0 0 0.016  0 0 0 1 0" />
        </filter>

        <filter id="text-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="wheel-pointer-shadow" x="-8%" y="-8%" width="116%" height="116%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="blur" />
          <feOffset dx="4" dy="5" result="offsetBlur" />
          <feFlood floodColor="rgba(0,0,0,0.45)" result="color" />
          <feComposite in="color" in2="offsetBlur" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="wheel-pointer-grad" x1="1000" y1="100" x2="1000" y2="465" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ff3131" />
          <stop offset="1" stopColor="#cc1a1a" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function PointerTicker({ isSpinning }: { isSpinning: boolean }) {
  const [tilt, setTilt] = useState(0);
  const lastSegRef = useRef(-1);
  const crossCountRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const tiltTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSpinning) {
      setTilt(0);
      lastSegRef.current = -1;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    function tick() {
      const spinEl = document.querySelector('.wheel-spin') as SVGGElement | null;
      if (spinEl) {
        const matrix = new DOMMatrix(getComputedStyle(spinEl).transform);
        let angleDeg = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
        angleDeg = ((angleDeg % 360) + 360) % 360;
        const seg = Math.floor(angleDeg / SEGMENT_ANGLE) % SEGMENT_COUNT;
        if (lastSegRef.current !== -1 && seg !== lastSegRef.current) {
          crossCountRef.current++;
          const dir = crossCountRef.current % 2 === 0 ? -1 : 1;
          setTilt(dir * 16);
          if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
          tiltTimerRef.current = setTimeout(() => setTilt(0), 90);
        }
        lastSegRef.current = seg;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (tiltTimerRef.current) clearTimeout(tiltTimerRef.current);
    };
  }, [isSpinning]);

  return (
    <div
      className="absolute pointer-events-none z-30"
      style={{
        top: '2%',
        left: '50%',
        transform: `translateX(-50%) rotate(${tilt}deg)`,
        transformOrigin: '50% 100%',
        transition: tilt === 0 ? 'transform 0.12s ease-out' : 'transform 0.02s linear',
        width: '9%',
        minWidth: '28px',
        maxWidth: '54px',
      }}
    >
      <svg viewBox="0 0 44 36" fill="none" style={{ width: '100%', height: 'auto', display: 'block', filter: 'drop-shadow(0 0 6px rgba(255,58,58,0.75)) drop-shadow(0 2px 4px rgba(0,0,0,0.5))' }}>
        <polygon points="22,36 2,4 42,4" fill="#cc1a1a" />
        <polygon points="22,30 8,6 36,6" fill="#ff4d4d" />
        <polygon points="22,18 14,6 30,6" fill="#ff8080" />
      </svg>
    </div>
  );
}

export default function Lottery() {
  const { t } = useLang();
  const [headerHeight, setHeaderHeight] = useState(80);

  useEffect(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const update = () => setHeaderHeight(header.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // Apply full-page background (behind header) while on lottery page
  useEffect(() => {
    document.body.classList.add("lottery-bg");
    return () => document.body.classList.remove("lottery-bg");
  }, []);

  const [spinning, setSpinning] = useState(false);
  const [isSlowSpin, setIsSlowSpin] = useState(false);
  const [isSpinStopped, setIsSpinStopped] = useState(false);
  const [canStop, setCanStop] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<typeof WHEEL_SEGMENTS[0] | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [spinTier, setSpinTier] = useState<TierKey>('099');
  const [spinsLeft049, setSpinsLeft049] = useState(0);
  const [spinsLeft099, setSpinsLeft099] = useState(0);
  const [spinsLeft150, setSpinsLeft150] = useState(0);
  const [spinsLeft, setSpinsLeft] = useState(0);
  const [freeLeft, setFreeLeft] = useState(0);
  const [purchasedRemaining, setPurchasedRemaining] = useState(0);
  const [totalWon, setTotalWon] = useState(0);
  const [bflapWon, setBflapWon] = useState(0);
  const [bnbWon, setBnbWon] = useState(0);
  const [withdrawnUsdt, setWithdrawnUsdt] = useState(0);
  const [withdrawnBflap, setWithdrawnBflap] = useState(0);
  const [withdrawnBnb, setWithdrawnBnb] = useState(0);
  const [totalPurchasedSpins, setTotalPurchasedSpins] = useState(0);
  const [totalSpentBnb, setTotalSpentBnb] = useState(0);
  const [totalSpentUsdt, setTotalSpentUsdt] = useState(0);
  const [totalSpentBflap, setTotalSpentBflap] = useState(0);
  const [depositAddress, setDepositAddress] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState<"bnb" | "bflap" | "usdt" | null>(null);
  const [withdrawMsg, setWithdrawMsg] = useState<{ ok: boolean; text: string; txHash?: string } | null>(null);
  const [withdrawToken, setWithdrawToken] = useState<string>("");
  const [withdrawSuccessPopup, setWithdrawSuccessPopup] = useState<{ currency: string; amount: string; txHash: string } | null>(null);
  const [bflapPriceUsd, setBflapPriceUsd] = useState(0);
  const [bnbPriceUsd, setBnbPriceUsd] = useState(0);
  const [spinsToday, setSpinsToday] = useState(0);
  const [showJackpot, setShowJackpot] = useState(false);
  const [showWinEffect, setShowWinEffect] = useState(false);
  const [showBotRain, setShowBotRain] = useState(false);
  const [botRainIsJackpot, setBotRainIsJackpot] = useState(false);
  const [winPopupFading, setWinPopupFading] = useState(false);
  const [history, setHistory] = useState<{ title: string; prize: number; created_at: string }[]>([]);
  const [winners, setWinners] = useState<{ user: string; totalWon: number; totalBflap: number; totalBnb: number; bestPrize: string }[]>([]);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchaseHistory, setPurchaseHistory] = useState<{ quantity: number; total_bnb: string; currency?: string; status: string; created_at: string }[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [purchaseTx, setPurchaseTx] = useState<string | null>(null);
  const [retryTxHash, setRetryTxHash] = useState<string | null>(null);
  const [bflapBalance, setBflapBalance] = useState<string | null>(null);
  const [usdtBalance, setUsdtBalance] = useState<string | null>(null);
  const [purchaseStep, setPurchaseStep] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"bnb" | "bflap" | "usdt">("bnb");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [connectingStep, setConnectingStep] = useState<"connecting" | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [bnbBalance, setBnbBalance] = useState<string | null>(null);
  const baseRotation = useRef(0);
  const connectingRef = useRef(false);
  const connectedProviderRef = useRef<any>(null);
  const spinAudioRef = useRef<HTMLAudioElement | null>(null);
  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const jackpotAudioRef = useRef<HTMLAudioElement | null>(null);
  const zonkAudioRef = useRef<HTMLAudioElement | null>(null);
  const spinRafRef = useRef<number | null>(null);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinCompleteRef = useRef<(() => void) | null>(null);
  const canStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinCountRef = useRef(0);
  const nextSlowSpinAtRef = useRef(Math.floor(Math.random() * 8) + 3);

  const [autoSpin, setAutoSpin] = useState(false);
  const [autoSpinTarget, setAutoSpinTarget] = useState(10);
  const [autoSpinDropdown, setAutoSpinDropdown] = useState(false);
  const autoSpinRef = useRef(false);
  const autoSpinTargetRef = useRef(10);
  const autoSpinsCompletedRef = useRef(0);
  const autoSpinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spinFnRef = useRef<() => Promise<void>>(async () => {});

  const BSC_CHAIN_ID = "0x38";
  const BSC_CHAIN_CONFIG = {
    chainId: BSC_CHAIN_ID,
    chainName: "BNB Smart Chain",
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
    rpcUrls: ["https://bsc-dataseed.binance.org/"],
    blockExplorerUrls: ["https://bscscan.com/"],
  };

  const switchToBSC = useCallback(async (provider: any) => {
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: BSC_CHAIN_ID }] });
    } catch (err: any) {
      if (err.code === 4902) {
        await provider.request({ method: "wallet_addEthereumChain", params: [BSC_CHAIN_CONFIG] });
      } else { throw err; }
    }
  }, []);

  const fetchBnbBalance = useCallback(async (provider: any, address: string) => {
    try {
      const ethersProvider = new ethers.BrowserProvider(provider);
      const bal = await ethersProvider.getBalance(address);
      setBnbBalance(parseFloat(ethers.formatEther(bal)).toFixed(4));
    } catch { setBnbBalance(null); }
  }, []);

  const fetchTokenBalances = useCallback(async (provider: any, address: string) => {
    try {
      const ethersProvider = new ethers.BrowserProvider(provider);
      const abi = ["function balanceOf(address) view returns (uint256)"];
      const [bflapBal, usdtBal] = await Promise.all([
        new ethers.Contract(BFLAP_CA, abi, ethersProvider).balanceOf(address),
        new ethers.Contract(USDT_CA, abi, ethersProvider).balanceOf(address),
      ]);
      setBflapBalance(parseFloat(ethers.formatUnits(bflapBal, 18)).toFixed(0));
      setUsdtBalance(parseFloat(ethers.formatUnits(usdtBal, 18)).toFixed(2));
    } catch { setBflapBalance(null); setUsdtBalance(null); }
  }, []);

  const cancelConnect = useCallback(() => {
    setWalletConnecting(false);
    setConnectingStep(null);
    setWalletError(null);
  }, []);

  const connectWallet = useCallback(async (provider: any) => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    setWalletConnecting(true);
    setConnectingStep("connecting");
    setWalletError(null);
    try {
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        try { await switchToBSC(provider); } catch {}
        connectedProviderRef.current = provider;
        setWalletAddress(address);
        setShowWalletModal(false);
        fetchBnbBalance(provider, address);
        fetchTokenBalances(provider, address);
        provider.on?.("accountsChanged", (accs: string[]) => {
          if (accs.length === 0) { setWalletAddress(null); setBnbBalance(null); setBflapBalance(null); setUsdtBalance(null); }
          else { setWalletAddress(accs[0]); fetchBnbBalance(provider, accs[0]); fetchTokenBalances(provider, accs[0]); }
        });
        provider.on?.("chainChanged", () => { window.location.reload(); });
      }
    } catch (err: any) {
      const msg = err.message || "Connection failed";
      if (err.code === 4001 || msg.includes("rejected") || msg.includes("denied")) {
        setWalletError("Connection rejected. Please approve in your wallet.");
      } else if (err.code === 4100) {
        setWalletError("Wallet not authorized. Please open MetaMask and connect this site first.");
      } else {
        setWalletError(msg);
      }
    } finally {
      connectingRef.current = false;
      setWalletConnecting(false);
      setConnectingStep(null);
    }
  }, [switchToBSC, fetchBnbBalance, fetchTokenBalances]);

  const disconnectWallet = useCallback(async () => {
    try {
      const win = window as any;
      if (win.ethereum?.request) {
        await win.ethereum.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
      }
    } catch {}
    setWalletAddress(null);
    setBnbBalance(null);
    setBflapBalance(null);
    setUsdtBalance(null);
    setSpinsLeft(0);
    setFreeLeft(0);
    setPurchasedRemaining(0);
    setTotalWon(0);
    setBflapWon(0);
    setBnbWon(0);
    setSpinsToday(0);
    setWithdrawnUsdt(0);
    setWithdrawnBflap(0);
    setWithdrawnBnb(0);
    setTotalPurchasedSpins(0);
    setTotalSpentBnb(0);
    setTotalSpentUsdt(0);
    setTotalSpentBflap(0);
    setResult(null);
    setShowResult(false);
    setPurchaseError(null);
    setPurchaseTx(null);
    setRetryTxHash(null);
    setPurchaseStep(null);
    connectingRef.current = false;
    connectedProviderRef.current = null;
    setWalletConnecting(false);
    setConnectingStep(null);
    setWalletError(null);
    setShowWalletModal(true);
  }, []);

  const loadStats = useCallback(async (wallet?: string, tier?: TierKey) => {
    if (!wallet) {
      setSpinsLeft(0); setSpinsLeft049(0); setSpinsLeft099(0); setSpinsLeft150(0);
      setTotalWon(0); setBflapWon(0); setBnbWon(0);
      setPurchasedRemaining(0); setSpinsToday(0);
      setWithdrawnUsdt(0); setWithdrawnBflap(0); setWithdrawnBnb(0);
      setTotalPurchasedSpins(0); setTotalSpentBnb(0);
      return;
    }
    try {
      const r = await fetch(`/api/lottery/stats?wallet=${encodeURIComponent(wallet)}`);
      if (r.ok) {
        const d = await r.json();
        const s049 = d.spinsLeft049 ?? 0;
        const s099 = d.spinsLeft099 ?? d.spinsLeft ?? 0;
        const s150 = d.spinsLeft150 ?? 0;
        setSpinsLeft049(s049);
        setSpinsLeft099(s099);
        setSpinsLeft150(s150);
        const activeTier = tier ?? spinTier;
        const activeLeft = activeTier === '049' ? s049 : activeTier === '150' ? s150 : s099;
        setSpinsLeft(activeLeft);
        setFreeLeft(0);
        setPurchasedRemaining(activeLeft);
        setTotalWon(d.totalWon ?? 0);
        setBflapWon(d.bflapWon ?? 0);
        setBnbWon(d.bnbWon ?? 0);
        setSpinsToday(d.spinsToday ?? 0);
        setWithdrawnUsdt(d.withdrawnUsdt ?? 0);
        setWithdrawnBflap(d.withdrawnBflap ?? 0);
        setWithdrawnBnb(d.withdrawnBnb ?? 0);
        setTotalPurchasedSpins(d.totalPurchasedSpins ?? 0);
        setTotalSpentBnb(d.totalSpentBnb ?? 0);
        setTotalSpentUsdt(d.totalSpentUsdt ?? 0);
        setTotalSpentBflap(d.totalSpentBflap ?? 0);
        if (d.withdrawToken) setWithdrawToken(d.withdrawToken);
      }
    } catch {}
  }, [spinTier]);

  const loadHistory = useCallback(async (wallet?: string) => {
    if (!wallet) { setHistory([]); return; }
    try {
      const r = await fetch(`/api/lottery/history?wallet=${encodeURIComponent(wallet)}`);
      if (r.ok) setHistory(await r.json());
    } catch {}
  }, []);

  const loadWinners = useCallback(async () => {
    try {
      const r = await fetch("/api/lottery/winners");
      if (r.ok) setWinners(await r.json());
    } catch {}
  }, []);

  const loadPurchases = useCallback(async (wallet?: string) => {
    if (!wallet) { setPurchaseHistory([]); return; }
    try {
      const r = await fetch(`/api/lottery/purchases?wallet=${encodeURIComponent(wallet)}`);
      if (r.ok) setPurchaseHistory(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const [dexRes, configRes] = await Promise.all([
          fetch("https://api.dexscreener.com/latest/dex/tokens/0xa2320fff1069ED5b4B02dDb386823E837A7e7777"),
          fetch("/api/lottery/config"),
        ]);
        const dexData = await dexRes.json();
        const configData = await configRes.json();
        const pairs = dexData?.pairs;
        if (pairs && pairs.length > 0) {
          const price = parseFloat(pairs[0].priceUsd || "0");
          if (price > 0) setBflapPriceUsd(price);
        } else if (configData?.bflapPrice > 0) {
          setBflapPriceUsd(configData.bflapPrice);
        }
        if (configData?.bnbPrice > 0) setBnbPriceUsd(configData.bnbPrice);
        if (configData?.depositAddress) setDepositAddress(configData.depositAddress);
      } catch {}
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadWinners();
    const interval = setInterval(loadWinners, 30000);
    return () => clearInterval(interval);
  }, [loadWinners]);

  useEffect(() => {
    loadStats(walletAddress || undefined);
    loadHistory(walletAddress || undefined);
    loadPurchases(walletAddress || undefined);
  }, [walletAddress, loadStats, loadHistory, loadPurchases]);

  useEffect(() => {
    const left = spinTier === '049' ? spinsLeft049 : spinTier === '150' ? spinsLeft150 : spinsLeft099;
    setSpinsLeft(left);
    setPurchasedRemaining(left);
  }, [spinTier, spinsLeft049, spinsLeft099, spinsLeft150]);

  const spin = useCallback(async () => {
    if (spinning || spinsLeft <= 0 || !walletAddress) return;

    setShowResult(false);
    setResult(null);
    setShowJackpot(false);
    setSpinning(true);
    setSpinsLeft((s) => s - 1);

    let winIdx = 0;
    let serverData: { segmentIndex?: number; spinsLeft?: number; freeLeft?: number; purchasedRemaining?: number; totalWon?: number; bflapWon?: number; bnbWon?: number; jackpotWin?: boolean } = {};
    try {
      const resp = await fetch("/api/lottery/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, tier: spinTier }),
      });
      serverData = await resp.json();
      if (!resp.ok) { setSpinning(false); setSpinsLeft((s) => s + 1); return; }
      winIdx = serverData.segmentIndex ?? 0;
    } catch {
      setSpinning(false);
      setSpinsLeft((s) => s + 1);
      return;
    }

    const segmentCenter = winIdx * SEGMENT_ANGLE + SEGMENT_ANGLE / 2;
    const jitter = (Math.random() - 0.5) * (SEGMENT_ANGLE * 0.6);
    const currentBase = baseRotation.current % 360;
    const targetAngle = ((270 - segmentCenter - currentBase) % 360 + 360) % 360;

    // Determine if this is a slow-motion spin
    spinCountRef.current += 1;
    const slowSpin = spinCountRef.current >= nextSlowSpinAtRef.current;
    if (slowSpin) {
      const intervals = [3, 5, 10];
      nextSlowSpinAtRef.current = spinCountRef.current + intervals[Math.floor(Math.random() * intervals.length)];
    }
    setIsSlowSpin(slowSpin);

    // Slow spin: 2 extra full rotations before the deceleration phase
    const fullSpins = (5 + Math.floor(Math.random() * 3)) + (slowSpin ? 2 : 0);
    const newRotation = baseRotation.current + fullSpins * 360 + targetAngle + jitter;

    setRotation(newRotation);

    // Show STOP button after 1s
    if (canStopTimerRef.current) clearTimeout(canStopTimerRef.current);
    canStopTimerRef.current = setTimeout(() => setCanStop(true), 1000);

    if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current);
    // Stop all result sounds immediately when a new spin starts
    try { if (winAudioRef.current) { winAudioRef.current.pause(); winAudioRef.current.currentTime = 0; } } catch {}
    try { if (jackpotAudioRef.current) { jackpotAudioRef.current.pause(); jackpotAudioRef.current.currentTime = 0; } } catch {}
    try { if (zonkAudioRef.current) { zonkAudioRef.current.pause(); zonkAudioRef.current.currentTime = 0; } } catch {}
    try {
      if (!spinAudioRef.current) {
        spinAudioRef.current = new Audio("/assets/wheel-spin-new.mp3");
        spinAudioRef.current.loop = true;
      }
      const audio = spinAudioRef.current;
      audio.currentTime = 0;
      audio.volume = 1;
      audio.playbackRate = 2.0;
      audio.play().catch(() => {});
      const spinStart = Date.now();
      const SPIN_AUDIO_MS = slowSpin ? 7100 : 4150;
      const tick = () => {
        const progress = Math.min((Date.now() - spinStart) / SPIN_AUDIO_MS, 1);
        if (slowSpin) {
          // Slow-spin: hold fast for first 40%, then long heavy deceleration
          if (progress < 0.4) {
            audio.playbackRate = 2.0;
          } else {
            audio.playbackRate = Math.max(0.18, 2.0 * Math.pow(1 - ((progress - 0.4) / 0.6), 1.4));
          }
          if (progress > 0.80) {
            audio.volume = Math.max(0, 1 - ((progress - 0.80) / 0.20));
          }
        } else {
          // Normal spin: fast start, heavy deceleration matching CSS cubic-bezier(0.17,0.67,0.12,0.99)
          audio.playbackRate = Math.max(0.25, 2.0 * Math.pow(1 - progress, 1.1));
          if (progress > 0.82) {
            audio.volume = Math.max(0, 1 - ((progress - 0.82) / 0.18));
          }
        }
        if (progress < 1) {
          spinRafRef.current = requestAnimationFrame(tick);
        } else {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = 1;
          audio.playbackRate = 1;
          spinRafRef.current = null;
        }
      };
      spinRafRef.current = requestAnimationFrame(tick);
    } catch {}

    const completeSpinResult = () => {
      setIsSpinStopped(false);
      setCanStop(false);
      baseRotation.current = newRotation;
      setSpinning(false);
      const winner = WHEEL_SEGMENTS[winIdx];
      setResult(winner);
      setShowResult(true);

      // Jackpot full-screen overlay: ONLY when wheel physically lands on the 0.1 BNB segment
      const isRealJackpot = (winner.id === 'bnb_01' && winner.bnbPrize >= 0.1);
      const isPoolJackpot = !!serverData.jackpotWin;
      if (isRealJackpot) setShowJackpot(true);

      // Auto-dismiss result popup: fade at 2.5s, hide at 2.8s
      setWinPopupFading(false);
      setTimeout(() => setWinPopupFading(true), 2500);
      setTimeout(() => { setShowResult(false); setWinPopupFading(false); }, 2800);

      const isWin = winner.prize !== 0 || (winner.bnbPrize && winner.bnbPrize > 0);
      // Big win (bot rain + jackpot sound): $5+ prizes — any BNB, $10 USDT, or 10K+ BFLAP
      const isBigWin = (winner.bnbPrize && winner.bnbPrize > 0)
        || (winner.prize >= 5 && winner.prize < 100)
        || (winner.prize >= 10000);
      if (isWin) {
        setShowWinEffect(true);
        setTimeout(() => setShowWinEffect(false), 3500);
        if (isBigWin) {
          // Gold glow for 0.1 BNB jackpot segment or pool jackpot win
          setBotRainIsJackpot(!!(isRealJackpot || isPoolJackpot));
          setShowBotRain(true);
          setTimeout(() => setShowBotRain(false), 6200);
        }
        try {
          if (isBigWin) {
            if (!jackpotAudioRef.current) jackpotAudioRef.current = new Audio("/assets/wheel-jackpot.mp3");
            jackpotAudioRef.current.currentTime = 0;
            jackpotAudioRef.current.volume = 1;
            jackpotAudioRef.current.play().catch(() => {});
          } else {
            if (!winAudioRef.current) winAudioRef.current = new Audio("/assets/wheel-stop-win.mp3");
            winAudioRef.current.currentTime = 0;
            winAudioRef.current.volume = 1;
            winAudioRef.current.play().catch(() => {});
          }
        } catch {}
      } else {
        // ZONK — play with ~120ms delay so it lands right as the popup appears
        setTimeout(() => {
          try {
            if (!zonkAudioRef.current) zonkAudioRef.current = new Audio("/assets/wheel-zonk.mp3");
            zonkAudioRef.current.currentTime = 0;
            zonkAudioRef.current.volume = 1;
            zonkAudioRef.current.play().catch(() => {});
          } catch {}
        }, 120);
      }

      if (serverData.spinsLeft !== undefined) {
        setSpinsLeft(serverData.spinsLeft);
        if (spinTier === '049') setSpinsLeft049(serverData.spinsLeft);
        else if (spinTier === '150') setSpinsLeft150(serverData.spinsLeft);
        else setSpinsLeft099(serverData.spinsLeft);
      }
      if (serverData.freeLeft !== undefined) setFreeLeft(serverData.freeLeft);
      if (serverData.purchasedRemaining !== undefined) setPurchasedRemaining(serverData.purchasedRemaining);
      if (serverData.totalWon !== undefined) setTotalWon(serverData.totalWon);
      if (serverData.bflapWon !== undefined) setBflapWon(serverData.bflapWon);
      if (serverData.bnbWon !== undefined) setBnbWon(serverData.bnbWon);
      loadHistory(walletAddress || undefined);
      loadWinners();

      // Auto-spin continuation
      if (autoSpinRef.current) {
        autoSpinsCompletedRef.current += 1;
        const remainingSpins = serverData.spinsLeft ?? 0;
        if (remainingSpins > 0 && autoSpinsCompletedRef.current < autoSpinTargetRef.current) {
          const delay = 2000 + Math.random() * 1000;
          autoSpinTimerRef.current = setTimeout(() => {
            if (autoSpinRef.current) spinFnRef.current();
          }, delay);
        } else {
          autoSpinRef.current = false;
          setAutoSpin(false);
          autoSpinsCompletedRef.current = 0;
        }
      }
    };

    spinCompleteRef.current = completeSpinResult;
    spinTimeoutRef.current = setTimeout(() => {
      if (spinCompleteRef.current) {
        spinCompleteRef.current();
        spinCompleteRef.current = null;
      }
    }, slowSpin ? 7250 : 4200);
  }, [spinning, spinsLeft, walletAddress, loadHistory, loadWinners]);

  // Keep spinFnRef always pointing to the latest spin function
  useEffect(() => { spinFnRef.current = spin; }, [spin]);

  const toggleAutoSpin = useCallback(() => {
    if (autoSpinRef.current) {
      autoSpinRef.current = false;
      setAutoSpin(false);
      autoSpinsCompletedRef.current = 0;
      if (autoSpinTimerRef.current) { clearTimeout(autoSpinTimerRef.current); autoSpinTimerRef.current = null; }
    } else {
      if (!walletAddress || spinsLeft <= 0) return;
      autoSpinsCompletedRef.current = 0;
      autoSpinRef.current = true;
      setAutoSpin(true);
      if (!spinning) spinFnRef.current();
    }
  }, [walletAddress, spinsLeft, spinning]);

  const stopSpin = useCallback(() => {
    if (!spinning || !spinCompleteRef.current) return;
    // Cancel the canStop timer
    if (canStopTimerRef.current) clearTimeout(canStopTimerRef.current);
    // Stop audio immediately
    if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current);
    spinRafRef.current = null;
    try {
      if (spinAudioRef.current) {
        spinAudioRef.current.pause();
        spinAudioRef.current.currentTime = 0;
        spinAudioRef.current.volume = 1;
        spinAudioRef.current.playbackRate = 1;
      }
    } catch {}
    // Cancel the scheduled result
    if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    // Snap wheel to final position by removing CSS transition
    setIsSpinStopped(true);
    setCanStop(false);
    // Call result immediately after one paint (so snap renders first)
    const complete = spinCompleteRef.current;
    spinCompleteRef.current = null;
    setTimeout(complete, 60);
  }, [spinning]);

  const tierPrice = TIER_CONFIG[spinTier].price;
  const tierMultiplier = TIER_CONFIG[spinTier].multiplier;
  const bflapPerSpin = bflapPriceUsd > 0 ? Math.round(tierPrice / bflapPriceUsd) : null;
  const bnbPerSpin = bnbPriceUsd > 0 ? (tierPrice / bnbPriceUsd).toFixed(4) : (tierPrice / 600).toFixed(4);

  const handlePurchase = useCallback(async () => {
    if (purchaseLoading || !walletAddress) return;
    const bnbDestination = LOTTERY_CONTRACT || depositAddress;
    const tokenDestination = depositAddress;
    if (!bnbDestination && !tokenDestination) {
      setPurchaseError("Lottery not configured yet. Check back soon!");
      return;
    }
    setPurchaseLoading(true);
    setPurchaseError(null);
    setPurchaseTx(null);
    setPurchaseStep(null);
    try {
      const win = window as any;
      const eth = connectedProviderRef.current
        || win.ethereum?.providers?.find((p: any) => p.isMetaMask)
        || win.ethereum
        || win.BinanceChain
        || win.okxwallet
        || win.trustwallet;
      if (!eth) throw new Error("No wallet found. Please connect a wallet first.");
      console.log("[Purchase] provider:", { isMetaMask: eth.isMetaMask, isBinance: eth.isBinance, isOKX: !!win.okxwallet && eth === win.okxwallet });

      setPurchaseStep("Switching to BSC...");
      try { await switchToBSC(eth); } catch {}

      let txHash = "";

      if (paymentMethod === "bnb") {
        const bnbWei = BigInt(Math.round(purchaseQty * parseFloat(bnbPerSpin) * 1e18));
        const valueHex = "0x" + bnbWei.toString(16);
        console.log("[Purchase] BNB send →", bnbDestination, "value:", valueHex);
        setPurchaseStep("Confirm BNB payment in wallet...");
        txHash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: walletAddress, to: bnbDestination, value: valueHex }],
        });
      } else if (paymentMethod === "usdt") {
        const usdtWei = BigInt(Math.round(purchaseQty * tierPrice * 1e18));
        const iface = new ethers.Interface(["function transfer(address,uint256) returns (bool)"]);
        const data = iface.encodeFunctionData("transfer", [tokenDestination, usdtWei]);
        console.log("[Purchase] USDT transfer →", USDT_CA, "amount:", usdtWei.toString());
        setPurchaseStep("Confirm USDT transfer in wallet...");
        txHash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: walletAddress, to: USDT_CA, data, gas: "0x186A0" }],
        });
      } else {
        if (!bflapPerSpin) throw new Error("BFLAP price not available yet");
        const bflapWei = BigInt(Math.round(purchaseQty * bflapPerSpin * 1e18));
        const iface = new ethers.Interface(["function transfer(address,uint256) returns (bool)"]);
        const data = iface.encodeFunctionData("transfer", [tokenDestination, bflapWei]);
        console.log("[Purchase] BFLAP transfer →", BFLAP_CA, "amount:", bflapWei.toString());
        setPurchaseStep("Confirm BFLAP transfer in wallet...");
        txHash = await eth.request({
          method: "eth_sendTransaction",
          params: [{ from: walletAddress, to: BFLAP_CA, data, gas: "0x186A0" }],
        });
      }

      console.log("[Purchase] txHash from wallet:", txHash);
      if (!txHash || typeof txHash !== "string" || !txHash.startsWith("0x") || txHash.length !== 66) {
        throw new Error(`Wallet returned invalid hash: "${txHash || "empty"}". Use MetaMask on BSC network.`);
      }

      setRetryTxHash(txHash);
      setPurchaseStep("Verifying on-chain...");
      const r = await fetch("/api/lottery/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, txHash, currency: paymentMethod, quantity: purchaseQty, tier: spinTier }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setRetryTxHash(null);
        setPurchaseTx(txHash);
        if (d.spinsLeft !== undefined) setSpinsLeft(d.spinsLeft);
        await loadStats(walletAddress);
        await loadPurchases(walletAddress);
        if (d.jackpotWin && d.jackpotHighRtp) {
          setShowJackpot(true);
        }
      } else {
        setPurchaseError(d.error || "Verification failed");
      }
    } catch (err: any) {
      console.error("[Purchase] error:", err);
      if (err.code === 4001 || err.code === "ACTION_REJECTED" || err.message?.includes("rejected") || err.message?.includes("denied")) {
        setRetryTxHash(null);
        setPurchaseError("Transaction rejected by wallet.");
      } else {
        setPurchaseError(err.reason || err.message || "Purchase failed. Check console for details.");
      }
    } finally {
      setPurchaseStep(null);
      setPurchaseLoading(false);
    }
  }, [purchaseQty, purchaseLoading, walletAddress, paymentMethod, bnbPerSpin, bflapPerSpin, depositAddress, loadStats, loadPurchases, switchToBSC, spinTier, tierPrice]);

  const handleRetryVerify = useCallback(async () => {
    if (!retryTxHash || !walletAddress || purchaseLoading) return;
    setPurchaseLoading(true);
    setPurchaseError(null);
    setPurchaseStep("Re-verifying on-chain...");
    try {
      const r = await fetch("/api/lottery/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, txHash: retryTxHash, currency: paymentMethod, quantity: purchaseQty, tier: spinTier }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        setRetryTxHash(null);
        setPurchaseTx(retryTxHash);
        if (d.spinsLeft !== undefined) setSpinsLeft(d.spinsLeft);
        await loadStats(walletAddress);
        await loadPurchases(walletAddress);
      } else {
        setPurchaseError(d.error || "Verification failed");
      }
    } catch (err: any) {
      setPurchaseError(err.message || "Retry failed");
    } finally {
      setPurchaseStep(null);
      setPurchaseLoading(false);
    }
  }, [retryTxHash, walletAddress, paymentMethod, purchaseQty, purchaseLoading, loadStats, loadPurchases]);

  const doWithdraw = useCallback(async (currency: "bnb" | "bflap" | "usdt", amount: number) => {
    if (!walletAddress || withdrawLoading || !withdrawToken) return;
    setWithdrawLoading(currency);
    setWithdrawMsg(null);
    try {
      const r = await fetch("/api/lottery/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, currency, amount, withdrawToken }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        const label = currency === "bnb" ? `${amount.toFixed(4)} BNB`
                    : currency === "bflap" ? `${Math.round(amount).toLocaleString()} BFLAP`
                    : `$${amount.toFixed(2)} USDT`;
        setWithdrawSuccessPopup({ currency, amount: label, txHash: d.txHash });
        setWithdrawToken("");
        await loadStats(walletAddress);
      } else {
        setWithdrawMsg({ ok: false, text: d.error || "Withdraw failed" });
      }
    } catch {
      setWithdrawMsg({ ok: false, text: "Network error" });
    }
    setWithdrawLoading(null);
  }, [walletAddress, withdrawLoading, withdrawToken, loadStats]);

  return (
    <div className="absolute inset-0 overflow-auto" style={{ top: 0, background: "transparent" }}>
      <div className="max-w-7xl mx-auto px-4 pb-8 flex flex-col lg:flex-row gap-6 lg:items-start" style={{ paddingTop: headerHeight + 16, position: 'relative', zIndex: 2 }}>
        <div className="flex-1 flex flex-col items-center order-1 lg:order-2">
          <div className="text-center mb-2 sm:mb-4">
            <h1 className="text-2xl sm:text-4xl lottery-title-3d">
              {t.lotteryTitle as string}
            </h1>
            <p className="text-white/40 text-xs sm:text-sm mt-0.5 sm:mt-1">{t.lotterySubtitle as string}</p>
          </div>

          <div
            className={`relative${showWinEffect ? ` win-sparkle-ring${result?.bnbPrize && result.bnbPrize >= 0.1 ? ' is-jackpot' : ''}` : ''}`}
            style={{
              width: 'min(90vw, calc(100vh - 220px), 600px)',
              height: 'min(90vw, calc(100vh - 220px), 600px)',
            }}
          >
            <WheelSVG
              rotation={rotation}
              wheelTransition={
                (spinning && !isSpinStopped)
                  ? (isSlowSpin ? "transform 7s cubic-bezier(0.08, 0.72, 0.06, 0.99)" : "transform 4s cubic-bezier(0.17, 0.67, 0.12, 0.99)")
                  : "none"
              }
              tierMultiplier={tierMultiplier}
            />
            <PointerTicker isSpinning={spinning && !isSpinStopped} />
            {showWinEffect && <SparkleOverlay isJackpot={!!(result?.bnbPrize && result.bnbPrize >= 0.1)} />}

            {/* Win result popup — centered over wheel, auto-dismissed */}
            {showResult && result && (() => {
              const winDisplay = getWinDisplay(result, tierMultiplier);
              return (
                <div className={`win-popup-box${result.bnbPrize && result.bnbPrize >= 0.1 ? ' is-jackpot' : ''}${winPopupFading ? ' is-exiting' : ''}`}>
                  {result.prize === 0 && !result.bnbPrize ? (
                    <>
                      <div style={{ fontSize: 36 }}>😔</div>
                      <div className="text-white/60 font-bold text-base mt-1 tracking-wide">ZONK</div>
                      <div className="text-white/30 text-xs mt-1">{t.lotteryBetterLuck as string}</div>
                    </>
                  ) : (
                    <>
                      <div className="text-xs font-semibold tracking-widest uppercase mb-1" style={{ color: result.bnbPrize ? '#ffd700' : '#a78bfa' }}>
                        {result.bnbPrize && result.bnbPrize >= 0.1 ? t.lotteryJackpotLabel as string : t.lotteryYouWon as string}
                      </div>
                      <div className="font-black tracking-tight leading-none" style={{
                        fontSize: 38,
                        color: result.bnbPrize ? '#ffd700' : '#ffffff',
                        textShadow: result.bnbPrize
                          ? '0 0 20px rgba(255,215,0,0.8), 0 2px 0 rgba(0,0,0,0.5)'
                          : '0 0 20px rgba(122,51,251,0.8), 0 2px 0 rgba(0,0,0,0.5)',
                      }}>
                        {winDisplay.title}
                      </div>
                      <div className="text-white/40 text-xs mt-2">{winDisplay.display}</div>
                    </>
                  )}
                </div>
              );
            })()}

            {/* Center SPIN button + auto-spin controls (hidden while result popup is shown) */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center transition-opacity duration-200"
              style={{
                width: 'min(52%, 280px)',
                opacity: showResult ? 0 : 1,
                pointerEvents: showResult ? 'none' : 'auto',
                gap: 'clamp(6px, 2%, 10px)',
              }}
            >
              {/* Styled center box */}
              <div
                className="w-full flex flex-col items-center rounded-2xl border wheel-center-box"
                style={{
                  padding: 'clamp(10px, 3.5%, 22px) clamp(12px, 5%, 28px)',
                  background: "linear-gradient(145deg, rgba(20,6,50,0.82) 0%, rgba(8,3,24,0.88) 100%)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  borderColor: "rgba(122,51,251,0.28)",
                  boxShadow: "0 0 32px rgba(122,51,251,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
                }}
              >
                <div className="wheel-center-logo-wrap" style={{ marginBottom: 'clamp(6px, 2.5%, 14px)' }}>
                  <img
                    src="/assets/bflap-logo.png"
                    alt="BFLAP"
                    className="wheel-center-logo rounded-full"
                  />
                  <div className="wheel-center-glow" />
                </div>
                {(canStop || autoSpin) ? (
                  <button
                    onClick={() => { if (canStop) stopSpin(); if (autoSpin) toggleAutoSpin(); }}
                    className="font-bold text-white btn-jelly-stop"
                    style={{ padding: 'clamp(5px, 1.8%, 11px) clamp(14px, 6%, 30px)', fontSize: 'clamp(11px, 2.8vmin, 16px)' }}
                  >
                    {t.lotteryStop as string}
                  </button>
                ) : (
                  <button
                    onClick={walletAddress ? spin : () => setShowWalletModal(true)}
                    disabled={spinning || (!!walletAddress && spinsLeft <= 0)}
                    className={`font-bold text-white transition-all duration-200 btn-jelly-bflap ${
                      spinning || (!!walletAddress && spinsLeft <= 0) ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                    style={{ padding: 'clamp(7px, 2%, 13px) clamp(32px, 10%, 60px)', fontSize: 'clamp(11px, 2.8vmin, 16px)', width: '100%' }}
                  >
                    {spinning ? t.lotterySpinning as string : !walletAddress ? t.connectWallet as string : spinsLeft <= 0 ? t.lotteryPurchaseSpinsBtn as string : t.lotterySpinBtn as string}
                  </button>
                )}
              </div>

              {/* Auto-spin controls row */}
              {walletAddress && (
                <div className="flex items-center justify-center" style={{ gap: 'clamp(6px, 2%, 12px)' }}>
                  {/* Repeat toggle button */}
                  <button
                    onClick={toggleAutoSpin}
                    className={`auto-spin-toggle-btn${autoSpin ? ' is-active' : ''}`}
                    title={autoSpin ? 'Stop auto-spin' : 'Start auto-spin'}
                  >
                    <RefreshCw size={22} className={autoSpin ? 'auto-spin-icon-spinning' : ''} />
                  </button>

                  {/* Target count dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setAutoSpinDropdown(d => !d)}
                      className="auto-spin-count-btn"
                    >
                      {autoSpinTarget}x
                    </button>
                    {autoSpinDropdown && (
                      <div className="auto-spin-dropdown">
                        {[10, 20, 50].map(n => (
                          <button
                            key={n}
                            className={`auto-spin-dropdown-item${autoSpinTarget === n ? ' is-selected' : ''}`}
                            onClick={() => { setAutoSpinTarget(n); autoSpinTargetRef.current = n; setAutoSpinDropdown(false); }}
                          >
                            {n}x
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="lg:w-72 flex flex-col gap-4 order-2 lg:order-1 lg:self-start">
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 card-jelly">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#7a33fb]" />
              {t.lotteryYourStats as string}
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/40">{t.lotterySpinsAvailable as string}</span>
                <span className="text-white font-bold">{walletAddress ? spinsLeft : 0}</span>
              </div>
              {!walletAddress && (
                <div className="text-xs text-white/30 text-right -mt-1">{t.lotteryConnectToView as string}</div>
              )}
              {walletAddress && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">{t.lotteryWalletBalance as string}</span>
                  <span className="text-[#f0b90b] font-bold">{bnbBalance ? `${bnbBalance} BNB` : "—"}</span>
                </div>
              )}
              {walletAddress && totalPurchasedSpins > 0 && (
                <div className="flex justify-between text-sm gap-2">
                  <span className="text-white/40 shrink-0">{t.lotteryTotalPurchased as string}</span>
                  <span className="text-white/70 font-bold text-right leading-snug">
                    {totalPurchasedSpins} {t.lotterySpins as string}
                  </span>
                </div>
              )}
              {totalWon > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">{t.lotteryTotalWonUsdt as string}</span>
                  <span className="text-[#7a33fb] font-bold">${totalWon.toFixed(2)}</span>
                </div>
              )}
              {bflapWon > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">{t.lotteryTotalWonBflap as string}</span>
                  <span className="text-[#7a33fb] font-bold">{bflapWon.toLocaleString()} BFLAP</span>
                </div>
              )}
              {bnbWon > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">{t.lotteryTotalWonBnb as string}</span>
                  <span className="text-[#f0b90b] font-bold">{bnbWon.toFixed(4)} BNB</span>
                </div>
              )}
              {totalWon === 0 && bflapWon === 0 && bnbWon === 0 && walletAddress && (
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">{t.lotteryTotalWonUsdt as string}</span>
                  <span className="text-white/30">—</span>
                </div>
              )}
              {walletAddress && (totalWon > 0 || bflapWon > 0 || bnbWon > 0) && (() => {
                const availUsdt = Math.max(0, totalWon - withdrawnUsdt);
                const availBflap = Math.max(0, bflapWon - withdrawnBflap);
                const availBnb = Math.max(0, bnbWon - withdrawnBnb);
                const hasAny = availUsdt > 0 || availBflap > 0 || availBnb > 0;
                return (
                  <div className="pt-1 border-t border-white/[0.06] space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/40">{t.lotteryAvailableWithdraw as string}</span>
                      <span className="text-green-400 font-bold flex flex-col items-end gap-0.5">
                        {availUsdt > 0 && <span>${availUsdt.toFixed(2)} USDT</span>}
                        {availBflap > 0 && <span>{availBflap.toLocaleString()} BFLAP</span>}
                        {availBnb > 0 && <span>{availBnb.toFixed(4)} BNB</span>}
                        {!hasAny && <span className="text-white/30">—</span>}
                      </span>
                    </div>
                    {hasAny && (
                      <div className="flex flex-col gap-1">
                        {availBnb > 0 && (
                          <button
                            onClick={() => doWithdraw("bnb", availBnb)}
                            disabled={!!withdrawLoading || !withdrawToken}
                            className="w-full py-2 text-sm btn-jelly-bnb"
                          >
                            {withdrawLoading === "bnb" ? t.lotterySending as string : `${t.lotteryWithdrawBtnBnb as string} ${availBnb.toFixed(4)}`}
                          </button>
                        )}
                        {availBflap > 0 && (
                          <button
                            onClick={() => doWithdraw("bflap", availBflap)}
                            disabled={!!withdrawLoading || !withdrawToken}
                            className="w-full py-2 text-sm btn-jelly-bflap"
                          >
                            {withdrawLoading === "bflap" ? t.lotterySending as string : `${t.lotteryWithdrawBtnBflap as string} ${availBflap.toLocaleString()}`}
                          </button>
                        )}
                        {availUsdt > 0 && (
                          <button
                            onClick={() => doWithdraw("usdt", availUsdt)}
                            disabled={!!withdrawLoading || !withdrawToken}
                            className="w-full py-2 text-sm btn-jelly-usdt"
                          >
                            {withdrawLoading === "usdt" ? t.lotterySending as string : `${t.lotteryWithdrawBtnUsdt as string} $${availUsdt.toFixed(2)}`}
                          </button>
                        )}
                        {withdrawMsg && !withdrawMsg.ok && (
                          <div className="text-[11px] text-center px-2 py-1 rounded-lg text-red-400 bg-red-400/10">
                            {withdrawMsg.text}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
              <div className="flex justify-between text-sm pt-1 border-t border-white/[0.06]">
                <span className="text-white/40">{t.lotterySpinsToday as string}</span>
                <span className="text-white font-bold">{spinsToday}</span>
              </div>
            </div>
          </div>

          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 card-jelly">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#f0b90b]" />
              {t.lotteryTopWinners as string}
            </h3>
            {winners.length === 0 ? (
              <p className="text-white/20 text-xs text-center py-4">{t.lotteryNoWinners as string}</p>
            ) : (
              <div className="space-y-1.5">
                {winners.map((w, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <span className="text-white/20 w-4">{idx + 1}.</span>
                      <span className="text-white/60 font-mono">{w.user}</span>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      {w.totalWon > 0 && <span className="text-[#7a33fb] font-bold">${w.totalWon.toFixed(2)}</span>}
                      {w.totalBflap > 0 && <span className="text-[#7a33fb] font-bold">{w.totalBflap.toLocaleString()} BFLAP</span>}
                      {w.totalBnb > 0 && <span className="text-[#f0b90b] font-bold">{w.totalBnb.toFixed(4)} BNB</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:w-72 flex flex-col gap-4 order-3 lg:self-start">
          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-3 card-jelly">
            {walletAddress ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-white/60 font-mono text-xs">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
                  {bnbBalance && <span className="text-white/30 text-xs">{bnbBalance} BNB</span>}
                </div>
                <button onClick={disconnectWallet} className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors">{t.lotteryDisconnect as string}</button>
              </div>
            ) : (
              <button
                onClick={() => setShowWalletModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2 text-white text-sm btn-jelly-bflap"
              >
                <Wallet size={15} />
                {t.connectWallet as string}
              </button>
            )}
          </div>

          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 card-jelly">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2 flex-wrap">
              <span className="w-2 h-2 rounded-full bg-[#7a33fb] shrink-0" />
              <span>{t.lotteryPurchaseSpin as string}</span>
              <div className="flex gap-1 ml-auto">
                {(['049','099','150'] as TierKey[]).map(tk => (
                  <button
                    key={tk}
                    onClick={() => setSpinTier(tk)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all tab-jelly ${spinTier === tk ? 'bg-[#7a33fb] text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'}`}
                  >{TIER_CONFIG[tk].label}</button>
                ))}
              </div>
            </h3>
            <div className="space-y-3">
              <div className="text-white/30 text-[11px] text-center mb-1">{TIER_CONFIG[spinTier].label} {t.lotteryPerSpin as string}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(([
                  { id: "bnb", label: "BNB", amount: bnbPerSpin, sub: `≈ ${TIER_CONFIG[spinTier].label}`, bal: bnbBalance, balSuffix: "BNB" },
                  { id: "bflap", label: "BFLAP", amount: bflapPerSpin ? bflapPerSpin.toLocaleString() : "...", sub: `≈ ${TIER_CONFIG[spinTier].label}`, bal: bflapBalance, balSuffix: "BFLAP" },
                  { id: "usdt", label: "USDT", amount: tierPrice.toFixed(2), sub: `= ${TIER_CONFIG[spinTier].label}`, bal: usdtBalance, balSuffix: "USDT" },
                ]) as { id: "bnb" | "bflap" | "usdt"; label: string; amount: string; sub: string; bal: string | null; balSuffix: string }[]).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all text-center tab-jelly ${paymentMethod === m.id ? "border-[#7a33fb] bg-[#7a33fb]/10 tab-active" : "border-white/8 bg-white/[0.03]"}`}
                  >
                    <span className={`font-bold text-xs ${paymentMethod === m.id ? "text-white" : "text-white/60"}`}>{m.label}</span>
                    <span className={`font-bold text-[11px] mt-0.5 ${paymentMethod === m.id ? "text-[#7a33fb]" : "text-white/40"}`}>{m.amount}</span>
                    <span className="text-[9px] text-white/20">{m.sub}</span>
                    {walletAddress && m.bal !== null && (
                      <span className="text-[8px] text-white/30 mt-0.5 leading-tight">{Number(m.bal).toLocaleString()} {m.balSuffix}</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-[10px] text-white/20 justify-center">
                {bflapPriceUsd > 0 && <span>BFLAP $<span className="text-white/35">{bflapPriceUsd < 0.001 ? bflapPriceUsd.toExponential(2) : bflapPriceUsd.toFixed(6)}</span></span>}
                {bflapPriceUsd > 0 && bnbPriceUsd > 0 && <span className="mx-1">·</span>}
                {bnbPriceUsd > 0 && <span>BNB $<span className="text-white/35">{bnbPriceUsd.toFixed(0)}</span></span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPurchaseQty(q => Math.max(1, q - 1))}
                  className="w-8 h-8 text-white/70 text-lg font-bold flex items-center justify-center btn-jelly-mini"
                >−</button>
                <div className="flex-1 text-center">
                  <span className="text-white font-bold text-lg">{purchaseQty}</span>
                  <span className="text-white/30 text-xs ml-1">{purchaseQty > 1 ? t.lotterySpins as string : t.lotterySpin as string}</span>
                </div>
                <button
                  onClick={() => setPurchaseQty(q => q + 1)}
                  className="w-8 h-8 text-white/70 text-lg font-bold flex items-center justify-center btn-jelly-mini"
                >+</button>
              </div>
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-white/30">{t.lotteryTotal as string}</span>
                <span className="text-[#f0b90b] font-bold">
                  {paymentMethod === "bnb" && `${(purchaseQty * parseFloat(bnbPerSpin)).toFixed(4)} BNB`}
                  {paymentMethod === "bflap" && (bflapPerSpin ? `${(purchaseQty * bflapPerSpin).toLocaleString()} BFLAP` : "... BFLAP")}
                  {paymentMethod === "usdt" && `${(purchaseQty * tierPrice).toFixed(2)} USDT`}
                </span>
              </div>
              {purchaseStep && (
                <div className="flex items-center gap-2 text-[10px] text-[#7a33fb] bg-[#7a33fb]/10 rounded-lg px-2 py-1.5">
                  <Loader2 size={10} className="animate-spin shrink-0" />
                  <span>{purchaseStep}</span>
                </div>
              )}
              {purchaseError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 font-medium space-y-1.5">
                  <div>{purchaseError}</div>
                  {retryTxHash && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={handleRetryVerify}
                        disabled={purchaseLoading}
                        className="text-[10px] bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 rounded px-2 py-0.5 font-semibold transition-colors disabled:opacity-50"
                      >
                        {purchaseLoading ? t.lotteryRetrying as string : t.lotteryTryAgain as string}
                      </button>
                      <a
                        href={`https://bscscan.com/tx/${retryTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-red-300/70 hover:text-red-300 underline flex items-center gap-0.5"
                      >
                        <ExternalLink size={9} />
                        {t.lotteryViewTx as string}
                      </a>
                    </div>
                  )}
                </div>
              )}
              {purchaseTx && !purchaseError && (
                <a
                  href={`https://bscscan.com/tx/${purchaseTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-2 py-1.5 hover:bg-green-500/20 transition-colors"
                >
                  <ExternalLink size={9} />
                  {t.lotterySpinsAdded as string}
                </a>
              )}
              {walletAddress ? (() => {
                const totalBnb = purchaseQty * parseFloat(bnbPerSpin);
                const totalBflap = purchaseQty * (bflapPerSpin || 0);
                const totalUsdt = purchaseQty * tierPrice;
                const insufficientBnb = paymentMethod === "bnb" && bnbBalance !== null && parseFloat(bnbBalance) < totalBnb;
                const insufficientBflap = paymentMethod === "bflap" && bflapBalance !== null && parseFloat(bflapBalance) < totalBflap;
                const insufficientUsdt = paymentMethod === "usdt" && usdtBalance !== null && parseFloat(usdtBalance) < totalUsdt;
                const insufficient = insufficientBnb || insufficientBflap || insufficientUsdt;
                return (
                  <>
                    {insufficient && (
                      <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 font-medium">
                        {t.lotteryInsufficient as string} {paymentMethod.toUpperCase()} {t.lotteryBalanceLabel as string}
                      </div>
                    )}
                    <button
                      onClick={handlePurchase}
                      disabled={purchaseLoading || insufficient}
                      className={`w-full py-2.5 text-white font-bold text-sm btn-jelly-bflap ${purchaseLoading || insufficient ? "opacity-50 cursor-not-allowed" : ""}`}
                    >
                      {purchaseLoading ? <span className="flex items-center gap-1.5 justify-center"><Loader2 size={13} className="animate-spin" />{t.lotteryProcessing as string}</span> : `${t.lotteryPurchaseSpin as string} ×${purchaseQty}`}
                    </button>
                  </>
                );
              })() : (
                <button
                  onClick={() => setShowWalletModal(true)}
                  className="w-full py-2.5 text-[#9b6fff] font-bold text-sm flex items-center justify-center gap-2 btn-jelly-outline"
                >
                  <Wallet size={14} />
                  {t.lotteryConnectToBuy as string}
                </button>
              )}
            </div>
          </div>

          <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 card-jelly">
            <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-400" />
              {t.lotteryRecentSpins as string}
            </h3>
            {history.length === 0 ? (
              <p className="text-white/20 text-xs text-center py-4">{t.lotteryNoSpins as string}</p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {history.map((h, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-white/[0.03]">
                    <span className={h.prize !== 0 ? "text-[#7a33fb]" : "text-white/40"}>{h.title}</span>
                    <span className="text-white/20">{new Date(h.created_at).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {purchaseHistory.length > 0 && (
            <div className="bg-black/60 backdrop-blur-md border border-white/10 rounded-2xl p-4">
              <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#f0b90b]" />
                {t.lotteryPurchaseHistory as string}
              </h3>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {purchaseHistory.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-white/[0.03]">
                    <div>
                      <span className="text-white/60">{p.quantity} {p.quantity > 1 ? t.lotterySpins as string : t.lotterySpin as string}</span>
                      <span className="text-white/20 ml-2">{new Date(p.created_at).toLocaleDateString()}</span>
                    </div>
                    <span className={`font-bold ${p.currency === 'usdt' ? 'text-green-400' : p.currency === 'bflap' ? 'text-[#7a33fb]' : 'text-[#f0b90b]'}`}>
                      {p.currency === 'usdt' ? `${(p.quantity * 0.99).toFixed(2)} USDT` : p.currency === 'bflap' ? `${p.quantity} × BFLAP` : `${parseFloat(p.total_bnb || '0').toFixed(4)} BNB`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
      {showWalletModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => { if (!walletConnecting) { setShowWalletModal(false); setWalletError(null); } }}>
          <div className="bg-black/60 backdrop-blur-md rounded-2xl border border-white/10 w-full max-w-[420px] mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-2">
              <h3 className="text-base font-bold text-white">{t.connectWallet as string}</h3>
              <button onClick={() => { cancelConnect(); setShowWalletModal(false); }} className="text-white/40 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-4 pt-2 space-y-4">
              {walletError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-xs text-red-400">{walletError}</div>
              )}
              {walletConnecting ? (
                <div className="flex flex-col items-center justify-center gap-3 py-6">
                  <Loader2 size={24} className="animate-spin text-[#5b31fe]" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-white">{t.lotteryConnecting as string}</div>
                    <div className="text-xs text-white/40 mt-1">{t.lotteryCheckWallet as string}</div>
                  </div>
                  <button onClick={cancelConnect} className="text-xs text-white/30 hover:text-white/60 underline transition-colors mt-1">
                    {t.vbCancel as string}
                  </button>
                </div>
              ) : (
                <>
                  <div className="text-[11px] text-white/40 font-bold uppercase tracking-wider">{t.lotterySelectWallet as string}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "metamask", name: "Metamask", icon: "https://assets.pancakeswap.finance/web/wallets/metamask.png", detect: () => { const win = window as any; const p = win.ethereum?.providers?.find((p: any) => p.isMetaMask) || (win.ethereum?.isMetaMask ? win.ethereum : null); return !!p; }, provider: () => { const win = window as any; return win.ethereum?.providers?.find((p: any) => p.isMetaMask) || (win.ethereum?.isMetaMask ? win.ethereum : null); }, deepLink: "https://metamask.app.link/dapp/" + window.location.host + window.location.pathname },
                      { id: "trust", name: "Trust Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/trust.png", detect: () => (window as any).trustwallet?.isTrust || (window as any).ethereum?.isTrust, provider: () => (window as any).trustwallet || (window as any).ethereum, deepLink: "https://link.trustwallet.com/open_url?coin_id=20000714&url=" + encodeURIComponent(window.location.href) },
                      { id: "binance", name: "Binance Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/binance-w3w.png", detect: () => !!(window as any).BinanceChain, provider: () => (window as any).BinanceChain, deepLink: "https://www.binance.com/en/web3wallet" },
                      { id: "okx", name: "OKX Wallet", icon: "https://assets.pancakeswap.finance/web/wallets/okx-wallet.png", detect: () => !!(window as any).okxwallet, provider: () => (window as any).okxwallet, deepLink: "https://www.okx.com/download" },
                      { id: "walletconnect", name: "WalletConnect", icon: "https://assets.pancakeswap.finance/web/wallets/walletconnect.png", detect: () => false, provider: () => null, deepLink: "" },
                    ].map((w) => {
                      const detected = w.detect();
                      return (
                        <button
                          key={w.id}
                          onClick={() => {
                            if (detected && w.provider()) {
                              connectWallet(w.provider());
                            } else if (w.id === "walletconnect") {
                              setWalletError("WalletConnect requires a Project ID. Use MetaMask or Trust Wallet mobile app instead.");
                            } else if (/Android|iPhone|iPad/i.test(navigator.userAgent) && w.deepLink) {
                              window.open(w.deepLink, "_blank");
                            } else {
                              setWalletError(`${w.name} not detected. Install the extension or open this page in ${w.name}'s browser.`);
                            }
                          }}
                          className="flex flex-col items-center gap-2 bg-[#0d0d1a] hover:bg-[#151528] rounded-xl p-3 transition-colors border border-white/5 hover:border-[#5b31fe]/50 relative"
                        >
                          {detected && <div className="absolute top-1.5 right-1.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d1a]" />}
                          <div className="w-12 h-12 rounded-xl overflow-hidden">
                            <img src={w.icon} alt={w.name} className="w-full h-full object-cover" />
                          </div>
                          <span className="text-[11px] font-bold text-white/70 truncate w-full text-center">{w.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  {(window as any).ethereum && !(window as any).ethereum.isMetaMask && !(window as any).ethereum.isTrust && (
                    <>
                      <div className="text-[11px] text-white/40 font-bold uppercase tracking-wider mt-2">{t.lotteryMoreWallets as string}</div>
                      <div className="grid grid-cols-3 gap-2">
                        <button onClick={() => connectWallet((window as any).ethereum)} className="flex flex-col items-center gap-2 bg-[#0d0d1a] hover:bg-[#151528] rounded-xl p-3 transition-colors border border-white/5 hover:border-[#5b31fe]/50 relative">
                          <div className="absolute top-1.5 right-1.5 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0d0d1a]" />
                          <div className="w-12 h-12 rounded-xl bg-[#2a2a3e] flex items-center justify-center">
                            <Wallet size={24} className="text-[#5b31fe]" />
                          </div>
                          <span className="text-[11px] font-bold text-white/70 truncate w-full text-center">{t.lotteryBrowserWallet as string}</span>
                        </button>
                      </div>
                    </>
                  )}
                  <div className="text-[10px] text-white/20 text-center pt-1">{t.lotteryMobileHint as string}</div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showJackpot && (
        <div id="jackpot-overlay" onClick={() => setShowJackpot(false)}>
          <button className="jackpot-close-btn" onClick={() => setShowJackpot(false)}>✕</button>
          <div className="jackpot-bright-bg">
            <div className="jackpot-super-star"></div>
            <div className="jackpot-radial-bg"></div>
          </div>
          <div className="jackpot-wrapper">
            <div className="jackpot-header">
              <div className="jackpot-shape-wraper"><div className="jackpot-bg-shape"></div></div>
              <div className="jackpot-shape-wraper"><div className="jackpot-bg-shape2"></div></div>
              <div className="jackpot-shape-wraper"><div className="jackpot-bg-shape3"></div></div>
              <div className="jackpot-shape-wraper"><div className="jackpot-bg-shape4"></div></div>
              <div className="jackpot-country-and-date">
                <span className="jackpot-date-time">BFLAP</span>
                <span className="jackpot-deposit-from">{t.lotteryWord as string}</span>
              </div>
              <div className="jackpot-name-shadow">
                {Array.from({ length: 15 }).map((_, i) => (
                  <span key={i} className="jackpot-user-name">{t.lotteryJackpotWord as string}</span>
                ))}
              </div>
            </div>
            <div className="jackpot-amount-block">
              <div className="jackpot-foreground-light"></div>
              <div>{TIER_CONFIG[spinTier].jackpotBnb} BNB</div>
            </div>
          </div>
        </div>
      )}
      {showBotRain && <BotRainOverlay isJackpot={botRainIsJackpot} />}

      {withdrawSuccessPopup && (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}>
          <div className="relative bg-[#0e0620]/80 border border-green-400/40 rounded-3xl p-6 sm:p-8 max-w-sm w-full text-center shadow-2xl shadow-green-400/10 card-jelly">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-white font-black text-xl mb-1">{t.lotteryWithdrawalSent as string}</h2>
            <p className="text-green-400 font-bold text-lg mb-1">{withdrawSuccessPopup.amount}</p>
            <p className="text-white/40 text-xs mb-4">{t.lotterySentToWallet as string}</p>
            <a
              href={`https://bscscan.com/tx/${withdrawSuccessPopup.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#a78bfa] underline underline-offset-2 mb-5 hover:text-white transition-colors"
            >
              {t.lotteryViewBscScan as string} ↗
            </a>
            <br />
            <button
              onClick={() => setWithdrawSuccessPopup(null)}
              className="mt-2 w-full py-2.5 font-bold text-sm btn-jelly-bflap"
            >
              {t.lotteryDone as string}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
