import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import { fetchWithRefresh } from '../services/api-interceptor';
import TrustStarWidget from '../components/TrustStarWidget';

interface RecoveryLocationState {
  reason?: string;
  username?: string;
}

export default function Recovery() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const state = (location.state as RecoveryLocationState | null) || null;

  const [isMarkingLost, setIsMarkingLost] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const [markSuccess, setMarkSuccess] = useState(false);

  const reasonText = state?.reason === 'MISSING_MASTER_KEY'
    ? t('recovery.reason_missing_key')
    : t('recovery.reason_default');

  const handleMarkKeyLost = async () => {
    const confirmed = window.confirm(t('recovery.confirm_mark_lost'));
    if (!confirmed) return;

    setIsMarkingLost(true);
    setMarkError(null);

    try {
      const res = await fetchWithRefresh(
        `${API_BASE_URL}/api/v1/recovery/mark-key-lost`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'user_confirmed_primary_key_destroyed' }),
        },
      );

      if (!res.ok) {
        const payload = await res
          .json()
          .catch(() => ({ error: { message: t('recovery.error_unknown') } }));
        throw new Error(payload.error?.message || t('recovery.error_cannot_mark'));
      }

      setMarkSuccess(true);
      // Force Trust-Star to recompute in RECOVERY context
      await queryClient.invalidateQueries({ queryKey: ['trust-star', 'RECOVERY'] });
    } catch (err: any) {
      setMarkError(err.message || t('recovery.error_marking'));
    } finally {
      setIsMarkingLost(false);
    }
  };

  return (
    <div className="dark-matter-bg min-h-screen flex items-center justify-center p-6">
      <div className="max-w-4xl w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">
              {t('recovery.title')}
            </h1>
            <p className="text-sm text-slate-300 max-w-xl">
              {reasonText}{' '}
              {t('recovery.analyze_options')}
            </p>
          </div>
          <button
            onClick={() => navigate('/login')}
            className="text-xs px-3 py-1 rounded-lg border border-slate-700 text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-colors"
          >
            {t('recovery.back_to_login')}
          </button>
        </div>

        {/* Trust-Star in RECOVERY context */}
        <TrustStarWidget context="RECOVERY" />

        {/* Mark key as LOST (irreversible) */}
        <div className="glass-panel rounded-2xl p-4 border border-red-700/70 bg-red-900/20 space-y-3">
          <div className="flex items-start gap-3">
            <div className="text-2xl">⚠️</div>
            <div className="space-y-1 text-xs text-red-100">
              <h2 className="font-semibold text-red-200 text-sm">
                {t('recovery.mark_key_lost')}
              </h2>
              <p>
                {t('recovery.mark_lost_desc_1')}
              </p>
              <p>
                {t('recovery.mark_lost_desc_2')}
              </p>
            </div>
          </div>

          {markError && (
            <div className="p-2 rounded bg-red-950/80 border border-red-500/40 text-[11px] text-red-200">
              {markError}
            </div>
          )}

          {markSuccess && (
            <div className="p-2 rounded bg-green-900/40 border border-green-500/40 text-[11px] text-green-200">
              {t('recovery.mark_success')}
            </div>
          )}

          <button
            type="button"
            onClick={handleMarkKeyLost}
            disabled={isMarkingLost || markSuccess}
            className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold border border-red-500/70 text-red-50 bg-red-700/80 hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {isMarkingLost ? t('recovery.marking_in_progress') : t('recovery.mark_key_lost_button')}
          </button>
        </div>

        {/* Recovery actions helper */}
        <div className="glass-panel rounded-2xl p-4 border border-slate-800 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="text-xs text-slate-300 max-w-xl">
            <p className="font-semibold mb-1 text-slate-100">
              {t('recovery.restore_from_backup')}
            </p>
            <p>
              {t('recovery.restore_desc')}
            </p>
          </div>
          <button
            onClick={() => navigate('/settings?tab=backup')}
            className="btn-primary text-xs px-4 py-2"
          >
            {t('recovery.open_backup_import')}
          </button>
        </div>
      </div>
    </div>
  );
}

