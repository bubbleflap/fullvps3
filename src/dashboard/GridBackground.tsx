import { useRef, useEffect } from "react";

export default function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
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

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
