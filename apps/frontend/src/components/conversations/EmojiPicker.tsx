import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EMOJI_CATALOG, type EmojiCategoryId } from './emojiCatalog';

interface EmojiPickerProps {
  onSelectEmoji: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onSelectEmoji, disabled = false }: EmojiPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<EmojiCategoryId>('people');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [isOpen]);

  const visibleEmojis = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const category = EMOJI_CATALOG.find((item) => item.id === activeCategory) ?? EMOJI_CATALOG[0];

    if (!normalizedQuery) {
      return category.emojis;
    }

    return category.emojis.filter((entry) =>
      entry.keywords.some((keyword) => keyword.includes(normalizedQuery))
    );
  }, [activeCategory, query]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={disabled}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-950/50 text-xl text-slate-200 transition hover:border-cyan-300/30 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
        title={t('messages.emoji_button')}
        aria-label={t('messages.emoji_button')}
        aria-expanded={isOpen}
      >
        🙂
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 z-[120] mb-3 w-[320px] rounded-3xl border border-cyan-400/20 bg-[rgba(6,12,26,0.96)] p-4 shadow-[0_24px_80px_rgba(2,6,23,0.65)] backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">{t('messages.emoji_picker_title')}</p>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 transition hover:border-white/20 hover:text-white"
            >
              {t('messages.emoji_picker_close')}
            </button>
          </div>

          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('messages.emoji_search_placeholder')}
            className="cosmic-input cosmic-input-plain mb-3 text-sm"
          />

          <div className="mb-3 flex flex-wrap gap-2">
            {EMOJI_CATALOG.map((category) => {
              const active = category.id === activeCategory;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setActiveCategory(category.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? 'border-cyan-400/30 bg-cyan-400/12 text-cyan-200'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:text-white'
                  }`}
                  title={t(category.labelKey)}
                >
                  <span className="mr-1.5">{category.icon}</span>
                  <span>{t(category.labelKey)}</span>
                </button>
              );
            })}
          </div>

          {visibleEmojis.length > 0 ? (
            <div className="grid max-h-64 grid-cols-8 gap-2 overflow-y-auto pr-1">
              {visibleEmojis.map((entry) => (
                <button
                  key={`${activeCategory}-${entry.emoji}`}
                  type="button"
                  onClick={() => {
                    onSelectEmoji(entry.emoji);
                    setIsOpen(false);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/5 bg-white/[0.03] text-xl transition hover:border-cyan-300/30 hover:bg-cyan-400/10"
                  title={entry.keywords.join(', ')}
                >
                  {entry.emoji}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-6 text-center text-sm text-slate-400">
              {t('messages.emoji_no_results')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
