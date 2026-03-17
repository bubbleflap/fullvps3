import { useState, useRef, useEffect, useCallback } from "react";
import { X, Send, User, Loader2, ExternalLink, Copy, AlertTriangle, MessageSquarePlus, Github, Mail } from "lucide-react";
import { useSettings } from "../hooks/useSettings";
import { useLang } from "../lib/i18n";

const BOT_LOGO = "/assets/bot.webp";

const BRAND = "#d4f602";
const BRAND_20 = "#d4f60233";
const BRAND_30 = "#d4f6024d";
const BRAND_40 = "#d4f60266";
const BRAND_60 = "#d4f60299";
const BRAND_80 = "#d4f602cc";
const BRAND_LIGHT = "#e0ff4d";

interface TokenData {
  address: string;
  name: string;
  ticker: string;
  mcap: number;
  price: number;
  holders: number;
  devHoldPercent: number;
  burnPercent: number;
  sniperHoldPercent: number;
  taxRate: number;
  beneficiary: string | null;
  bondingCurve: boolean;
  bondProgress: number;
  reserveBnb: number;
  graduated: boolean;
  listed: boolean;
  image: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  createdAt: string;
  description: string | null;
  dexPaid: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  tokenData?: TokenData | null;
}

function formatMcap(mcap: number): string {
  if (mcap >= 1_000_000) return `$${(mcap / 1_000_000).toFixed(2)}M`;
  if (mcap >= 1_000) return `$${(mcap / 1_000).toFixed(2)}K`;
  if (mcap > 0) return `$${mcap.toFixed(0)}`;
  return "$0";
}

function formatPrice(price: number): string {
  if (price <= 0) return "$0";
  if (price < 0.000001) return `$${price.toExponential(2)}`;
  if (price < 0.01) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(2)}`;
}

function formatAge(createdAt: string, t: Record<string, string | string[]>): string {
  const ts = new Date(createdAt).getTime();
  const diff = Date.now() - ts;
  if (diff < 0) return t.justNow as string;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}${t.sAgo}`;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}${t.mAgo}`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `${hours}${t.hAgo}`;
  const days = Math.floor(diff / 86400000);
  return `${days}${t.dAgo}`;
}

function shortAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function TokenCard({ token, onAnalyze, onClose }: { token: TokenData; onAnalyze?: (ca: string) => void; onClose?: () => void }) {
  const [copied, setCopied] = useState(false);
  const { t } = useLang();

  const copyCA = () => {
    navigator.clipboard.writeText(token.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const bondStatus = token.listed ? (t.graduated as string) : token.bondingCurve ? `${t.bonding2} ${Math.round(token.bondProgress)}%` : (t.newStatus as string);
  const bondColor = token.listed ? "bg-green-500/80" : token.bondingCurve ? "bg-blue-500/80" : "bg-white/20";

  return (
    <div className="bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/10 rounded-xl overflow-hidden mt-1">
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/5">
        {token.image && (
          <img
            src={token.image}
            alt={token.name}
            className="w-9 h-9 rounded-full border border-white/20 flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-[13px] text-white truncate">{token.name}</span>
            <span className="text-white/40 text-[10px] font-mono">${token.ticker}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[9px] ${bondColor} text-white px-1.5 py-0.5 rounded-full font-bold`}>{bondStatus}</span>
            {token.taxRate > 0 && (
              <span className="text-[9px] text-white px-1.5 py-0.5 rounded-full font-bold" style={{ backgroundColor: BRAND_80 }}>
                {token.taxRate % 1 === 0 ? token.taxRate.toFixed(0) : token.taxRate.toFixed(1)}% {t.tax}
              </span>
            )}
            {token.dexPaid && (
              <span className="text-[9px] bg-green-600/80 text-white px-1.5 py-0.5 rounded-full font-bold">DexScreener</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 px-3 py-2 text-[11px]">
        <div className="flex justify-between">
          <span className="text-white/40">{t.mcap}</span>
          <span className="text-white font-mono font-medium">{formatMcap(token.mcap)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">{t.price}</span>
          <span className="text-white font-mono font-medium">{formatPrice(token.price)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">{t.holders}</span>
          <span className="text-white font-mono font-medium">{token.holders}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">{t.age}</span>
          <span className="text-white font-mono font-medium">{formatAge(token.createdAt, t)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-white/40">{t.devHold}</span>
          <span className={`font-mono font-medium ${token.devHoldPercent > 20 ? "text-red-400" : "text-white"}`}>
            {token.devHoldPercent.toFixed(1)}%
          </span>
        </div>
        {token.burnPercent > 0 && (
          <div className="flex justify-between">
            <span className="text-white/40">{t.burned}</span>
            <span className="font-mono font-medium text-orange-400">
              {token.burnPercent.toFixed(1)}%
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-white/40">{t.sniper}</span>
          <span className={`font-mono font-medium ${token.sniperHoldPercent > 15 ? "text-red-400" : "text-white"}`}>
            {token.sniperHoldPercent.toFixed(1)}%
          </span>
        </div>
        {token.taxRate > 0 && (
          <div className="flex justify-between">
            <span className="text-white/40">{t.tax}</span>
            <span className="font-mono font-medium" style={{ color: BRAND_LIGHT }}>
              {token.taxRate % 1 === 0 ? token.taxRate.toFixed(0) : token.taxRate.toFixed(1)}%
            </span>
          </div>
        )}
        {token.bondingCurve && !token.listed && (
          <div className="flex justify-between">
            <span className="text-white/40">{t.bonding2}</span>
            <span className="text-blue-400 font-mono font-medium">{Math.round(token.bondProgress)}%</span>
          </div>
        )}
      </div>

      {(token.devHoldPercent > 20 || token.sniperHoldPercent > 15) && (
        <div className="mx-3 mb-2 flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1.5 text-[10px] text-red-300">
          <AlertTriangle size={10} className="flex-shrink-0" />
          {token.devHoldPercent > 20 && <span>{t.highDevHold} ({token.devHoldPercent.toFixed(1)}%)</span>}
          {token.devHoldPercent > 20 && token.sniperHoldPercent > 15 && <span>·</span>}
          {token.sniperHoldPercent > 15 && <span>{t.highSniper} ({token.sniperHoldPercent.toFixed(1)}%)</span>}
        </div>
      )}

      <div className="px-3 pb-2 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-white/30">{t.contract}:</span>
          <span className="text-white/60 font-mono">{shortAddr(token.address)}</span>
          <button onClick={copyCA} className="text-white/30 hover:text-white/60 transition-colors">
            <Copy size={9} />
          </button>
          {copied && <span className="text-green-400 text-[9px]">{t.copied}</span>}
        </div>

        {(token.website || token.twitter || token.telegram) && (
          <div className="flex items-center gap-2.5 text-[10px]">
            {token.website && (
              <a href={token.website} target="_blank" rel="noopener" className="text-blue-400 hover:text-blue-300 transition-colors">{t.web}</a>
            )}
            {token.twitter && (
              <a href={token.twitter.startsWith("http") ? token.twitter : `https://twitter.com/${token.twitter}`} target="_blank" rel="noopener" className="text-sky-400 hover:text-sky-300 transition-colors">𝕏</a>
            )}
            {token.telegram && (
              <a href={token.telegram.startsWith("http") ? token.telegram : `https://t.me/${token.telegram}`} target="_blank" rel="noopener" className="text-sky-300 hover:text-sky-200 transition-colors">Telegram</a>
            )}
          </div>
        )}

        <a
          href={`https://flap.sh/bnb/${token.address}`}
          target="_blank"
          rel="noopener"
          className="btn-jelly flex items-center justify-center gap-1.5 w-full rounded-full py-1.5 text-[11px] text-white font-bold transition-colors"
          style={{ backgroundColor: BRAND_40, border: `1px solid ${BRAND_30}` }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = BRAND_60; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = BRAND_40; }}
        >
          {t.buyOnFlap} <ExternalLink size={10} />
        </a>
        <a
          href={`https://t.me/BubbleFlapBot?start=ref_5189577935_${token.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-jelly flex items-center justify-center gap-1.5 w-full rounded-full py-1.5 text-[11px] font-bold transition-colors"
          style={{ backgroundColor: "#0ea5e933", border: "1px solid #0ea5e94d", color: "#7dd3fc", textDecoration: "none" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#0ea5e966"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#0ea5e933"; }}
        >
          ⚡ Quick Swap
        </a>
        {onAnalyze && (
          <button
            onClick={() => onAnalyze(token.address)}
            className="btn-jelly flex items-center justify-center gap-1.5 w-full rounded-full py-1.5 text-[11px] font-bold transition-colors"
            style={{ backgroundColor: "#7c3aed33", border: "1px solid #7c3aed4d", color: "#c4b5fd" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#7c3aed66"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "#7c3aed33"; }}
          >
            <img src={BOT_LOGO} alt="" className="w-3.5 h-3.5 rounded-full" />
            {t.analyzeToken}
          </button>
        )}
      </div>
    </div>
  );
}

function formatMarkdown(text: string): string {
  let html = text;
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`([^`]+)`/g, `<code style="background:${BRAND_20};color:${BRAND_LIGHT}" class="px-1 py-0.5 rounded text-[11px] break-all">$1</code>`);
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="color:${BRAND_LIGHT}" class="hover:opacity-80 underline">$1</a>`);

  const lines = html.split('\n');
  let inTable = false;
  let tableHtml = '';
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (trimmed.replace(/[|\-\s]/g, '') === '') continue;
      if (!inTable) {
        inTable = true;
        tableHtml = '<table class="w-full text-[11px] my-1 border-collapse table-fixed">';
      }
      const cells = trimmed.split('|').filter(c => c.trim() !== '');
      tableHtml += '<tr>';
      cells.forEach(cell => {
        tableHtml += `<td class="py-0.5 px-2 border-b border-white/5 text-white/80 break-all">${cell.trim()}</td>`;
      });
      tableHtml += '</tr>';
    } else {
      if (inTable) {
        tableHtml += '</table>';
        result.push(tableHtml);
        inTable = false;
        tableHtml = '';
      }
      if (trimmed === '') {
        result.push('<div class="h-2"></div>');
      } else if (trimmed.startsWith('- ')) {
        const bullet = trimmed.slice(2);
        result.push(`<div class="leading-relaxed break-words pl-3 relative" style="overflow-wrap:anywhere"><span class="absolute left-0" style="color:${BRAND_LIGHT}">•</span>${bullet}</div>`);
      } else {
        result.push(`<div class="leading-relaxed break-words" style="overflow-wrap:anywhere">${trimmed}</div>`);
      }
    }
  }
  if (inTable) {
    tableHtml += '</table>';
    result.push(tableHtml);
  }

  return result.join('');
}

export interface ChatBotHandle {
  lookupCA: (ca: string) => void;
}

interface ChatBotProps {
  onRef?: (handle: ChatBotHandle) => void;
}

export default function ChatBot({ onRef }: ChatBotProps) {
  const settings = useSettings();
  const { t, lang } = useLang();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [caBotCopied, setCaBotCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingLookupRef = useRef<string | null>(null);
  const botBtnRef = useRef<HTMLDivElement>(null);

  const spawnBotBubbles = useCallback((count: number) => {
    const el = botBtnRef.current;
    if (!el) return;
    const COLORS = ["rgba(213,247,4,0.7)", "rgba(122,51,250,0.6)", "rgba(91,49,254,0.6)", "rgba(207,183,243,0.5)", "rgba(255,255,255,0.4)"];
    for (let i = 0; i < count; i++) {
      const sz = 3 + Math.floor(Math.random() * 7);
      const left = Math.floor(Math.random() * Math.max(el.offsetWidth - sz, 10));
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const delay = Math.random() * 300;
      const b = document.createElement("div");
      b.className = "bubble-rise";
      b.style.cssText = `position:absolute;border-radius:100%;bottom:4px;left:${left}px;width:${sz}px;height:${sz}px;background-color:${color};z-index:110;pointer-events:none;animation-delay:${delay}ms;`;
      el.appendChild(b);
      setTimeout(() => b.remove(), 3200 + delay);
    }
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (open && inputRef.current && !isTouch) {
      inputRef.current.focus();
    }
    if (open && pendingLookupRef.current) {
      const ca = pendingLookupRef.current;
      pendingLookupRef.current = null;
      setTimeout(() => doSend(ca), 100);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.ca) {
        pendingLookupRef.current = detail.ca;
        setOpen(true);
      }
    };
    window.addEventListener("open-chatbot", handler);
    return () => window.removeEventListener("open-chatbot", handler);
  }, []);

  const doSend = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { role: "user", content: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      const langInstruction = `\nRespond in ${lang === 'zh' ? 'Chinese' : 'English'}.`;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, langInstruction }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: "assistant", content: data.reply, tokenData: data.tokenData || null }]);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: data.error || (t.connectionError as string) }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: t.connectionError as string }]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, lang, t]);

  const lookupCA = useCallback((ca: string) => {
    if (open) {
      doSend(ca);
    } else {
      pendingLookupRef.current = ca;
      setOpen(true);
    }
  }, [open, doSend]);

  useEffect(() => {
    if (onRef) onRef({ lookupCA });
  }, [onRef, lookupCA]);

  const sendMessage = useCallback(() => {
    doSend(input);
  }, [doSend, input]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const BTN = 56;
  const PANEL_W = 360;
  const PAD = 16;

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const safePos = useCallback((x: number, y: number) => ({
    x: clamp(x, PAD, Math.max(PAD, window.innerWidth - BTN - PAD)),
    y: clamp(y, PAD, Math.max(PAD, window.innerHeight - BTN - PAD)),
  }), []);

  const [pos, setPos] = useState(() => safePos(
    PAD,
    window.innerHeight - BTN - PAD,
  ));

  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  // Re-clamp position whenever the window is resized so the bot never goes off-screen
  useEffect(() => {
    const onResize = () => setPos(prev => safePos(prev.x, prev.y));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [safePos]);

  const clampPos = useCallback((x: number, y: number) => safePos(x, y), [safePos]);

  const getPanelPos = useCallback((bx: number, by: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const panelW = Math.min(PANEL_W, vw - PAD * 2);
    // Leave room for header + input bar, cap panel height to viewport
    const panelH = Math.min(480, vh - PAD * 2 - 8);
    // Prefer opening above the button; fall back to below; clamp to viewport
    let px = clamp(bx - panelW + BTN, PAD, vw - panelW - PAD);
    let py = by - panelH - 8;
    if (py < PAD) py = by + BTN + 8;
    py = clamp(py, PAD, vh - panelH - PAD);
    return { px, py, panelW, panelH };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    hasDraggedRef.current = false;
    dragOffsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const dx = Math.abs(e.clientX - dragOffsetRef.current.x - pos.x);
    const dy = Math.abs(e.clientY - dragOffsetRef.current.y - pos.y);
    if (dx > 4 || dy > 4) hasDraggedRef.current = true;
    setPos(clampPos(
      e.clientX - dragOffsetRef.current.x,
      e.clientY - dragOffsetRef.current.y,
    ));
  }, [pos, clampPos]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (!hasDraggedRef.current) {
      spawnBotBubbles(14);
      setOpen(prev => !prev);
    }
    e.preventDefault();
  }, [spawnBotBubbles]);

  const { px, py, panelW, panelH } = getPanelPos(pos.x, pos.y);

  return (
    <>
      {!open && (
        <div
          ref={botBtnRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onMouseEnter={() => spawnBotBubbles(5)}
          className="fixed z-[100] rounded-full p-0 border-0 bg-transparent shadow-none select-none touch-none"
          style={{ left: pos.x, top: pos.y, width: BTN, height: BTN, cursor: draggingRef.current ? "grabbing" : "grab" }}
          title={t.botBubbleFlap as string}
        >
          <img src={BOT_LOGO} alt="Bot" className="bot-idle-float w-full h-full rounded-full drop-shadow-lg hover:drop-shadow-[0_0_12px_#d4f602aa] pointer-events-none" />
        </div>
      )}

      {open && (
        <>
          <div
            ref={botBtnRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onMouseEnter={() => spawnBotBubbles(5)}
            className="fixed z-[101] rounded-full p-0 border-0 bg-transparent shadow-none select-none touch-none"
            style={{ left: pos.x, top: pos.y, width: BTN, height: BTN, cursor: draggingRef.current ? "grabbing" : "grab" }}
            title={t.botBubbleFlap as string}
          >
            <img src={BOT_LOGO} alt="Bot" className="bot-idle-float w-full h-full rounded-full drop-shadow-lg hover:drop-shadow-[0_0_12px_#d4f602aa] pointer-events-none" />
          </div>
          <div
            className="fixed z-[100] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
            style={{
              left: px,
              top: py,
              width: panelW,
              height: panelH,
              backgroundColor: "#06060f",
              border: `1px solid ${BRAND_30}`,
              boxShadow: `0 25px 50px -12px ${BRAND_30}`,
            }}
          >
          <div
            className="flex items-center justify-between px-4 py-3 border-b border-white/10"
            style={{ background: `linear-gradient(to right, ${BRAND_20}, transparent)` }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: BRAND_40, border: `1px solid ${BRAND_30}` }}
              >
                <img src={BOT_LOGO} alt="Bot" className="w-7 h-7 rounded-full" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{t.botBubbleFlap as string}</div>
                <div className="text-[10px] text-green-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block" />
                  {t.online as string}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <a href={settings.telegram} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors" title="Telegram">
                <Send size={11} />
              </a>
              <a href={settings.twitter} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors" title="Twitter / X">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href={settings.github} target="_blank" rel="noopener noreferrer" className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors" title="GitHub">
                <Github size={11} />
              </a>
              <a href={`mailto:${settings.email}`} className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors" title="Email">
                <Mail size={11} />
              </a>
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setInput(""); }}
                  className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                  title={t.newChat as string}
                >
                  <MessageSquarePlus size={13} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <div
                  className="w-18 h-18 rounded-full flex items-center justify-center mx-auto mb-3"
                  style={{ backgroundColor: BRAND_20, border: `1px solid ${BRAND_20}` }}
                >
                  <img src={BOT_LOGO} alt="Bot" className="w-12 h-12 rounded-full" />
                </div>
                <div className="space-y-1.5 mt-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(settings.ca_address);
                      setCaBotCopied(true);
                      setTimeout(() => setCaBotCopied(false), 2000);
                    }}
                    className="block w-full text-left text-[11px] rounded-lg px-3 py-2 transition-colors font-medium"
                    style={{ color: BRAND, backgroundColor: `${BRAND}0d`, border: `1px solid ${BRAND}1a` }}
                    onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = BRAND_LIGHT; el.style.backgroundColor = `${BRAND}1a`; }}
                    onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = BRAND; el.style.backgroundColor = `${BRAND}0d`; }}
                  >
                    {caBotCopied ? (t.botHintCopied as string) : (t.botHint6 as string)}
                  </button>
                  {[
                    { label: t.botHint1 as string, action: "" },
                    { label: t.botHint2 as string, action: "", placeholder: "Analyze 0x..." },
                    { label: t.botHint3 as string, action: t.botHintAction3 as string },
                    { label: t.botHint4 as string, action: t.botHintAction4 as string },
                  ].map((hint) => (
                    <button
                      key={hint.label}
                      onClick={() => {
                        if (hint.action) doSend(hint.action);
                        else if (hint.placeholder) { setInput("Analyze "); inputRef.current?.focus(); }
                        else inputRef.current?.focus();
                      }}
                      className="block w-full text-left text-[11px] rounded-lg px-3 py-2 transition-colors"
                      style={{ color: BRAND, backgroundColor: `${BRAND}0d`, border: `1px solid ${BRAND}1a` }}
                      onMouseEnter={(e) => { const th = e.currentTarget; th.style.color = BRAND_LIGHT; th.style.backgroundColor = `${BRAND}1a`; }}
                      onMouseLeave={(e) => { const th = e.currentTarget; th.style.color = BRAND; th.style.backgroundColor = `${BRAND}0d`; }}
                    >
                      {hint.label}
                    </button>
                  ))}
                  <a
                    href={`https://flap.sh/bnb/${settings.ca_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 w-full text-left text-[11px] rounded-lg px-3 py-2 transition-colors font-bold no-underline"
                    style={{ color: BRAND, backgroundColor: `${BRAND}0d`, border: `1px solid ${BRAND}1a` }}
                    onMouseEnter={(e) => { const el = e.currentTarget; el.style.color = BRAND_LIGHT; el.style.backgroundColor = `${BRAND}1a`; }}
                    onMouseLeave={(e) => { const el = e.currentTarget; el.style.color = BRAND; el.style.backgroundColor = `${BRAND}0d`; }}
                  >
                    <img src={BOT_LOGO} alt="" className="w-4 h-4 rounded-full" />
                    {t.botHint5 as string}
                  </a>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`relative max-w-[85%] ${msg.role === "user" ? "mr-1" : "ml-1"}`}>
                  <div
                    className={`relative rounded-lg px-3 py-2 text-[12px] ${
                      msg.role === "user"
                        ? "text-black font-medium rounded-tr-none"
                        : "bg-[#0f0f1e] text-white/90 rounded-tl-none"
                    }`}
                    style={msg.role === "user" ? { backgroundColor: BRAND } : undefined}
                  >
                    {msg.role === "assistant" ? (
                      <div className="overflow-hidden break-words" style={{ overflowWrap: "anywhere" }} dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
                    ) : (
                      <div className="whitespace-pre-wrap break-all">{msg.content}</div>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="absolute -top-0 -right-[6px] w-0 h-0" style={{ borderLeft: `6px solid ${BRAND}`, borderTop: "6px solid transparent" }} />
                  )}
                  {msg.role === "assistant" && (
                    <div className="absolute -top-0 -left-[6px] w-0 h-0" style={{ borderRight: "6px solid #0f0f1e", borderTop: "6px solid transparent" }} />
                  )}
                  {msg.tokenData && (
                    <TokenCard token={msg.tokenData} onAnalyze={(ca) => doSend(`Analyze ${ca}`)} onClose={() => setOpen(false)} />
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="relative ml-1">
                  <div className="bg-[#0f0f1e] rounded-lg rounded-tl-none px-3 py-2 text-[12px] text-white/50 flex items-center gap-2">
                    <Loader2 size={12} className="animate-spin" />
                    {t.analyzing as string}
                  </div>
                  <div className="absolute -top-0 -left-[6px] w-0 h-0" style={{ borderRight: "6px solid #0f0f1e", borderTop: "6px solid transparent" }} />
                </div>
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-t border-white/10" style={{ backgroundColor: "#06060f" }}>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t.pasteCA as string}
                className="flex-1 rounded-full px-4 py-2 text-[12px] text-white placeholder-white/30 outline-none transition-colors"
                style={{ backgroundColor: "#1a2e35", border: "none" }}
                onFocus={(e) => { e.target.style.boxShadow = `0 0 0 1px ${BRAND_40}`; }}
                onBlur={(e) => { e.target.style.boxShadow = "none"; }}
                disabled={loading}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim()}
                className="w-9 h-9 rounded-full disabled:opacity-30 flex items-center justify-center text-black transition-colors flex-shrink-0"
                style={{ backgroundColor: BRAND }}
                onMouseEnter={(e) => { if (!loading && input.trim()) (e.target as HTMLElement).style.backgroundColor = BRAND_LIGHT; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.backgroundColor = BRAND; }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
        </>
      )}
    </>
  );
}
