import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import '../styles/fluidCrypto.css';
import CosmicConstellationLogo from '../components/CosmicConstellationLogo';
import AnimatedBanner from '../components/AnimatedBanner';
import MouseGlowCard from '../components/MouseGlowCard';

type DiscoverFeatureCard = {
  icon: string;
  title: string;
  description: string;
  panelTitle: string;
  bullets: string[];
  info: string;
};

type DiscoverArchitectureCard = {
  icon: string;
  title: string;
  items: string[];
  extra?: string;
};

type DiscoverRuntimeRow = {
  label: string;
  value: string;
  detail: string;
};

export default function Discover() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const badges = t('discover_public.badges', { returnObjects: true }) as string[];
  const featureCards = t('discover_public.feature_cards', { returnObjects: true }) as DiscoverFeatureCard[];
  const architectureCards = t('discover_public.architecture_cards', { returnObjects: true }) as DiscoverArchitectureCard[];
  const flowSteps = t('discover_public.flow_steps', { returnObjects: true }) as string[];
  const runtimeRows = t('discover_public.runtime_rows', { returnObjects: true }) as DiscoverRuntimeRow[];

  return (
    <div className="cosmic-scene min-h-screen p-8 relative overflow-hidden">
      <div className="cosmic-nebula" aria-hidden="true" />
      <div className="cosmic-stars" aria-hidden="true" />
      <div className="cosmic-p2p-grid" aria-hidden="true" />
      <div className="cosmic-volumetric" aria-hidden="true" />

      <div className="max-w-6xl mx-auto relative z-10">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
          <button onClick={() => navigate(-1)} className="cosmic-btn-ghost mb-6">
            {t('common.back')}
          </button>

          <CosmicConstellationLogo />
          <h1 className="cosmic-title text-5xl font-black mb-4">
            <span className="cosmic-title-cipher">{t('discover_public.title')}</span>
          </h1>
          <p className="text-xl text-soft-grey">{t('discover_public.subtitle')}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="cosmic-glass-card p-8 mb-8 relative">
          <div className="cosmic-glow-border" aria-hidden="true" />
          <h2 className="text-3xl font-bold mb-4 text-pure-white">{t('discover_public.overview_title')}</h2>
          <p className="text-soft-grey mb-5 text-lg leading-relaxed">{t('discover_public.overview_paragraph')}</p>
          <div className="flex flex-wrap gap-3">
            {badges.map((badge, index) => (
              <span key={badge} className={index % 2 === 0 ? 'cosmic-badge-cyan' : 'cosmic-badge-violet'}>
                {badge}
              </span>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {featureCards.map((card, index) => (
            <TechCard key={card.title} icon={card.icon} title={card.title} delay={0.25 + index * 0.1} step={index + 1}>
              <p className="text-soft-grey mb-4">{card.description}</p>
              <BulletPanel title={card.panelTitle} bullets={card.bullets} />
              <InfoLine>{card.info}</InfoLine>
            </TechCard>
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} className="cosmic-glass-card p-8 mb-8 relative">
          <div className="cosmic-glow-border" aria-hidden="true" />
          <h2 className="text-3xl font-bold mb-6 text-pure-white">
            <AnimatedBanner label="GUIDE" variant="cyan" />
            <span className="ml-1" />
            {t('discover_public.architecture_title')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {architectureCards.map((card, index) => (
              <ArchCard key={card.title} title={card.title} icon={card.icon} items={card.items} extra={card.extra} step={index + 1} />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MouseGlowCard className="rounded-xl p-6 border border-[rgba(0,240,255,0.14)] bg-[rgba(6,12,26,0.7)]">
              <h4 className="text-sm font-bold text-pure-white mb-4 flex items-center gap-2">
                <AnimatedBanner label="FLOW" variant="violet" />
                {t('discover_public.flow_title')}
              </h4>
              <StepPanel title={t('discover_public.flow_title')} steps={flowSteps} />
            </MouseGlowCard>

            <MouseGlowCard className="rounded-xl p-6 border border-[rgba(0,240,255,0.14)] bg-[rgba(6,12,26,0.7)]">
              <h4 className="text-sm font-bold text-pure-white mb-4 flex items-center gap-2">
                <AnimatedBanner label="FOCUS" variant="cyan" />
                {t('discover_public.runtime_title')}
              </h4>
              <RuntimeTable rows={runtimeRows} />
            </MouseGlowCard>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }} className="text-center">
          <h3 className="text-2xl font-bold mb-4 text-pure-white">{t('discover_public.cta_title')}</h3>
          <div className="flex gap-4 justify-center flex-wrap">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/login')} className="cosmic-cta">
              <span>{t('discover_public.cta_primary')}</span>
              <div className="cosmic-cta-glow" aria-hidden="true" />
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => navigate('/signup')} className="cosmic-btn-ghost">
              {t('discover_public.cta_secondary')}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function TechCard({ icon, title, delay, step, children }: { icon: string; title: string; delay: number; step?: number; children: React.ReactNode }) {
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.transform = `perspective(600px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg)`;
    el.style.setProperty('--card-glow-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--card-glow-y', `${e.clientY - rect.top}px`);
    el.style.setProperty('--card-glow-opacity', '1');
  };

  const handleMouseLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg)';
    el.style.setProperty('--card-glow-opacity', '0');
  };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="cosmic-glass-card p-6 relative overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ transition: 'transform 0.15s ease-out', willChange: 'transform' }}
    >
      <div className="cosmic-glow-border" aria-hidden="true" />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(250px circle at var(--card-glow-x, 0px) var(--card-glow-y, 0px), rgba(0,240,255,0.1), transparent 60%)',
          opacity: 'var(--card-glow-opacity, 0)',
          transition: 'opacity 0.3s ease',
          zIndex: 1,
        }}
      />
      {step && (
        <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-pure-white z-10"
          style={{ background: 'linear-gradient(135deg, var(--cosmic-cyan), var(--cosmic-violet))' }}>
          {step}
        </div>
      )}
      <div className="flex items-center gap-3 mb-4 relative z-[2]">
        <span className="text-2xl">{icon}</span>
        <h3 className="text-xl font-bold text-pure-white">{title}</h3>
      </div>
      <div className="relative z-[2]">{children}</div>
    </motion.div>
  );
}

function ArchCard({ title, icon, items, extra, step }: { title: string; icon: string; items: string[]; extra?: string; step?: number }) {
  return (
    <div className="rounded-xl p-4 border border-[rgba(0,240,255,0.14)] bg-[rgba(6,12,26,0.78)] relative">
      {step && (
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-pure-white"
          style={{ background: 'var(--cosmic-violet)' }}>
          {step}
        </div>
      )}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <h4 className="text-sm font-bold text-pure-white">{title}</h4>
      </div>
      <ul className="space-y-2 text-xs text-soft-grey">
        {items.map((item, index) => (
          <li key={item} className="flex items-start gap-2">
            <span className="w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold mt-0.5"
              style={{ background: 'rgba(0,240,255,0.15)', color: 'var(--cosmic-cyan)' }}>
              {index + 1}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {extra && (
        <div className="mt-3 p-2 rounded text-xs border border-[rgba(34,197,94,0.18)] bg-[rgba(34,197,94,0.08)]">
          <span className="text-green-400">OK</span>
          <span className="text-soft-grey ml-1">{extra}</span>
        </div>
      )}
    </div>
  );
}

function StepPanel({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="bg-dark-matter-lighter p-4 rounded-lg">
      <h4 className="text-sm font-bold text-pure-white mb-3">{title}</h4>
      <div className="space-y-3 text-xs text-soft-grey">
        {steps.map((step, index) => (
          <div key={step} className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold"
              style={{ background: 'linear-gradient(135deg, var(--cosmic-cyan), var(--cosmic-violet))', color: '#fff' }}>
              {index + 1}
            </div>
            <span className="pt-0.5">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BulletPanel({ title, bullets }: { title: string; bullets: string[] }) {
  return (
    <div className="bg-dark-matter-lighter p-4 rounded-lg mb-4">
      <h4 className="text-sm font-bold text-pure-white mb-2">{title}</h4>
      <ul className="space-y-2 text-xs text-soft-grey">
        {bullets.map((bullet) => (
          <li key={bullet} className="flex items-start gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1" style={{ background: 'var(--cosmic-cyan)' }} />
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RuntimeTable({ rows }: { rows: DiscoverRuntimeRow[] }) {
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(6,12,26,0.78)] p-3">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="text-sm font-semibold text-pure-white">{row.label}</span>
            <span className="text-xs uppercase tracking-[0.18em]" style={{ color: 'var(--cosmic-cyan)' }}>
              {row.value}
            </span>
          </div>
          <p className="text-xs text-soft-grey">{row.detail}</p>
        </div>
      ))}
    </div>
  );
}

function InfoLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cosmic-violet)' }}>
      <span className="cosmic-badge-violet">INFO</span>
      <span>{children}</span>
    </div>
  );
}
