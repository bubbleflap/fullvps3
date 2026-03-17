import { useRef, useEffect, useState } from "react";
import { Trophy, MessageCircle, Star, TrendingUp, RefreshCw } from "lucide-react";

interface Kol {
  id: number;
  rank: number;
  name: string;
  handle: string;
  avatar: string;
  followers: number;
  hit_rate: number;
  avg_roi: number;
  peak_roi: number;
  low_roi: number;
  mentions: number;
  wins: number;
  losses: number;
  top_token_name: string;
  top_token_ticker: string;
  top_token_image: string;
  top_token_roi: number;
}

type Particle = { x: number; y: number; vx: number; vy: number };

function getBubbleR(rank: number, total: number): number {
  const minR = 30, maxR = 74;
  if (total <= 1) return maxR;
  return maxR - ((rank - 1) / (total - 1)) * (maxR - minR);
}

function getRoiColor(roi: number): string {
  if (roi >= 150) return "#22c55e";
  if (roi >= 80) return "#4ade80";
  if (roi >= 30) return "#a3e635";
  if (roi >= 0) return "#facc15";
  if (roi >= -20) return "#fb923c";
  return "#f87171";
}

function fmtFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function getInitials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

interface TooltipState {
  kol: Kol;
  x: number;
  y: number;
}

const STORAGE_KEY = "kols_prev_ranks_v1";

function loadPrevRanks(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}
function savePrevRanks(ranks: Record<string, number>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ranks)); } catch { /* noop */ }
}

export default function KolsRank() {
  const [kols, setKols] = useState<Kol[]>([]);
  const [loading, setLoading] = useState(true);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [rankChanges, setRankChanges] = useState<Record<string, number>>({});
  const [newKols, setNewKols] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const kolsRef = useRef<Kol[]>([]);
  const particles = useRef<Map<number, Particle>>(new Map());
  const bubbleEls = useRef<Map<number, HTMLDivElement>>(new Map());
  const animRef = useRef<number>(0);
  const hoveredId = useRef<number | null>(null);

  const draggingIdRef = useRef<number | null>(null);
  const dragStartPtrRef = useRef({ x: 0, y: 0 });
  const particleStartRef = useRef({ x: 0, y: 0 });
  const prevDragPosRef = useRef({ x: 0, y: 0 });
  const dragVelRef = useRef({ vx: 0, vy: 0 });
  const didDragRef = useRef(false);
  const lastDragEndRef = useRef(0);

  useEffect(() => { kolsRef.current = kols; }, [kols]);

  useEffect(() => {
    const el = gridCanvasRef.current;
    if (!el) return;
    const cx = el.getContext("2d");
    if (!cx) return;
    const GRID = 40;
    const PARTICLE_COUNT = 28;
    const TRAIL_LEN = 100;
    const occupiedH = new Set<number>();
    const occupiedV = new Set<number>();
    type Trail = { x: number; y: number };
    type GParticle = { x: number; y: number; trail: Trail[]; direction: "h" | "v"; speed: number; active: boolean; findLine(): boolean; reset(): void; update(): void; draw(): void; };
    const makeParticle = (): GParticle => {
      const p: GParticle = {
        x: 0, y: 0, trail: [], direction: "h", speed: 1, active: false,
        findLine() {
          for (let i = 0; i < 100; i++) {
            if (Math.random() > 0.5) {
              const py = Math.round(Math.random() * el.height / GRID) * GRID;
              if (!occupiedH.has(py)) { p.direction = "h"; p.x = 0; p.y = py; occupiedH.add(py); return true; }
            } else {
              const px = Math.round(Math.random() * el.width / GRID) * GRID;
              if (!occupiedV.has(px)) { p.direction = "v"; p.x = px; p.y = 0; occupiedV.add(px); return true; }
            }
          }
          return false;
        },
        reset() { p.trail = []; p.speed = 0.5 + Math.random() * 4.5; p.active = p.findLine(); },
        update() {
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > TRAIL_LEN) p.trail.shift();
          if (p.active) {
            if (p.direction === "h") { p.x += p.speed; if (p.x > el.width) { p.active = false; occupiedH.delete(p.y); } }
            else { p.y += p.speed; if (p.y > el.height) { p.active = false; occupiedV.delete(p.x); } }
          } else {
            const gone = p.trail.every(t => p.direction === "h" ? t.x > el.width : t.y > el.height);
            if (gone) p.reset();
          }
        },
        draw() {
          for (let i = 0; i < p.trail.length; i++) {
            cx.globalAlpha = (i / p.trail.length) * 0.06;
            cx.fillStyle = "#d4f602";
            cx.beginPath();
            cx.arc(p.trail[i].x, p.trail[i].y, 0.9, 0, Math.PI * 2);
            cx.fill();
          }
          cx.globalAlpha = 1;
        },
      };
      p.reset();
      return p;
    };
    const drawGrid = () => {
      cx.strokeStyle = "rgba(91,49,254,0.18)";
      cx.lineWidth = 1;
      for (let y = 0; y <= el.height; y += GRID) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(el.width, y); cx.stroke(); }
      for (let x = 0; x <= el.width; x += GRID) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, el.height); cx.stroke(); }
    };
    const gridParticles: GParticle[] = Array.from({ length: PARTICLE_COUNT }, makeParticle);
    let rafId = 0;
    const animate = () => {
      cx.clearRect(0, 0, el.width, el.height);
      drawGrid();
      gridParticles.forEach(p => { p.update(); p.draw(); });
      rafId = requestAnimationFrame(animate);
    };
    const resize = () => {
      el.width = el.offsetWidth;
      el.height = el.offsetHeight;
      occupiedH.clear();
      occupiedV.clear();
      gridParticles.forEach(p => p.reset());
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    rafId = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, []);

  const parseKol = (k: Record<string, unknown>): Kol => ({
    id: Number(k.id),
    rank: Number(k.rank),
    name: String(k.name || ""),
    handle: String(k.handle || ""),
    avatar: String(k.avatar || ""),
    followers: Number(k.followers) || 0,
    hit_rate: parseFloat(String(k.hit_rate)) || 0,
    avg_roi: parseFloat(String(k.avg_roi)) || 0,
    peak_roi: parseFloat(String(k.peak_roi)) || 0,
    low_roi: parseFloat(String(k.low_roi)) || 0,
    mentions: Number(k.mentions) || 0,
    wins: Number(k.wins) || 0,
    losses: Number(k.losses) || 0,
    top_token_name: String(k.top_token_name || ""),
    top_token_ticker: String(k.top_token_ticker || ""),
    top_token_image: String(k.top_token_image || ""),
    top_token_roi: parseFloat(String(k.top_token_roi)) || 0,
  });

  const fetchKols = () => {
    setLoading(true);
    fetch("/api/kols")
      .then(r => r.json())
      .then(d => {
        const fresh = (d.kols || []).map(parseKol);
        const prev = loadPrevRanks();
        const hasPrev = Object.keys(prev).length > 0;
        const nowRanks: Record<string, number> = {};
        const changes: Record<string, number> = {};
        const newSet = new Set<string>();
        fresh.forEach(k => {
          const key = k.handle || k.name;
          nowRanks[key] = k.rank;
          if (hasPrev) {
            if (!(key in prev)) {
              newSet.add(key);
            } else if (prev[key] !== k.rank) {
              changes[key] = prev[key] - k.rank;
            }
          }
        });
        savePrevRanks(nowRanks);
        setRankChanges(changes);
        setNewKols(newSet);
        setKols(fresh);
        setLastUpdated(new Date());
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchKols();
    const interval = setInterval(fetchKols, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!kols.length) return;
    const W = containerRef.current?.offsetWidth || 900;
    const H = containerRef.current?.offsetHeight || 600;

    kols.forEach(k => {
      if (!particles.current.has(k.id)) {
        const r = getBubbleR(k.rank, kols.length);
        particles.current.set(k.id, {
          x: r + 20 + Math.random() * (W - r * 2 - 40),
          y: 90 + r + Math.random() * (H - r * 2 - 110),
          vx: (Math.random() - 0.5) * 0.1,
          vy: (Math.random() - 0.5) * 0.1,
        });
      }
    });

    const loop = () => {
      const W2 = containerRef.current?.offsetWidth || 900;
      const H2 = containerRef.current?.offsetHeight || 600;
      const all = kolsRef.current;

      particles.current.forEach((p, id) => {
        const kol = all.find(k => k.id === id);
        if (!kol) return;
        const r = getBubbleR(kol.rank, all.length);

        if (draggingIdRef.current === id) return;

        if (hoveredId.current === id) {
          const el = bubbleEls.current.get(id);
          if (el) el.style.transform = `translate(${p.x - r}px, ${p.y - r}px)`;
          return;
        }

        p.vx += (Math.random() - 0.5) * 0.003;
        p.vy += (Math.random() - 0.5) * 0.003;

        particles.current.forEach((q, id2) => {
          if (id2 === id) return;
          const kol2 = all.find(k => k.id === id2);
          if (!kol2) return;
          const r2 = getBubbleR(kol2.rank, all.length);
          const dx = p.x - q.x, dy = p.y - q.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
          const minD = r + r2 + 10;
          if (d < minD) {
            const f = ((minD - d) / minD) * 0.022;
            p.vx += (dx / d) * f;
            p.vy += (dy / d) * f;
          }
        });

        if (p.x - r < 10) p.vx += 0.045;
        if (p.x + r > W2 - 10) p.vx -= 0.045;
        if (p.y - r < 72) p.vy += 0.045;
        if (p.y + r > H2 - 10) p.vy -= 0.045;

        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        if (spd > 0.28) { p.vx = p.vx / spd * 0.28; p.vy = p.vy / spd * 0.28; }
        p.vx *= 0.988; p.vy *= 0.988;
        p.x += p.vx; p.y += p.vy;

        const el = bubbleEls.current.get(id);
        if (el) el.style.transform = `translate(${p.x - r}px, ${p.y - r}px)`;
      });

      animRef.current = requestAnimationFrame(loop);
    };

    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [kols]);

  const showKolTooltip = (kol: Kol) => {
    hoveredId.current = kol.id;
    const p = particles.current.get(kol.id);
    const r = getBubbleR(kol.rank, kolsRef.current.length);
    const W = containerRef.current?.offsetWidth || 900;
    const H = containerRef.current?.offsetHeight || 600;
    if (!p) return;
    let tx = p.x + r + 12;
    if (tx + 240 > W) tx = p.x - r - 252;
    const ty = Math.max(72, Math.min(p.y - 90, H - 280));
    setTooltip({ kol, x: tx, y: ty });
  };

  const handleBubblePointerDown = (e: React.PointerEvent<HTMLDivElement>, kol: Kol) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    e.stopPropagation();
    draggingIdRef.current = kol.id;
    didDragRef.current = false;
    dragStartPtrRef.current = { x: e.clientX, y: e.clientY };
    const p = particles.current.get(kol.id);
    particleStartRef.current = { x: p?.x ?? 0, y: p?.y ?? 0 };
    prevDragPosRef.current = { x: p?.x ?? 0, y: p?.y ?? 0 };
    dragVelRef.current = { vx: 0, vy: 0 };
    hoveredId.current = null;
    setTooltip(null);
    const el = bubbleEls.current.get(kol.id);
    if (el) el.style.cursor = "grabbing";
  };

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const id = draggingIdRef.current;
    if (id === null) return;
    const dx = e.clientX - dragStartPtrRef.current.x;
    const dy = e.clientY - dragStartPtrRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) didDragRef.current = true;
    const p = particles.current.get(id);
    if (!p) return;
    const newX = particleStartRef.current.x + dx;
    const newY = particleStartRef.current.y + dy;
    dragVelRef.current = {
      vx: (newX - prevDragPosRef.current.x) * 0.22,
      vy: (newY - prevDragPosRef.current.y) * 0.22,
    };
    prevDragPosRef.current = { x: newX, y: newY };
    p.x = newX; p.y = newY; p.vx = 0; p.vy = 0;
    const kol = kolsRef.current.find(k => k.id === id);
    if (kol) {
      const r = getBubbleR(kol.rank, kolsRef.current.length);
      const el = bubbleEls.current.get(id);
      if (el) el.style.transform = `translate(${newX - r}px, ${newY - r}px)`;
    }
  };

  const handleContainerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const id = draggingIdRef.current;
    if (id === null) return;
    const p = particles.current.get(id);
    if (p) {
      p.vx = dragVelRef.current.vx;
      p.vy = dragVelRef.current.vy;
    }
    const el = bubbleEls.current.get(id);
    if (el) el.style.cursor = "grab";
    if (didDragRef.current) {
      lastDragEndRef.current = Date.now();
      hoveredId.current = null;
    }
    draggingIdRef.current = null;
    didDragRef.current = false;
    e.stopPropagation();
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden select-none"
      style={{ touchAction: "none" }}
      onPointerDown={() => { if (draggingIdRef.current === null) { hoveredId.current = null; setTooltip(null); } }}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onPointerCancel={handleContainerPointerUp}
    >
      <canvas ref={gridCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />

      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between pointer-events-none"
        style={{ paddingTop: "68px", paddingLeft: "12px", paddingRight: "12px", paddingBottom: "8px" }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5 pointer-events-auto">
            <Trophy size={12} className="text-yellow-400" />
            <span className="text-xs font-bold text-white tracking-wide">KOL RANK</span>
          </div>
          <span className="hidden sm:block text-[10px] text-white/20 bg-black/40 border border-white/5 rounded-full px-2.5 py-1">bubble size = hit rate &nbsp;·&nbsp; color = avg ROI</span>
          {(newKols.size > 0 || Object.keys(rankChanges).length > 0) && (
            <div className="flex items-center gap-1.5 animate-pulse">
              {newKols.size > 0 && (
                <span className="flex items-center gap-1 bg-[#d4f602]/15 border border-[#d4f602]/30 text-[#d4f602] font-bold rounded-full px-2 py-0.5 text-[9px]">
                  <Star size={8} />
                  {newKols.size} NEW
                </span>
              )}
              {Object.keys(rankChanges).length > 0 && (
                <span className="flex items-center gap-1 bg-white/5 border border-white/10 text-white/50 font-bold rounded-full px-2 py-0.5 text-[9px]">
                  <TrendingUp size={8} />
                  {Object.keys(rankChanges).length} rank {Object.keys(rankChanges).length === 1 ? "change" : "changes"}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 text-[9px] text-white/25">
            {([["#22c55e", ">80% ROI"], ["#a3e635", "30–80%"], ["#facc15", "0–30%"], ["#f87171", "Neg"]] as [string, string][]).map(([c, l]) => (
              <span key={l} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: c }} />{l}
              </span>
            ))}
          </div>
          <button
            onClick={fetchKols}
            className="pointer-events-auto flex items-center gap-1.5 bg-black/60 hover:bg-white/10 border border-white/10 rounded-full px-2.5 py-1.5 transition-colors"
          >
            <RefreshCw size={10} className={`text-white/40 ${loading ? "animate-spin" : ""}`} />
            <span className="text-[10px] text-white/40 hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      <div className="absolute inset-0">
        {kols.map(kol => {
          const r = getBubbleR(kol.rank, kols.length);
          const color = getRoiColor(kol.avg_roi);
          const diam = r * 2;
          const isHovered = hoveredId.current === kol.id;
          const key = kol.handle || kol.name;
          const isNew = newKols.has(key);
          const delta = rankChanges[key];
          const movedUp = delta !== undefined && delta > 0;
          const movedDown = delta !== undefined && delta < 0;

          return (
            <div
              key={kol.id}
              ref={el => { if (el) bubbleEls.current.set(kol.id, el); else bubbleEls.current.delete(kol.id); }}
              className="absolute"
              style={{ width: diam, height: diam, top: 0, left: 0, willChange: "transform", cursor: "grab", touchAction: "none" }}
              onPointerDown={e => handleBubblePointerDown(e, kol)}
              onClick={(e) => {
                if (didDragRef.current) return;
                if (Date.now() - lastDragEndRef.current < 350) return;
                e.stopPropagation();
                if (tooltip?.kol.id === kol.id) { hoveredId.current = null; setTooltip(null); return; }
                showKolTooltip(kol);
              }}
            >
              <div
                className="w-full h-full rounded-full flex flex-col items-center justify-center gap-0 transition-all duration-150"
                style={{
                  background: `radial-gradient(circle at 33% 28%, ${color}22, ${color}08 65%, transparent)`,
                  border: `1.5px solid ${color}45`,
                  boxShadow: isHovered
                    ? `0 0 28px ${color}55, 0 0 10px ${color}30, inset 0 1px 0 rgba(255,255,255,0.12)`
                    : `0 0 14px ${color}20, inset 0 1px 0 rgba(255,255,255,0.06)`,
                }}
              >
                <div className="relative mb-0.5 flex items-center justify-center rounded-full overflow-hidden"
                  style={{ width: r * 0.68, height: r * 0.68 }}>
                  <span className="absolute inset-0 flex items-center justify-center font-bold text-white/85 leading-none"
                    style={{ fontSize: Math.max(12, r * 0.34) }}>
                    {getInitials(kol.name)}
                  </span>
                  {kol.avatar && (
                    <img src={kol.avatar} alt={kol.name}
                      className="absolute inset-0 w-full h-full rounded-full object-cover"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  )}
                </div>
                <span className="font-bold leading-none" style={{ fontSize: Math.max(7, r * 0.19), color: color + "cc" }}>
                  #{kol.rank}
                </span>
                <span className="font-mono leading-none text-white/35" style={{ fontSize: Math.max(6, r * 0.17) }}>
                  {kol.hit_rate.toFixed(0)}%
                </span>
              </div>

              {isNew && (
                <div className="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 z-10 animate-pulse"
                  style={{ fontSize: Math.max(7, r * 0.16) }}>
                  <span className="bg-[#d4f602] text-black font-black rounded-full px-1.5 py-0.5 shadow-lg shadow-[#d4f60255]"
                    style={{ fontSize: "inherit", lineHeight: 1 }}>
                    NEW
                  </span>
                </div>
              )}

              {!isNew && movedUp && (
                <div className="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 z-10"
                  style={{ fontSize: Math.max(7, r * 0.16) }}>
                  <span className="flex items-center gap-0.5 bg-green-500/90 text-white font-black rounded-full px-1.5 py-0.5 shadow-lg shadow-green-500/30"
                    style={{ fontSize: "inherit", lineHeight: 1 }}>
                    ▲{delta}
                  </span>
                </div>
              )}

              {!isNew && movedDown && (
                <div className="absolute top-0 right-0 translate-x-1/4 -translate-y-1/4 z-10"
                  style={{ fontSize: Math.max(7, r * 0.16) }}>
                  <span className="flex items-center gap-0.5 bg-red-500/90 text-white font-black rounded-full px-1.5 py-0.5 shadow-lg shadow-red-500/30"
                    style={{ fontSize: "inherit", lineHeight: 1 }}>
                    ▼{Math.abs(delta)}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tooltip && (() => {
        const { kol, x, y } = tooltip;
        const color = getRoiColor(kol.avg_roi);
        return (
          <div className="absolute z-50 pointer-events-auto" style={{ left: x, top: y }}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}>
            <div className="bg-[#08080f]/96 backdrop-blur-xl border border-white/10 rounded-2xl p-3 w-[240px] shadow-2xl shadow-black/70">
              <div className="flex items-center gap-2.5 mb-2.5 pb-2 border-b border-white/[0.06]">
                <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold"
                  style={{ background: `${color}18`, border: `1.5px solid ${color}45` }}>
                  {kol.avatar
                    ? <img src={kol.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    : <span style={{ color }}>{getInitials(kol.name)}</span>
                  }
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md"
                      style={{ background: `${color}20`, color }}>
                      #{kol.rank}
                    </span>
                    <span className="text-white font-bold text-sm truncate">{kol.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-white/30">@{kol.handle} · {fmtFollowers(kol.followers)}</span>
                    {kol.handle && (
                      <a href={`https://x.com/${kol.handle}`} target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center w-4 h-4 rounded bg-white/10 hover:bg-white/20 transition-colors flex-shrink-0"
                        title={`@${kol.handle} on X`}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="text-white/70">
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63 5.905-5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-2">
                  <div className="text-white/30 text-[9px] mb-1 flex items-center gap-1">
                    <TrendingUp size={8} /> Hit Rate
                  </div>
                  <div className="text-white font-bold text-sm">{kol.hit_rate.toFixed(1)}%</div>
                  <div className="text-white/25 text-[9px]">{kol.wins}W · {kol.losses}L</div>
                </div>

                <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-2">
                  <div className="text-white/30 text-[9px] mb-1">Avg ROI</div>
                  <div className="font-bold text-sm" style={{ color: kol.avg_roi >= 0 ? "#4ade80" : "#f87171" }}>
                    {kol.avg_roi >= 0 ? "+" : ""}{kol.avg_roi.toFixed(1)}%
                  </div>
                  <div className="text-white/25 text-[9px]">
                    Peak +{kol.peak_roi.toFixed(1)}%
                    {kol.low_roi < 0 && <span className="text-red-400/50"> · {kol.low_roi.toFixed(1)}%</span>}
                  </div>
                </div>

                <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-2">
                  <div className="text-white/30 text-[9px] mb-1 flex items-center gap-1">
                    <MessageCircle size={8} /> Mentions
                  </div>
                  <div className="text-white font-bold text-sm">{kol.mentions}</div>
                  <div className="text-white/20 text-[9px]">social</div>
                </div>

                <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-2">
                  <div className="text-white/30 text-[9px] mb-1 flex items-center gap-1">
                    <Star size={8} className="text-yellow-400" /> Top Token
                  </div>
                  {kol.top_token_ticker ? (
                    <>
                      <div className="text-yellow-400 font-bold text-xs truncate">{kol.top_token_ticker}</div>
                      <div className="text-green-400 text-[9px]">+{kol.top_token_roi.toFixed(1)}%</div>
                    </>
                  ) : <div className="text-white/20 text-xs">—</div>}
                </div>
              </div>

              {lastUpdated && (
                <div className="mt-2 text-[9px] text-white/15 text-right">
                  Updated {lastUpdated.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Trophy size={32} className="text-yellow-400 animate-pulse" />
            <span className="text-white/40 text-sm">Loading KOL Rankings...</span>
          </div>
        </div>
      )}

      {!loading && kols.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Trophy size={40} className="text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No KOL data yet</p>
            <p className="text-white/15 text-xs mt-1">Add KOLs via the admin panel</p>
          </div>
        </div>
      )}
    </div>
  );
}
