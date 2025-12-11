import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="dark-matter-bg min-h-screen flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md"
      >
        {/* 404 Animation */}
        <motion.div
          animate={{
            rotate: [0, 10, -10, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="text-8xl mb-6"
        >
          🔐
        </motion.div>

        {/* Title */}
        <h1 className="text-6xl font-black glow-text-cyan mb-4">
          {t('notfound.title')}
        </h1>

        <h2 className="text-2xl font-bold text-pure-white mb-4">
          {t('notfound.subtitle')}
        </h2>

        <p className="text-soft-grey mb-8">
          {t('notfound.description')}
        </p>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={() => navigate('/')}
            className="btn btn-primary w-full"
          >
            {t('notfound.back_home')}
          </button>

          <button
            onClick={() => navigate(-1)}
            className="btn btn-ghost w-full"
          >
            {t('notfound.back_previous')}
          </button>
        </div>

        {/* Decorative Elements */}
        <div className="mt-8 flex justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-quantum-cyan animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-quantum-cyan animate-pulse" style={{ animationDelay: '0.2s' }} />
          <div className="w-2 h-2 rounded-full bg-quantum-cyan animate-pulse" style={{ animationDelay: '0.4s' }} />
        </div>
      </motion.div>
    </div>
  );
}
