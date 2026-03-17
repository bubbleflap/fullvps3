interface Props {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}

export default function Pagination({ page, totalPages, total, onPage }: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col items-center gap-1.5 pt-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            onClick={() => onPage(p)}
            className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-all border ${
              p === page
                ? "bg-[#5b31fe] border-[#5b31fe] text-white"
                : "bg-[#0f0f1e] border-[#1e1e3a] text-white/40 hover:border-[#5b31fe]/50 hover:text-white"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
