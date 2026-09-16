import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { GeneralSettings } from "../components/settings/GeneralSettings";
import { BackupSettings } from "../components/settings/BackupSettings";
import { SecuritySettings } from "../components/settings/SecuritySettings";
import { ContributionSettings } from "../components/settings/ContributionSettings";
import { SphereSettings } from "../components/settings/SphereSettings";
import { EscrowSettings } from "../components/settings/EscrowSettings";
import { EIDOLON_CONNECT_ENABLED } from "../config";
import { isSphereClientAvailable } from "../lib/spheres";
import { isEscrowClientAvailable } from "../lib/escrow";

export function Settings() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  // The spheres tab needs the desktop runtime (Electron) and the Eidolon flag.
  const spheresEnabled = EIDOLON_CONNECT_ENABLED && isSphereClientAvailable();
  // The escrow tab too: sealed documents live on this device, sealed by the runtime.
  const escrowEnabled = EIDOLON_CONNECT_ENABLED && isEscrowClientAvailable();
  const [activeTab, setActiveTab] = useState<"general" | "backup" | "security" | "contribution" | "spheres" | "escrow">(() => {
    try {
      const params = new URLSearchParams(location.search);
      const tab = params.get('tab');
      if (tab === 'backup' || tab === 'security' || tab === 'contribution') {
        return tab;
      }
      if (tab === 'spheres' && spheresEnabled) {
        return tab;
      }
      if (tab === 'escrow' && escrowEnabled) {
        return tab;
      }
    } catch {
      // ignore and use default
    }
    return "general";
  });

  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Back Button */}
        <button
          onClick={() => navigate('/conversations')}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5 transform group-hover:-translate-x-1 transition-transform"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          <span className="font-medium">{t('settings.back_to_conversations')}</span>
        </button>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white">{t('settings.title')}</h1>
          <p className="text-slate-400 mt-2">{t('settings.description')}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-800">
          <button
            onClick={() => setActiveTab("general")}
            className={`px-4 py-2 font-medium transition-colors ${activeTab === "general"
                ? "text-brand-400 border-b-2 border-brand-400"
                : "text-slate-400 hover:text-slate-300"
              }`}
          >
            {t('settings.general')}
          </button>
          <button
            onClick={() => setActiveTab("backup")}
            className={`px-4 py-2 font-medium transition-colors ${activeTab === "backup"
                ? "text-brand-400 border-b-2 border-brand-400"
                : "text-slate-400 hover:text-slate-300"
              }`}
          >
            {t('settings.backup_export')}
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`px-4 py-2 font-medium transition-colors ${activeTab === "security"
                ? "text-brand-400 border-b-2 border-brand-400"
                : "text-slate-400 hover:text-slate-300"
              }`}
          >
            {t('settings.security')}
          </button>
          <button
            onClick={() => setActiveTab("contribution")}
            className={`px-4 py-2 font-medium transition-colors ${activeTab === "contribution"
                ? "text-brand-400 border-b-2 border-brand-400"
                : "text-slate-400 hover:text-slate-300"
              }`}
          >
            {t('settings.contribution')}
          </button>
          {spheresEnabled && (
            <button
              onClick={() => setActiveTab("spheres")}
              className={`px-4 py-2 font-medium transition-colors ${activeTab === "spheres"
                  ? "text-brand-400 border-b-2 border-brand-400"
                  : "text-slate-400 hover:text-slate-300"
                }`}
            >
              {t('settings.spheres')}
            </button>
          )}
          {escrowEnabled && (
            <button
              onClick={() => setActiveTab("escrow")}
              className={`px-4 py-2 font-medium transition-colors ${activeTab === "escrow"
                  ? "text-brand-400 border-b-2 border-brand-400"
                  : "text-slate-400 hover:text-slate-300"
                }`}
            >
              {t('settings.escrow')}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="glass-panel rounded-2xl p-6">
          {activeTab === "general" && <GeneralSettings />}
          {activeTab === "backup" && <BackupSettings />}
          {activeTab === "security" && <SecuritySettings />}
          {activeTab === "contribution" && <ContributionSettings />}
          {activeTab === "spheres" && spheresEnabled && <SphereSettings />}
          {activeTab === "escrow" && escrowEnabled && <EscrowSettings />}
        </div>
      </div>
    </div>
  );
}
