import { useEffect, useState } from 'react';

export function ScrollToBottom({ containerRef }: { containerRef: React.RefObject<HTMLDivElement> }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {return;}
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      setShow(!atBottom);
    };
    onScroll();
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [containerRef]);

  if (!show) {return null;}

  return (
    <button
      onClick={() => {
        const el = containerRef.current;
        if (el) {el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });}
      }}
      className="absolute bottom-4 right-6 px-3 py-1.5 rounded-full bg-brand-500 hover:bg-brand-400 text-white text-xs shadow-elevated"
      aria-label="Aller en bas"
    >
      ↓ Nouveaux messages
    </button>
  );
}