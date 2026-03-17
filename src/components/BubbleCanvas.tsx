import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import TokenBubble from "./TokenBubble";
import type { Token } from "../lib/types";
import { useLang } from "../lib/i18n";

interface BubbleCanvasProps {
  tokens: Token[];
  newestIds: string[];
  onTokenClick: (token: Token, rect?: DOMRect) => void;
  onRefresh?: () => void;
}

const FEATURED_CA = "0xa2320fff1069ed5b4b02ddb386823e837a7e7777";

function getBubbleRadius(mcap: number): number {
  if (mcap <= 0) return 2;
  const kMcap = mcap / 1000;
  const px = kMcap * 2;
  return Math.max(2, Math.min(px / 2, 50));
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  id: string;
}

export default function BubbleCanvas({
  tokens,
  newestIds,
  onTokenClick,
  onRefresh,
}: BubbleCanvasProps) {
  const { lang, setLang } = useLang();
  const containerRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const draggingRef = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const offsetStart = useRef({ x: 0, y: 0 });
  const lastPinchDist = useRef<number | null>(null);
  const lastPinchCenter = useRef<{ x: number; y: number } | null>(null);

  // Per-bubble dragging
  const draggingBubbleIdRef = useRef<string | null>(null);
  const bubbleDragStartRef = useRef({ x: 0, y: 0 });
  const bubbleParticleStartRef = useRef({ x: 0, y: 0 });
  const bubbleDidDragRef = useRef(false);
  const bubblePrevPosRef = useRef({ x: 0, y: 0 });
  const bubbleVelocityRef = useRef({ vx: 0, vy: 0 });
  const particles = useRef<Map<string, Particle>>(new Map());
  const bubbleRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const worldRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const hoveredIdRef = useRef<string | null>(null);
  const smoothMcapRef = useRef<Map<string, number>>(new Map());

  const gridCanvasRef = useRef<HTMLCanvasElement>(null);

  const clampZoom = (z: number) => Math.max(0.15, Math.min(z, 5));

  const applyTransform = useCallback(() => {
    const { x, y } = offsetRef.current;
    const z = zoomRef.current;
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    }
  }, []);

  useEffect(() => {
    const el = gridCanvasRef.current;
    if (!el) return;
    const cx = el.getContext("2d");
    if (!cx) return;

    const GRID = 40;
    const PARTICLE_COUNT = 28;
    const TRAIL_LEN = 100;
    const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";

    const occupiedH = new Set<number>();
    const occupiedV = new Set<number>();

    type Trail = { x: number; y: number };
    type GParticle = {
      x: number; y: number; trail: Trail[];
      direction: "h" | "v"; speed: number; active: boolean;
      findLine(): boolean; reset(): void; update(): void; draw(): void;
    };
    type RippleObj = { x: number; y: number; r: number; maxR: number; start: number; update(): void; draw(): void; done(): boolean; };

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
        reset() {
          p.trail = [];
          p.speed = 0.5 + Math.random() * 4.5;
          p.active = p.findLine();
        },
        update() {
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > TRAIL_LEN) p.trail.shift();
          if (p.active) {
            if (p.direction === "h") { p.x += p.speed; if (p.x > el.width) { p.active = false; occupiedH.delete(p.y); } }
            else { p.y += p.speed; if (p.y > el.height) { p.active = false; occupiedV.delete(p.x); } }
          } else {
            const gone = p.trail.every((t) => p.direction === "h" ? t.x > el.width : t.y > el.height);
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

    const makeRipple = (rx: number, ry: number): RippleObj => {
      const r: RippleObj = {
        x: rx, y: ry, r: 0, maxR: 200, start: Date.now(),
        update() { r.r = ((Date.now() - r.start) / 1800) * r.maxR; },
        draw() {
          const alpha = Math.max(0, 1 - r.r / r.maxR);
          cx.strokeStyle = `rgba(212,246,2,${alpha})`;
          cx.lineWidth = 1.5;
          cx.beginPath();
          cx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
          cx.stroke();
          if (Math.random() < 0.3) {
            cx.fillStyle = `rgba(212,246,2,${alpha * 0.8})`;
            cx.font = "12px monospace";
            cx.globalAlpha = alpha;
            const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
            cx.fillText(ch, r.x + (Math.random() - 0.5) * r.r * 2, r.y + (Math.random() - 0.5) * r.r * 2);
            cx.globalAlpha = 1;
          }
        },
        done() { return r.r >= r.maxR; },
      };
      return r;
    };

    const drawGrid = () => {
      const w = el.width; const h = el.height;
      cx.strokeStyle = "rgba(91,49,254,0.18)";
      cx.lineWidth = 1;
      for (let y = 0; y <= h; y += GRID) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(w, y); cx.stroke(); }
      for (let x = 0; x <= w; x += GRID) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, h); cx.stroke(); }
    };

    const gridParticles: GParticle[] = Array.from({ length: PARTICLE_COUNT }, makeParticle);
    let ripples: RippleObj[] = [];
    let rafId = 0;

    const animate = () => {
      cx.clearRect(0, 0, el.width, el.height);
      drawGrid();
      gridParticles.forEach((p) => { p.update(); p.draw(); });
      ripples = ripples.filter((r) => !r.done());
      ripples.forEach((r) => { r.update(); r.draw(); });
      rafId = requestAnimationFrame(animate);
    };

    const resize = () => {
      el.width = el.offsetWidth;
      el.height = el.offsetHeight;
      occupiedH.clear();
      occupiedV.clear();
      gridParticles.forEach((p) => p.reset());
    };

    const onClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      ripples.push(makeRipple(e.clientX - rect.left, e.clientY - rect.top));
    };

    resize();
    animate();

    const ro = new ResizeObserver(resize);
    ro.observe(el);
    el.addEventListener("click", onClick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      el.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    const existing = particles.current;
    const newMap = new Map<string, Particle>();
    tokens.forEach((t) => {
      const prev = existing.get(t.id);
      if (prev) {
        newMap.set(t.id, prev);
      } else {
        const angle = Math.random() * Math.PI * 2;
        const dist = 100 + Math.random() * 500;
        newMap.set(t.id, {
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          id: t.id,
        });
      }
    });
    particles.current = newMap;
  }, [tokens]);

  const [, forceUpdate] = useState(0);
  const scheduledTimersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const t of tokens) {
      if (!t.newlyDetectedAt) continue;
      if (scheduledTimersRef.current.has(t.id)) continue;
      const remaining = 15000 - (Date.now() - t.newlyDetectedAt);
      if (remaining > 0) {
        scheduledTimersRef.current.add(t.id);
        setTimeout(() => {
          scheduledTimersRef.current.delete(t.id);
          forceUpdate((n) => n + 1);
        }, remaining + 100);
      }
    }
  }, [tokens]);

  const newlyDetectedIds = useMemo(() => {
    const now = Date.now();
    const ids = new Set<string>();
    for (const t of tokens) {
      if (t.newlyDetectedAt && now - t.newlyDetectedAt < 15000) {
        ids.add(t.id);
      }
    }
    return ids;
  }, [tokens, forceUpdate]);

  useEffect(() => {
    let lastTime = performance.now();
    const mcapTargets = new Map(tokens.map((t) => [t.id, t.mcap]));
    if (!smoothMcapRef.current) smoothMcapRef.current = new Map();
    const smoothMcap = smoothMcapRef.current;
    for (const t of tokens) {
      if (!smoothMcap.has(t.id)) smoothMcap.set(t.id, t.mcap);
      mcapTargets.set(t.id, t.mcap);
    }
    const mcapMap = smoothMcap;
    const partnerIds = new Set(tokens.filter(t => t.isPartner).map(t => t.id));
    const detectedMap = new Map<string, number>();
    const detectedList: string[] = [];
    for (const t of tokens) {
      if (t.newlyDetectedAt) {
        detectedMap.set(t.id, t.newlyDetectedAt);
        detectedList.push(t.id);
      }
    }
    detectedList.sort((a, b) => (detectedMap.get(a) || 0) - (detectedMap.get(b) || 0));

    const newTargets = new Map<string, { x: number; y: number }>();
    const activeNew = detectedList.filter((id) => {
      const at = detectedMap.get(id) || 0;
      return Date.now() - at < 15000;
    });
    const NEW_BUBBLE_SIZE = 120;
    const SPACING = NEW_BUBBLE_SIZE + 60;
    if (activeNew.length === 1) {
      newTargets.set(activeNew[0], { x: 0, y: 0 });
    } else if (activeNew.length > 1) {
      const cols = Math.ceil(Math.sqrt(activeNew.length));
      const rows = Math.ceil(activeNew.length / cols);
      const totalW = (cols - 1) * SPACING;
      const totalH = (rows - 1) * SPACING;
      for (let idx = 0; idx < activeNew.length; idx++) {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        newTargets.set(activeNew[idx], {
          x: col * SPACING - totalW / 2,
          y: row * SPACING - totalH / 2,
        });
      }
    }

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 16.667, 3);
      lastTime = now;
      const wallNow = Date.now();

      const pts = particles.current;
      const arr = Array.from(pts.values());

      const BOUNDS = 800;
      const GRAVITY = 0.0008;
      const DRAG = 0.997;
      const MAX_SPEED = 1.2;
      const MCAP_LERP = 0.04;

      for (const [id, target] of mcapTargets) {
        const current = mcapMap.get(id) || 0;
        if (Math.abs(current - target) > 0.1) {
          mcapMap.set(id, current + (target - current) * MCAP_LERP * dt);
        }
      }

      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];

        const detectedAt = detectedMap.get(a.id);
        const isNewHighlight = detectedAt && wallNow - detectedAt < 15000;
        const target = newTargets.get(a.id);

        if (a.id === hoveredIdRef.current || a.id === draggingBubbleIdRef.current) {
          a.vx = 0;
          a.vy = 0;
          continue;
        }

        if (isNewHighlight && target) {
          const centerPull = 0.05 * dt;
          a.x += (target.x - a.x) * centerPull;
          a.y += (target.y - a.y) * centerPull;
          a.vx *= 0.9;
          a.vy *= 0.9;

          const el = bubbleRefs.current.get(a.id);
          if (el) {
            el.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -50%)`;
            el.style.zIndex = "50";
          }
          continue;
        }

        const ra = getBubbleRadius(mcapMap.get(a.id) || 0);

        const angle = Math.random() * Math.PI * 2;
        a.vx += Math.cos(angle) * 0.008 * dt;
        a.vy += Math.sin(angle) * 0.008 * dt;

        const dist = Math.sqrt(a.x * a.x + a.y * a.y);
        if (dist > 30) {
          const pull = GRAVITY * dt * Math.min(dist / BOUNDS, 1);
          a.vx -= (a.x / dist) * pull;
          a.vy -= (a.y / dist) * pull;
        }

        const CULL = 200;
        for (let j = i + 1; j < arr.length; j++) {
          const b = arr[j];
          const dx = b.x - a.x;
          if (dx > CULL || dx < -CULL) continue;
          const dy = b.y - a.y;
          if (dy > CULL || dy < -CULL) continue;
          const rb = getBubbleRadius(mcapMap.get(b.id) || 0);
          const d2 = dx * dx + dy * dy;
          const minDist = ra + rb + 16;
          const threshold = minDist + 20;

          if (d2 < threshold * threshold) {
            const d = Math.sqrt(d2) || 1;
            const overlap = (threshold - d) / threshold;
            const force = 120 * overlap * overlap * dt * 0.006;
            const nx = dx / d;
            const ny = dy / d;
            a.vx -= nx * force;
            a.vy -= ny * force;
            b.vx += nx * force;
            b.vy += ny * force;
          }
        }

        a.vx *= DRAG;
        a.vy *= DRAG;

        const speed = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
        if (speed > MAX_SPEED) {
          a.vx = (a.vx / speed) * MAX_SPEED;
          a.vy = (a.vy / speed) * MAX_SPEED;
        }

        a.x += a.vx * dt;
        a.y += a.vy * dt;

        if (a.x < -BOUNDS) { a.x = -BOUNDS; a.vx = Math.abs(a.vx) * 0.2; }
        if (a.x > BOUNDS) { a.x = BOUNDS; a.vx = -Math.abs(a.vx) * 0.2; }
        if (a.y < -BOUNDS) { a.y = -BOUNDS; a.vy = Math.abs(a.vy) * 0.2; }
        if (a.y > BOUNDS) { a.y = BOUNDS; a.vy = -Math.abs(a.vy) * 0.2; }

        const el = bubbleRefs.current.get(a.id);
        if (el) {
          const px = Math.round(a.x * 10) / 10;
          const py = Math.round(a.y * 10) / 10;
          el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`;
          el.style.zIndex = "";
        }
      }

      animRef.current = requestAnimationFrame(tick);
    };

    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [tokens]);

  const didDragRef = useRef(false);
  const dragEndedAt = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      // Don't start world pan when pressing on a bubble element
      if ((e.target as HTMLElement).closest('[data-bubble]')) return;
      if (draggingBubbleIdRef.current) return;
      draggingRef.current = true;
      didDragRef.current = false;
      dragStart.current = { x: e.clientX, y: e.clientY };
      offsetStart.current = { ...offsetRef.current };
    };
    const onMove = (e: PointerEvent) => {
      // Handle bubble drag
      if (draggingBubbleIdRef.current) {
        const dx = e.clientX - bubbleDragStartRef.current.x;
        const dy = e.clientY - bubbleDragStartRef.current.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) bubbleDidDragRef.current = true;
        const particle = particles.current.get(draggingBubbleIdRef.current);
        if (particle) {
          const newX = bubbleParticleStartRef.current.x + dx / zoomRef.current;
          const newY = bubbleParticleStartRef.current.y + dy / zoomRef.current;
          bubbleVelocityRef.current = {
            vx: (newX - bubblePrevPosRef.current.x) * 0.5,
            vy: (newY - bubblePrevPosRef.current.y) * 0.5,
          };
          bubblePrevPosRef.current = { x: newX, y: newY };
          particle.x = newX;
          particle.y = newY;
          particle.vx = 0;
          particle.vy = 0;
          const bubbleEl = bubbleRefs.current.get(draggingBubbleIdRef.current);
          if (bubbleEl) bubbleEl.style.transform = `translate(${newX}px, ${newY}px) translate(-50%, -50%)`;
        }
        return;
      }
      // Handle world pan
      if (!draggingRef.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (!didDragRef.current && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      didDragRef.current = true;
      el.style.cursor = "grabbing";
      offsetRef.current = { x: offsetStart.current.x + dx, y: offsetStart.current.y + dy };
      applyTransform();
    };
    const stopDrag = () => {
      // Always reset world drag state
      draggingRef.current = false;
      el.style.cursor = "grab";
      // Record when a canvas pan ended so we can suppress the immediate ghost click
      if (didDragRef.current) dragEndedAt.current = Date.now();
      didDragRef.current = false;
      // Release bubble drag — give it the flick velocity
      if (draggingBubbleIdRef.current) {
        const particle = particles.current.get(draggingBubbleIdRef.current);
        if (particle) {
          particle.vx = bubbleVelocityRef.current.vx;
          particle.vy = bubbleVelocityRef.current.vy;
        }
        draggingBubbleIdRef.current = null;
      }
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", stopDrag);
      window.removeEventListener("pointercancel", stopDrag);
    };
  }, [applyTransform]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const z = zoomRef.current;

      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const nz = clampZoom(z * factor);

      const wx = (mx - cx - offsetRef.current.x) / z;
      const wy = (my - cy - offsetRef.current.y) / z;
      offsetRef.current = { x: mx - cx - wx * nz, y: my - cy - wy * nz };
      zoomRef.current = nz;
      applyTransform();
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [applyTransform]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastPinchDist.current = Math.hypot(dx, dy);
        lastPinchCenter.current = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && lastPinchDist.current !== null) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        zoomRef.current = clampZoom(zoomRef.current * (dist / lastPinchDist.current));
        const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        if (lastPinchCenter.current) {
          offsetRef.current.x += cx - lastPinchCenter.current.x;
          offsetRef.current.y += cy - lastPinchCenter.current.y;
        }
        lastPinchDist.current = dist;
        lastPinchCenter.current = { x: cx, y: cy };
        applyTransform();
      }
    };
    const handleTouchEnd = () => {
      lastPinchDist.current = null;
      lastPinchCenter.current = null;
    };
    el.addEventListener("touchstart", handleTouchStart, { passive: false });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd);
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [applyTransform]);

  const handleZoomIn = useCallback(() => {
    zoomRef.current = clampZoom(zoomRef.current * 1.3);
    applyTransform();
  }, [applyTransform]);

  const handleZoomOut = useCallback(() => {
    zoomRef.current = clampZoom(zoomRef.current * 0.7);
    applyTransform();
  }, [applyTransform]);

  const handleRefresh = useCallback(() => {
    offsetRef.current = { x: 0, y: 0 };
    zoomRef.current = 1;
    applyTransform();
    particles.current.clear();
    if (onRefresh) onRefresh();
  }, [applyTransform, onRefresh]);

  const setBubbleRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) bubbleRefs.current.set(id, el);
    else bubbleRefs.current.delete(id);
  }, []);

  const handleBubbleHover = useCallback((tokenId: string | null) => {
    hoveredIdRef.current = tokenId;
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden relative select-none"
      style={{ cursor: "grab", touchAction: "none", background: "transparent" }}
    >
      <canvas
        ref={gridCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 0 }}
      />

      <div
        ref={worldRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ willChange: "transform" }}
      >
        <div className="relative w-0 h-0">
          {tokens.map((token) => {
            const isNewest = newestIds.includes(token.id);
            const isNewlyDetected = newlyDetectedIds.has(token.id);
            const isFeatured = (token.ca || token.id || '').toLowerCase() === FEATURED_CA;
            const isPartner = !!token.isPartner;
            return (
              <div
                key={token.id}
                ref={(el) => setBubbleRef(token.id, el)}
                className="absolute pointer-events-auto"
                style={{ willChange: "transform", cursor: "grab", zIndex: isFeatured ? 100 : isPartner ? 90 : undefined }}
                data-bubble
                data-token-id={token.id}
                onMouseEnter={() => { handleBubbleHover(token.id); }}
                onMouseLeave={() => { handleBubbleHover(null); }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const particle = particles.current.get(token.id);
                  draggingBubbleIdRef.current = token.id;
                  bubbleDidDragRef.current = false;
                  bubbleDragStartRef.current = { x: e.clientX, y: e.clientY };
                  bubbleParticleStartRef.current = particle ? { x: particle.x, y: particle.y } : { x: 0, y: 0 };
                  bubblePrevPosRef.current = bubbleParticleStartRef.current;
                  bubbleVelocityRef.current = { vx: 0, vy: 0 };
                  (e.currentTarget as HTMLElement).style.cursor = "grabbing";
                }}
                onPointerUp={(e) => {
                  (e.currentTarget as HTMLElement).style.cursor = "grab";
                }}
                onClick={(e) => {
                  // Suppress if the bubble itself was dragged
                  if (bubbleDidDragRef.current) return;
                  // Suppress the ghost click that fires immediately after a canvas pan
                  if (Date.now() - dragEndedAt.current < 350) return;
                  e.stopPropagation();
                  const el = e.currentTarget as HTMLElement;
                  onTokenClick(token, el.getBoundingClientRect());
                }}
              >
                <TokenBubble
                  token={token}
                  isNewest={isNewest}
                  isNewlyDetected={isNewlyDetected}
                  isFeatured={isFeatured}
                  isPartner={isPartner}
                  onHover={() => {}}
                  onClick={() => {}}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="absolute bottom-20 sm:bottom-6 right-2 sm:right-4 flex flex-col gap-1.5 sm:gap-2 z-50">
        <button
          onClick={handleZoomIn}
          className="rounded-full h-8 w-8 sm:h-9 sm:w-9 bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-base sm:text-lg font-light transition-colors"
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className="rounded-full h-8 w-8 sm:h-9 sm:w-9 bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-base sm:text-lg font-light transition-colors"
        >
          -
        </button>
        <button
          onClick={handleRefresh}
          className="rounded-full h-8 w-8 sm:h-9 sm:w-9 bg-white/5 border border-white/10 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center transition-colors"
          title="Reset view & refresh data"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
        </button>
      </div>
    </div>
  );
}
