/**
 * Discover Page - Technical Deep Dive
 * 
 * Explique la technologie et les aspects techniques de Cipher Pulse
 */

import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import '../styles/fluidCrypto.css';

export default function Discover() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="dark-matter-bg min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <button
            onClick={() => navigate(-1)}
            className="btn btn-ghost mb-6"
          >
            {t('discover.back')}
          </button>

          <h1
            className="text-5xl font-black mb-4 glow-text-cyan"
            style={{ color: 'var(--quantum-cyan)' }}
          >
            {t('discover.title')}
          </h1>
          <p className="text-xl text-soft-grey">
            {t('discover.subtitle')}
          </p>
        </motion.div>

        {/* Overview Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-8 mb-8"
        >
          <h2 className="text-3xl font-bold mb-4 text-pure-white">
            {t('discover.overview_title')}
          </h2>
          <p className="text-soft-grey mb-4 text-lg leading-relaxed">
            {t('discover.overview_description_1')}{' '}
            <span className="text-quantum-cyan font-semibold">{t('discover.overview_description_2')}</span>,{' '}
            <span className="text-magenta-trust font-semibold">{t('discover.overview_description_3')}</span>, {t('discover.overview_description_4')}{' '}
            {t('discover.overview_description_5')}
          </p>
          <div className="flex flex-wrap gap-3">
            <span className="badge badge-quantum">
              <span>🔐</span>
              <span>{t('discover.badge_signal_protocol')}</span>
            </span>
            <span className="badge badge-trust">
              <span>🎲</span>
              <span>{t('landing.dicekey_auth')}</span>
            </span>
            <span className="badge badge-quantum">
              <span>⛓️</span>
              <span>{t('landing.blockchain_timelock')}</span>
            </span>
            <span className="badge badge-trust">
              <span>🔥</span>
              <span>{t('landing.burn_after_reading_feature')}</span>
            </span>
          </div>
        </motion.div>

        {/* Tech Sections */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <TechCard
            icon="🎲"
            title={t('discover.dicekey_title')}
            delay={0.3}
          >
            <p className="text-soft-grey mb-4">
              {t('discover.dicekey_desc')} <strong className="text-quantum-cyan">{t('discover.dicekey_desc_2')}</strong> {t('discover.dicekey_desc_3')}
            </p>
            
            <div className="bg-dark-matter-lighter p-4 rounded-lg mb-4">
              <h4 className="text-sm font-bold text-pure-white mb-2">{t('discover.pipeline_title')}</h4>
              <div className="space-y-2 text-xs text-soft-grey">
                <div className="flex items-center gap-2">
                  <span className="text-quantum-cyan">1.</span>
                  <span>{t('discover.pipeline_step_1')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-quantum-cyan">2.</span>
                  <span>{t('discover.pipeline_step_2')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-quantum-cyan">3.</span>
                  <span>{t('discover.pipeline_step_3')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-quantum-cyan">4.</span>
                  <span>Ed25519 + X25519 → {t('discover.crypto_keys')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-magenta-trust">
              <span>💡</span>
              <span>{t('discover.quantum_resistance')}</span>
            </div>
          </TechCard>

          <TechCard
            icon="🔐"
            title={t('discover.signal_protocol_full')}
            delay={0.4}
          >
            <p className="text-soft-grey mb-4">
              {t('discover.signal_desc_full')}
            </p>
            
            <div className="bg-dark-matter-lighter p-4 rounded-lg mb-4">
              <h4 className="text-sm font-bold text-pure-white mb-2">{t('discover.components_title')}</h4>
              <ul className="space-y-2 text-xs text-soft-grey">
                <li className="flex items-start gap-2">
                  <span className="text-quantum-cyan">•</span>
                  <span><strong>Ed25519</strong> : {t('discover.component_ed25519')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-quantum-cyan">•</span>
                  <span><strong>X25519</strong> : {t('discover.component_x25519')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-quantum-cyan">•</span>
                  <span><strong>AES-256-GCM</strong> : {t('discover.component_aes256')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-quantum-cyan">•</span>
                  <span><strong>HMAC-SHA256</strong> : {t('discover.component_hmac')}</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-2 text-xs text-magenta-trust">
              <span>💡</span>
              <span>{t('discover.one_time_prekeys')}</span>
            </div>
          </TechCard>

          <TechCard
            icon="🔥"
            title={t('discover.burn_title')}
            delay={0.5}
          >
            <p className="text-soft-grey mb-4">
              {t('discover.burn_desc_full')}
            </p>
            
            <div className="bg-dark-matter-lighter p-4 rounded-lg mb-4">
              <h4 className="text-sm font-bold text-pure-white mb-2">{t('discover.available_modes')}</h4>
              <ul className="space-y-2 text-xs text-soft-grey">
                <li className="flex items-start gap-2">
                  <span className="text-quantum-cyan">🔥</span>
                  <span><strong>{t('discover.burn_mode_after_reading')}</strong> : {t('discover.burn_mode_after_reading_desc')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-magenta-trust">⏰</span>
                  <span><strong>{t('discover.burn_mode_delay')}</strong> : {t('discover.burn_mode_delay_desc')}</span>
                </li>
              </ul>
            </div>

            <div className="flex items-center gap-2 text-xs text-magenta-trust">
              <span>💡</span>
              <span>{t('discover.audit_trail')}</span>
            </div>
          </TechCard>

          <TechCard
            icon="⏰"
            title={t('discover.timelock_title_full')}
            delay={0.6}
          >
            <p className="text-soft-grey mb-4">
              {t('discover.timelock_desc_full')}
            </p>
            
            <div className="bg-dark-matter-lighter p-4 rounded-lg mb-4">
              <h4 className="text-sm font-bold text-pure-white mb-2">{t('discover.how_it_works_title')}</h4>
              <div className="space-y-2 text-xs text-soft-grey">
                <div className="flex items-center gap-2">
                  <span className="text-quantum-cyan">1.</span>
                  <span>{t('discover.timelock_step_1_full')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-quantum-cyan">2.</span>
                  <span>{t('discover.timelock_step_2_full')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-quantum-cyan">3.</span>
                  <span>{t('discover.timelock_step_3_full')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-quantum-cyan">4.</span>
                  <span>{t('discover.timelock_step_4_full')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-magenta-trust">
              <span>💡</span>
              <span>{t('discover.impossible_to_cheat')}</span>
            </div>
          </TechCard>
        </div>

        {/* Architecture Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="glass-card p-8 mb-8"
        >
          <h2 className="text-3xl font-bold mb-6 text-pure-white">
            🏗️ {t('discover.architecture_title')}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <ArchCard title={t('discover.frontend_title')} icon="⚛️">
              <ul className="space-y-1 text-xs text-soft-grey">
                <li>• {t('discover.arch_frontend_stack_1')}</li>
                <li>• {t('discover.arch_frontend_stack_2')}</li>
                <li>• {t('discover.arch_frontend_stack_3')}</li>
                <li>• {t('discover.arch_frontend_stack_4')}</li>
                <li>• {t('discover.arch_frontend_stack_5')}</li>
              </ul>
              <div className="mt-3 p-2 bg-dark-matter rounded text-xs">
                <span className="text-green-400">✓</span>
                <span className="text-soft-grey ml-1">{t('discover.not_affected_cve')}</span>
              </div>
            </ArchCard>

            <ArchCard title={t('discover.backend_title')} icon="🚀">
              <ul className="space-y-1 text-xs text-soft-grey">
                <li>• {t('discover.arch_backend_stack_1')}</li>
                <li>• {t('discover.arch_backend_stack_2')}</li>
                <li>• {t('discover.arch_backend_stack_3')}</li>
                <li>• {t('discover.arch_backend_stack_4')}</li>
                <li>• {t('discover.arch_backend_stack_5')}</li>
              </ul>
            </ArchCard>

            <ArchCard title={t('discover.security_card_title')} icon="🛡️">
              <ul className="space-y-1 text-xs text-soft-grey">
                <li>• {t('discover.arch_security_stack_1')}</li>
                <li>• {t('discover.arch_security_stack_2')}</li>
                <li>• {t('discover.arch_security_stack_3')}</li>
                <li>• {t('discover.arch_security_stack_4')}</li>
                <li>• {t('discover.arch_security_stack_5')}</li>
              </ul>
            </ArchCard>
          </div>

          {/* Vite Security Section */}
          <div className="bg-dark-matter-lighter p-6 rounded-lg mb-6">
            <h4 className="text-sm font-bold text-pure-white mb-3">🛡️ {t('discover.vite_section_title')}</h4>
            <p className="text-soft-grey text-xs mb-4">{t('discover.vite_section_desc')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-dark-matter p-3 rounded">
                <h5 className="text-xs font-bold text-green-400 mb-2">✓ {t('discover.vite_good_title')}</h5>
                <ul className="text-xs text-soft-grey space-y-1">
                  <li>• {t('discover.vite_good_bullet_1')}</li>
                  <li>• {t('discover.vite_good_bullet_2')}</li>
                  <li>• {t('discover.vite_good_bullet_3')}</li>
                  <li>• {t('discover.vite_good_bullet_4')}</li>
                </ul>
              </div>
              <div className="bg-dark-matter p-3 rounded">
                <h5 className="text-xs font-bold text-red-400 mb-2">✗ {t('discover.vite_bad_title')}</h5>
                <ul className="text-xs text-soft-grey space-y-1">
                  <li>• <strong>{t('discover.vite_bad_bullet_1_strong')}</strong> : {t('discover.vite_bad_bullet_1')}</li>
                  <li>• {t('discover.vite_bad_bullet_2')}</li>
                  <li>• {t('discover.vite_bad_bullet_3')}</li>
                  <li>• {t('discover.vite_bad_bullet_4')}</li>
                </ul>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-magenta-trust">
              <span>💡</span>
              <span>{t('discover.vite_auth_note')}</span>
            </div>
          </div>

          <div className="bg-dark-matter-lighter p-6 rounded-lg">
            <h4 className="text-sm font-bold text-pure-white mb-3">📊 {t('discover.compare_title')}</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-soft-grey border-b border-dark-matter-lighter">
                    <th className="pb-2">{t('discover.compare_header_feature')}</th>
                    <th className="pb-2">{t('discover.compare_header_whatsapp')}</th>
                    <th className="pb-2">{t('discover.compare_header_signal')}</th>
                    <th className="pb-2 text-quantum-cyan">{t('discover.compare_header_cipher')}</th>
                  </tr>
                </thead>
                <tbody className="text-soft-grey">
                  <tr className="border-b border-dark-matter-light">
                    <td className="py-2">{t('discover.compare_row_e2ee')}</td>
                    <td>✅</td>
                    <td>✅</td>
                    <td className="text-quantum-cyan">✅</td>
                  </tr>
                  <tr className="border-b border-dark-matter-light">
                    <td className="py-2">{t('discover.compare_row_zero_knowledge')}</td>
                    <td>❌</td>
                    <td>✅</td>
                    <td className="text-quantum-cyan">✅</td>
                  </tr>
                  <tr className="border-b border-dark-matter-light">
                    <td className="py-2">{t('discover.compare_row_dicekey')}</td>
                    <td>❌</td>
                    <td>❌</td>
                    <td className="text-quantum-cyan">✅</td>
                  </tr>
                  <tr className="border-b border-dark-matter-light">
                    <td className="py-2">{t('discover.compare_row_burn')}</td>
                    <td>❌</td>
                    <td>✅</td>
                    <td className="text-quantum-cyan">✅</td>
                  </tr>
                  <tr className="border-b border-dark-matter-light">
                    <td className="py-2">{t('discover.compare_row_timelock')}</td>
                    <td>❌</td>
                    <td>❌</td>
                    <td className="text-quantum-cyan">✅</td>
                  </tr>
                  <tr className="border-b border-dark-matter-light">
                    <td className="py-2">{t('discover.compare_row_open_source')}</td>
                    <td>❌</td>
                    <td>✅</td>
                    <td className="text-quantum-cyan">✅</td>
                  </tr>
                  <tr>
                    <td className="py-2">{t('discover.compare_row_immune_cve')}</td>
                    <td>N/A</td>
                    <td>N/A</td>
                    <td className="text-quantum-cyan">{t('discover.compare_value_immune_cve')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="text-center"
        >
          <h3 className="text-2xl font-bold mb-4 text-pure-white">
            {t('discover.cta_title')}
          </h3>
          
          <div className="flex gap-4 justify-center">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/signup')}
              className="btn btn-primary"
            >
              {t('discover.cta_signup')}
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/login')}
              className="btn btn-ghost"
            >
              {t('discover.cta_login')}
            </motion.button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// Helper Components
function TechCard({
  icon,
  title,
  delay,
  children,
}: {
  icon: string;
  title: string;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="text-4xl">{icon}</div>
        <h3 className="text-xl font-bold text-pure-white">{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

function ArchCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-dark-matter-lighter p-4 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{icon}</span>
        <h4 className="text-sm font-bold text-pure-white">{title}</h4>
      </div>
      {children}
    </div>
  );
}
