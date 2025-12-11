export function DateSeparator({ date }: { date: Date }) {
  const label = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <div className="flex items-center gap-4 my-4">
      <div className="h-px flex-1 bg-slate-800" />
      <span className="text-xs text-slate-400 px-2 py-1 rounded-full bg-slate-900/60 border border-slate-800">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-800" />
    </div>
  );
}