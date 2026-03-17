import type { ReactNode } from "react";
import type { PageView } from "../../components/Header";

interface InfoPageProps {
  icon: ReactNode;
  title: string;
  description: string;
  features: string[];
  onNavigate: (page: PageView) => void;
  target: PageView;
  accentColor?: string;
}

export default function DashInfoPage({ icon, title, description, features, onNavigate, target, accentColor = "#5b31fe" }: InfoPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] py-10">
      <div className="max-w-lg w-full mx-auto">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl" style={{ background: `${accentColor}22`, border: `1px solid ${accentColor}44` }}>
            {icon}
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
            <p className="text-white/50 text-sm leading-relaxed">{description}</p>
          </div>
        </div>

        <div className="bg-[#0f0f1e] border border-[#1e1e3a] rounded-2xl p-5 mb-6">
          <div className="text-xs text-white/30 uppercase tracking-wider mb-3">Features</div>
          <ul className="flex flex-col gap-2">
            {features.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-white/60">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: accentColor }} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => onNavigate(target)}
          className="w-full py-3 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: accentColor }}
        >
          Open Full Page →
        </button>
      </div>
    </div>
  );
}
