import { useState, useEffect } from "react";
import {
  Bot, Wallet, TrendingUp, Zap, Search, Globe, Shield,
  BookOpen, Terminal, ChevronRight, ExternalLink, Copy, CheckCheck,
  ArrowRight, Layers, Target, Repeat, Gift, Sun, Moon, Menu, X, Send, Code2
} from "lucide-react";
import { S, Lang } from "./BotDocsStrings";

const BOT_LINK = "https://t.me/BubbleFlapBot?start=ref_5189577935";

const DK = {
  bg: "#0d0f17",
  sidebar: "#111320",
  sidebarBorder: "rgba(255,255,255,0.07)",
  bar: "#111320",
  barBorder: "rgba(255,255,255,0.07)",
  text: "#e2e8f0",
  muted: "#64748b",
  faint: "#475569",
  card: "rgba(255,255,255,0.04)",
  cardBorder: "rgba(255,255,255,0.08)",
  code: "rgba(255,255,255,0.06)",
  codeBorder: "rgba(255,255,255,0.10)",
  codeText: "#a78bfa",
  accent: "#7c5cff",
  accentBtn: "#5b31fe",
  accentBtnHover: "#4a28d4",
  accentLight: "#a78bfa",
  accentBg: "rgba(124,92,255,0.12)",
  activeNavBg: "rgba(124,92,255,0.14)",
  activeNavText: "#a78bfa",
  inactiveNavText: "#64748b",
  divider: "rgba(255,255,255,0.06)",
  warnBg: "rgba(234,179,8,0.08)",
  warnBorder: "rgba(234,179,8,0.18)",
  warnText: "#fbbf24",
  stepDot: "#5b31fe",
  badge: "rgba(255,255,255,0.06)",
  badgeBorder: "rgba(255,255,255,0.10)",
  badgeText: "#94a3b8",
  overlay: "rgba(0,0,0,0.6)",
  shadow: "rgba(0,0,0,0.4)",
};

const LT = {
  bg: "#f8fafc",
  sidebar: "#ffffff",
  sidebarBorder: "#e2e8f0",
  bar: "#ffffff",
  barBorder: "#e2e8f0",
  text: "#0f172a",
  muted: "#64748b",
  faint: "#94a3b8",
  card: "#f1f5f9",
  cardBorder: "#e2e8f0",
  code: "#f1f5f9",
  codeBorder: "#e2e8f0",
  codeText: "#5b31fe",
  accent: "#5b31fe",
  accentBtn: "#5b31fe",
  accentBtnHover: "#4a28d4",
  accentLight: "#5b31fe",
  accentBg: "#ede9fe",
  activeNavBg: "#ede9fe",
  activeNavText: "#5b31fe",
  inactiveNavText: "#64748b",
  divider: "#e2e8f0",
  warnBg: "#fefce8",
  warnBorder: "#fde68a",
  warnText: "#92400e",
  stepDot: "#5b31fe",
  badge: "#f1f5f9",
  badgeBorder: "#e2e8f0",
  badgeText: "#64748b",
  overlay: "rgba(0,0,0,0.35)",
  shadow: "rgba(0,0,0,0.15)",
};

const NAV_IDS = [
  { id: "intro",      icon: <BookOpen size={14} /> },
  { id: "start",      icon: <Zap size={14} /> },
  { id: "trading",    icon: <TrendingUp size={14} /> },
  { id: "wallet",     icon: <Wallet size={14} /> },
  { id: "limit",      icon: <Layers size={14} /> },
  { id: "auto",       icon: <Target size={14} /> },
  { id: "flapsh",     icon: <Repeat size={14} /> },
  { id: "research",   icon: <Search size={14} /> },
  { id: "referral",   icon: <Gift size={14} /> },
  { id: "tip",        icon: <Send size={14} /> },
  { id: "lang",       icon: <Globe size={14} /> },
  { id: "security",   icon: <Shield size={14} /> },
  { id: "commands",   icon: <Terminal size={14} /> },
  { id: "whitelabel", icon: <Code2 size={14} /> },
] as { id: keyof typeof S.en.nav; icon: React.ReactNode }[];

function SidebarNav({ t, s, activeNav, scrollTo }: { t: typeof DK; s: typeof S.en; activeNav: string; scrollTo: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "24px 16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <img src="/botlogo1.svg" style={{ width: 30, height: 30, objectFit: "contain" }} alt="logo" />
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.text, lineHeight: 1.3 }}>Bubble Flap Bot</div>
            <div style={{ fontSize: 11, color: t.muted }}>{s.docLabel}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: t.faint, textTransform: "uppercase", marginBottom: 6, paddingLeft: 10 }}>{s.menuLabel}</div>
        {NAV_IDS.map(n => (
          <button
            key={n.id}
            onClick={() => scrollTo(n.id)}
            style={{
              display: "flex", alignItems: "center", gap: 9,
              width: "100%", textAlign: "left",
              padding: "7.5px 10px", borderRadius: 8, marginBottom: 1,
              background: activeNav === n.id ? t.activeNavBg : "transparent",
              color: activeNav === n.id ? t.activeNavText : t.inactiveNavText,
              fontSize: 13.5, fontWeight: activeNav === n.id ? 600 : 400,
              border: "none", cursor: "pointer", transition: "background 0.13s, color 0.13s",
            }}
          >
            <span style={{ color: activeNav === n.id ? t.activeNavText : t.faint, flexShrink: 0 }}>{n.icon}</span>
            {s.nav[n.id]}
          </button>
        ))}
      </div>
      <div style={{ marginTop: "auto", padding: "16px", borderTop: `1px solid ${t.sidebarBorder}` }}>
        <a href={BOT_LINK} target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: t.accent, fontWeight: 500, textDecoration: "none" }}
        >
          <ExternalLink size={12} /> {s.openBot}
        </a>
      </div>
    </div>
  );
}

function SectionHeader({ t, icon, title }: { t: typeof DK; icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${t.divider}` }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: t.accentBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: t.accentLight }}>
        {icon}
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: t.text, margin: 0 }}>{title}</h2>
    </div>
  );
}

function Card({ t, children, style }: { t: typeof DK; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: "16px 18px", ...style }}>
      {children}
    </div>
  );
}

function WarnCard({ t, children }: { t: typeof DK; children: React.ReactNode }) {
  return (
    <div style={{ background: t.warnBg, border: `1px solid ${t.warnBorder}`, borderRadius: 12, padding: "14px 16px" }}>
      {children}
    </div>
  );
}

function CodeLine({ t, code }: { t: typeof DK; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: t.code, border: `1px solid ${t.codeBorder}`, borderRadius: 8, padding: "9px 14px", fontFamily: "ui-monospace, monospace", fontSize: 13 }}>
      <code style={{ color: t.codeText }}>{code}</code>
      <button onClick={copy} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.muted, marginLeft: 12, flexShrink: 0, display: "flex" }}>
        {copied ? <CheckCheck size={13} style={{ color: "#4ade80" }} /> : <Copy size={13} />}
      </button>
    </div>
  );
}

function StepItem({ t, n, title, desc }: { t: typeof DK; n: number; title: string; desc: string }) {
  return (
    <div style={{ display: "flex", gap: 14 }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: t.stepDot, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0, marginTop: 2 }}>{n}</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: t.text }}>{title}</div>
        <div style={{ fontSize: 13, color: t.muted, marginTop: 3 }}>{desc}</div>
      </div>
    </div>
  );
}

function CmdRow({ t, cmd, desc }: { t: typeof DK; cmd: string; desc: string }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "9px 0", borderBottom: `1px solid ${t.divider}` }}>
      <code style={{ color: t.codeText, fontFamily: "ui-monospace, monospace", fontSize: 12, background: t.code, padding: "3px 8px", borderRadius: 6, flexShrink: 0, border: `1px solid ${t.codeBorder}`, whiteSpace: "nowrap" }}>{cmd}</code>
      <span style={{ fontSize: 13, color: t.muted, paddingTop: 2 }}>{desc}</span>
    </div>
  );
}

function Badge({ t, text }: { t: typeof DK; text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: t.badge, border: `1px solid ${t.badgeBorder}`, color: t.badgeText, fontSize: 12, padding: "4px 10px", borderRadius: 20, marginRight: 6, marginBottom: 6 }}>
      <ChevronRight size={10} style={{ color: t.accentLight }} /> {text}
    </span>
  );
}

function Section({ id, t, icon, title, children }: { id: string; t: typeof DK; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 56, scrollMarginTop: 120 }}>
      <SectionHeader t={t} icon={icon} title={title} />
      <div style={{ fontSize: 14.5, lineHeight: 1.75, color: t.muted }}>
        {children}
      </div>
    </section>
  );
}

export default function BotDocs() {
  const [dark, setDark] = useState(true);
  const [lang, setLang] = useState<Lang>('en');
  const [activeNav, setActiveNav] = useState("intro");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const t = dark ? DK : LT;
  const s = S[lang];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSidebarOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const scrollTo = (id: string) => {
    setActiveNav(id);
    setSidebarOpen(false);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ background: t.bg, color: t.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      <div className="h-[88px] sm:h-[108px] lg:h-[90px]" />

      {/* Docs top bar */}
      <div className="sticky top-[88px] sm:top-[108px] lg:top-[90px]" style={{ background: t.bar, borderBottom: `1px solid ${t.barBorder}`, zIndex: 40, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 8, background: "transparent", border: "none", cursor: "pointer", color: t.muted }}
          >
            <Menu size={18} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ color: t.faint }}>{s.docsNav}</span>
            <ChevronRight size={11} style={{ color: t.faint }} />
            <span style={{ color: t.text, fontWeight: 500 }}>{s.nav[activeNav as keyof typeof s.nav] ?? s.nav.intro}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Language toggle */}
          <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${t.cardBorder}`, overflow: "hidden" }}>
            <button
              onClick={() => setLang('en')}
              style={{ padding: "4px 10px", fontSize: 12, fontWeight: lang === 'en' ? 700 : 400, background: lang === 'en' ? t.accentBtn : t.card, color: lang === 'en' ? "#fff" : t.muted, border: "none", cursor: "pointer" }}
            >EN</button>
            <button
              onClick={() => setLang('zh')}
              style={{ padding: "4px 10px", fontSize: 12, fontWeight: lang === 'zh' ? 700 : 400, background: lang === 'zh' ? t.accentBtn : t.card, color: lang === 'zh' ? "#fff" : t.muted, border: "none", cursor: "pointer" }}
            >中文</button>
          </div>
          <button
            onClick={() => setDark(!dark)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 8, border: `1px solid ${t.cardBorder}`, background: t.card, cursor: "pointer", color: t.muted, fontSize: 12, fontWeight: 500 }}
          >
            {dark ? <Sun size={13} /> : <Moon size={13} />}
            {dark ? s.light : s.dark}
          </button>
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex" }}>
          <div style={{ position: "absolute", inset: 0, background: t.overlay }} onClick={() => setSidebarOpen(false)} />
          <div style={{ position: "relative", width: 280, background: t.sidebar, height: "100%", overflowY: "auto", zIndex: 101, boxShadow: `4px 0 32px ${t.shadow}` }}>
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 14px 0" }}>
              <button onClick={() => setSidebarOpen(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: t.muted, display: "flex" }}>
                <X size={18} />
              </button>
            </div>
            <SidebarNav t={t} s={s} activeNav={activeNav} scrollTo={scrollTo} />
          </div>
        </div>
      )}

      {/* Page body */}
      <div style={{ display: "flex", flex: 1, maxWidth: 1200, margin: "0 auto", width: "100%" }}>

        {/* Desktop sidebar */}
        <aside
          className="hidden lg:block"
          style={{ width: 252, flexShrink: 0, background: t.sidebar, borderRight: `1px solid ${t.sidebarBorder}`, position: "sticky", top: 140, height: "calc(100vh - 140px)", overflowY: "auto" }}
        >
          <SidebarNav t={t} s={s} activeNav={activeNav} scrollTo={scrollTo} />
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, minWidth: 0, padding: "40px 20px 80px", maxWidth: 780 }} className="sm:px-10">

          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: 56, paddingBottom: 48, borderBottom: `1px solid ${t.divider}` }}>
            <img src="/botlogo1.svg" style={{ width: 64, height: 64, objectFit: "contain", display: "block", margin: "0 auto 20px" }} alt="Bubble Flap Bot" />
            <h1 style={{ fontSize: 34, fontWeight: 800, color: t.text, margin: "0 0 12px", letterSpacing: "-0.5px" }}>Bubble Flap Bot</h1>
            <p style={{ fontSize: 15, color: t.muted, maxWidth: 480, margin: "0 auto 24px", lineHeight: 1.7 }}>
              {s.hero.subtitle}
            </p>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
              <a href={BOT_LINK} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 8, background: t.accentBtn, color: "#fff", fontSize: 14, fontWeight: 600, padding: "10px 22px", borderRadius: 12, textDecoration: "none" }}
              >
                <Bot size={15} /> Open @BubbleFlapBot <ArrowRight size={13} />
              </a>
              <span style={{ fontSize: 12, color: t.muted, border: `1px solid ${t.cardBorder}`, padding: "9px 14px", borderRadius: 10 }}>{s.hero.version}</span>
            </div>
          </div>

          {/* Introduction */}
          <Section id="intro" t={t} icon={<BookOpen size={17} />} title={s.intro.title}>
            <p style={{ marginBottom: 14 }}>
              <strong style={{ color: t.text }}>Bubble Flap Bot</strong> {s.intro.p1}
            </p>
            <p style={{ marginBottom: 20 }}>{s.intro.p2}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {s.intro.features.map(([emoji, title, desc]) => (
                <Card t={t} key={title}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{emoji}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 3 }}>{title}</div>
                  <div style={{ fontSize: 12, color: t.muted }}>{desc}</div>
                </Card>
              ))}
            </div>
          </Section>

          {/* Getting Started */}
          <Section id="start" t={t} icon={<Zap size={17} />} title={s.start.title}>
            <p style={{ marginBottom: 20 }}>{s.start.intro}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
              {s.start.steps.map(([title, desc], i) => (
                <StepItem key={i} t={t} n={i + 1} title={title} desc={desc} />
              ))}
            </div>
            <WarnCard t={t}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.warnText, marginBottom: 4 }}>{s.start.warnTitle}</div>
              <div style={{ fontSize: 13, color: t.warnText, opacity: 0.85 }}>{s.start.warnText}</div>
            </WarnCard>
          </Section>

          {/* Trading */}
          <Section id="trading" t={t} icon={<TrendingUp size={17} />} title={s.trading.title}>
            <p style={{ marginBottom: 20 }}>{s.trading.intro}</p>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 10 }}>{s.trading.panelTitle}</div>
              <p style={{ marginBottom: 12 }}>{s.trading.panelDesc}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
                {s.trading.panelFeatures.map(f => <Badge key={f} t={t} text={f} />)}
              </div>
            </div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 10 }}>{s.trading.cmdTitle}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <CodeLine t={t} code="/buy 0xTokenAddress 0.1" />
                <CodeLine t={t} code="/sell 0xTokenAddress 50" />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 8 }}>{s.trading.autoTitle}</div>
              <p>{s.trading.autoDesc}</p>
            </div>
          </Section>

          {/* Wallet */}
          <Section id="wallet" t={t} icon={<Wallet size={17} />} title={s.wallet.title}>
            <p style={{ marginBottom: 20 }}>{s.wallet.intro}</p>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {s.wallet.items.map(([title, desc], i, arr) => (
                <div key={title} style={{ display: "flex", gap: 16, padding: "12px 0", borderBottom: i < arr.length - 1 ? `1px solid ${t.divider}` : "none" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: t.accentLight, flexShrink: 0, minWidth: 130 }}>{title}</span>
                  <span style={{ fontSize: 13, color: t.muted }}>{desc}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Limit Orders */}
          <Section id="limit" t={t} icon={<Layers size={17} />} title={s.limit.title}>
            <p style={{ marginBottom: 20 }}>{s.limit.intro}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
              {s.limit.steps.map(([title, desc], i) => (
                <StepItem key={i} t={t} n={i + 1} title={title} desc={desc} />
              ))}
            </div>
            <CodeLine t={t} code="/limit" />
          </Section>

          {/* Automation */}
          <Section id="auto" t={t} icon={<Target size={17} />} title={s.auto.title}>
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 10 }}>{s.auto.sniperTitle}</div>
                <p style={{ marginBottom: 12 }}>{s.auto.sniperDesc}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  <CodeLine t={t} code="/snipe 0xTokenAddress 0.1" />
                  <div style={{ fontSize: 12, color: t.faint }}>{s.auto.sniperFmt}</div>
                </div>
                <p>{s.auto.sniperOr}<strong style={{ color: t.text }}>{s.auto.sniperBtn}</strong>{s.auto.sniperOr2}</p>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 10 }}>{s.auto.alertTitle}</div>
                <p style={{ marginBottom: 12 }}>{s.auto.alertDesc}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <CodeLine t={t} code="/alert 0xTokenAddress 2x" />
                  <div style={{ fontSize: 12, color: t.faint }}>{s.auto.alertFmt}</div>
                </div>
              </div>
              <Card t={t}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 8 }}>{s.auto.cancelTitle}</div>
                <CodeLine t={t} code="/cancel" />
                <div style={{ fontSize: 12, color: t.muted, marginTop: 6 }}>{s.auto.cancelDesc}</div>
              </Card>
            </div>
          </Section>

          {/* Flap.sh Discovery */}
          <Section id="flapsh" t={t} icon={<Repeat size={17} />} title={s.flapsh.title}>
            <p style={{ marginBottom: 24 }}>
              {s.flapsh.intro.split('Flap.sh')[0]}<strong style={{ color: t.text }}>Flap.sh</strong>{s.flapsh.intro.split('Flap.sh').slice(1).join('Flap.sh')}
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 14, marginBottom: 24 }}>
              <Card t={t}>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 8 }}>{s.flapsh.gradTitle}</div>
                <p style={{ fontSize: 13, marginBottom: 10 }}>{s.flapsh.gradDesc}</p>
                <ul style={{ fontSize: 12, color: t.faint, paddingLeft: 16, margin: "0 0 12px", lineHeight: 2 }}>
                  {s.flapsh.gradItems.map(item => <li key={item}>{item}</li>)}
                </ul>
                <CodeLine t={t} code="/recentbond" />
              </Card>
              <Card t={t}>
                <div style={{ fontSize: 16, fontWeight: 700, color: t.text, marginBottom: 8 }}>{s.flapsh.newTitle}</div>
                <p style={{ fontSize: 13, marginBottom: 10 }}>{s.flapsh.newDesc}</p>
                <ul style={{ fontSize: 12, color: t.faint, paddingLeft: 16, margin: "0 0 12px", lineHeight: 2 }}>
                  {s.flapsh.newItems.map(item => <li key={item}>{item}</li>)}
                </ul>
                <CodeLine t={t} code="/newcreated" />
              </Card>
            </div>
            <Card t={t} style={{ background: "rgba(16,185,129,0.06)", borderColor: "rgba(16,185,129,0.18)", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#34d399", marginBottom: 4 }}>{s.flapsh.volumeTitle}</div>
              <div style={{ fontSize: 13, color: t.muted }}>{s.flapsh.volumeDesc}</div>
            </Card>
            <div style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 10 }}>{s.flapsh.cmdsTitle}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <CodeLine t={t} code="/recentbond" />
              <CodeLine t={t} code="/newcreated" />
              <CodeLine t={t} code="/new" />
            </div>
          </Section>

          {/* Research */}
          <Section id="research" t={t} icon={<Search size={17} />} title={s.research.title}>
            <p style={{ marginBottom: 20 }}>{s.research.intro}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {s.research.items.map(([title, cmd, desc]) => (
                <Card t={t} key={cmd}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text }}>{title}</div>
                    <code style={{ color: t.codeText, fontFamily: "ui-monospace, monospace", fontSize: 11, background: t.code, padding: "2px 7px", borderRadius: 5, border: `1px solid ${t.codeBorder}` }}>{cmd}</code>
                  </div>
                  <div style={{ fontSize: 12, color: t.muted }}>{desc}</div>
                </Card>
              ))}
            </div>
          </Section>

          {/* Referral */}
          <Section id="referral" t={t} icon={<Gift size={17} />} title={s.referral.title}>
            <p style={{ marginBottom: 20 }}>{s.referral.intro}</p>
            <Card t={t} style={{ background: "rgba(236,72,153,0.06)", borderColor: "rgba(236,72,153,0.18)", marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#f472b6", marginBottom: 4 }}>{s.referral.permanentTitle}</div>
              <div style={{ fontSize: 13, color: t.muted }}>
                {s.referral.permanentDesc} <strong style={{ color: t.text }}>{s.referral.permanentMonths}</strong> {s.referral.permanentSuffix}
              </div>
            </Card>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
              {s.referral.steps.map(([title, desc], i) => (
                <StepItem key={i} t={t} n={i + 1} title={title} desc={desc} />
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, marginBottom: 20 }}>
              <Card t={t}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>{s.referral.tierTitle}</div>
                <div style={{ fontSize: 12, color: t.muted }}>{s.referral.tierBase} <strong style={{ color: t.text }}>{s.referral.tierBaseRate}</strong></div>
                <div style={{ fontSize: 12, color: t.muted }}>{s.referral.tierVip} <strong style={{ color: t.text }}>{s.referral.tierVipRate}</strong></div>
              </Card>
              <Card t={t}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginBottom: 4 }}>{s.referral.inviteeTitle}</div>
                <div style={{ fontSize: 12, color: t.muted }}>{s.referral.inviteeDesc} <strong style={{ color: t.text }}>{s.referral.inviteeDiscount}</strong> {s.referral.inviteeSuffix}</div>
              </Card>
              <Card t={t} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>⏳</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{s.referral.windowTitle}</div>
                <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{s.referral.windowDesc}</div>
              </Card>
              <Card t={t} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>🎯</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{s.referral.nocapTitle}</div>
                <div style={{ fontSize: 11, color: t.muted, marginTop: 2 }}>{s.referral.nocapDesc}</div>
              </Card>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 10 }}>{s.referral.claimTitle}</div>
              <div style={{ display: "flex", flexWrap: "wrap" }}>
                {s.referral.claimBadges.map(f => <Badge key={f} t={t} text={f} />)}
              </div>
            </div>
            <CodeLine t={t} code="/referral" />
          </Section>

          {/* Tip System */}
          <Section id="tip" t={t} icon={<Send size={17} />} title={s.tip.title}>
            <p style={{ marginBottom: 20 }}>{s.tip.intro}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
              {s.tip.methods.map(([label, code, desc]) => (
                <Card t={t} key={label}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: t.faint, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
                  <code style={{ display: "block", fontFamily: "ui-monospace, monospace", fontSize: 13, color: t.codeText, background: t.code, padding: "6px 10px", borderRadius: 6, marginBottom: 8 }}>{code}</code>
                  <div style={{ fontSize: 13, color: t.muted }}>{desc}</div>
                </Card>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 20 }}>
              {s.tip.features.map(([title, desc], i, arr) => (
                <div key={title} style={{ display: "flex", gap: 14, padding: "13px 0", borderBottom: i < arr.length - 1 ? `1px solid ${t.divider}` : "none" }}>
                  <span style={{ color: "#4ade80", flexShrink: 0, marginTop: 2 }}>✓</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: 13, color: t.muted }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <CodeLine t={t} code="/tip" />
          </Section>

          {/* Languages */}
          <Section id="lang" t={t} icon={<Globe size={17} />} title={s.lang.title}>
            <p style={{ marginBottom: 20 }}>{s.lang.intro}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
              {s.lang.langs.map(([flag, label, sub]) => (
                <Card t={t} key={label} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22 }}>{flag}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.text, marginTop: 6 }}>{label}</div>
                  <div style={{ fontSize: 11, color: t.faint }}>{sub}</div>
                </Card>
              ))}
            </div>
            <p>{s.lang.switchText} <strong style={{ color: t.text }}>{s.lang.switchBtn}</strong> {s.lang.switchText2} <code style={{ color: t.codeText, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{s.lang.switchReset}</code> {s.lang.switchText3}</p>
          </Section>

          {/* Security */}
          <Section id="security" t={t} icon={<Shield size={17} />} title={s.security.title}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {s.security.items.map(([title, desc], i, arr) => (
                <div key={title} style={{ display: "flex", gap: 14, padding: "13px 0", borderBottom: i < arr.length - 1 ? `1px solid ${t.divider}` : "none" }}>
                  <span style={{ color: "#4ade80", flexShrink: 0, marginTop: 2 }}>✓</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: 13, color: t.muted }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Commands */}
          <Section id="commands" t={t} icon={<Terminal size={17} />} title={s.commands.title}>
            <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
              {s.commands.groups.map(([group, cmds]) => (
                <div key={group}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: t.faint, textTransform: "uppercase", marginBottom: 8 }}>{group}</div>
                  <div>
                    {cmds.map(([cmd, desc]) => (
                      <CmdRow key={cmd} t={t} cmd={cmd} desc={desc} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* White Label API */}
          <Section id="whitelabel" t={t} icon={<Code2 size={17} />} title={s.whitelabel.title}>
            <p style={{ marginBottom: 8 }}>{s.whitelabel.intro}</p>
            <p style={{ marginBottom: 24, fontSize: 13, color: t.muted }}>{s.whitelabel.intro2}</p>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: t.faint, textTransform: "uppercase", marginBottom: 10 }}>{s.whitelabel.customTitle}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10, marginBottom: 28 }}>
              {s.whitelabel.customItems.map(([icon, label]) => (
                <Card t={t} key={label} style={{ textAlign: "center", padding: "12px 10px" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontSize: 12, color: t.text, fontWeight: 500 }}>{label}</div>
                </Card>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: t.faint, textTransform: "uppercase", marginBottom: 10 }}>{s.whitelabel.revenueTitle}</div>
            <Card t={t} style={{ marginBottom: 28 }}>
              <div style={{ display: "flex", gap: 24, flexWrap: "wrap" as const }}>
                {s.whitelabel.revenueItems.map(([label, desc]) => (
                  <div key={label} style={{ flex: "1 1 200px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.text, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 12, color: t.muted }}>{desc}</div>
                  </div>
                ))}
              </div>
            </Card>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: t.faint, textTransform: "uppercase", marginBottom: 10 }}>{s.whitelabel.featuresTitle}</div>
            <div style={{ display: "flex", flexDirection: "column", marginBottom: 28 }}>
              {s.whitelabel.features.map(([title, desc], i, arr) => (
                <div key={title} style={{ display: "flex", gap: 14, padding: "13px 0", borderBottom: i < arr.length - 1 ? `1px solid ${t.divider}` : "none" }}>
                  <span style={{ color: "#4ade80", flexShrink: 0, marginTop: 2 }}>✓</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: t.text, marginBottom: 3 }}>{title}</div>
                    <div style={{ fontSize: 13, color: t.muted }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", color: t.faint, textTransform: "uppercase", marginBottom: 10 }}>{s.whitelabel.deployTitle}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 28 }}>
              {s.whitelabel.deployItems.map(([icon, label, sub]) => (
                <Card t={t} key={label} style={{ textAlign: "center", padding: "12px 10px" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: t.text }}>{label}</div>
                  <div style={{ fontSize: 11, color: t.faint, marginTop: 3 }}>{sub}</div>
                </Card>
              ))}
            </div>

            <div style={{ background: t.card, border: `1px solid ${t.cardBorder}`, borderRadius: 12, padding: "20px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 8 }}>{s.whitelabel.ctaTitle}</div>
              <p style={{ fontSize: 13, color: t.muted, marginBottom: 16 }}>{s.whitelabel.ctaDesc}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" as const }}>
                <a href="https://t.me/tonbaoyen" target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, background: t.accentBtn, color: "#fff", fontSize: 13, fontWeight: 600, padding: "10px 22px", borderRadius: 10, textDecoration: "none" }}
                >
                  <Send size={14} /> @tonbaoyen
                </a>
                <a href="https://t.me/CryptoSafeDev" target="_blank" rel="noopener noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, background: t.accentBtn, color: "#fff", fontSize: 13, fontWeight: 600, padding: "10px 22px", borderRadius: 10, textDecoration: "none" }}
                >
                  <Send size={14} /> @CryptoSafeDev
                </a>
              </div>
            </div>
          </Section>

          {/* Footer */}
          <div style={{ textAlign: "center", paddingTop: 32, borderTop: `1px solid ${t.divider}` }}>
            <p style={{ fontSize: 13, color: t.faint, marginBottom: 20 }}>{s.footer.powered}</p>
            <a href={BOT_LINK} target="_blank" rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, background: t.accentBtn, color: "#fff", fontSize: 14, fontWeight: 600, padding: "11px 24px", borderRadius: 12, textDecoration: "none" }}
            >
              <Bot size={16} /> {s.footer.cta}
            </a>
          </div>

        </main>
      </div>
    </div>
  );
}
