import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { authFetchV2WithRefresh } from "../services/api-interceptor";
import { setTemporaryMasterKey } from "../lib/secureKeyAccess";
import { useTranslation } from "react-i18next";
import { mnemonicToMasterKey } from "../services/api-v2";
import { decodeMnemonicToHex } from "../lib/diceKey";
import { LanguageSwitcher } from "../components/LanguageSwitcher";

function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [username, setUsername] = useState("");
  const [method, setMethod] = useState<"mnemonic" | "dicekey">("mnemonic");
  const [mnemonic, setMnemonic] = useState("");
  const [diceKeyInput, setDiceKeyInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      let masterKeyHex: string;

      if (method === "mnemonic") {
        if (!mnemonic.trim()) {
          setError(t('enter_mnemonic') || "Veuillez entrer votre phrase mnémonique");
          setLoading(false);
          return;
        }
        const words = mnemonic.trim().split(/\s+/);
        if (words.length !== 12 && words.length !== 24) {
          setError(t('mnemonic_error') || "La phrase mnémonique doit contenir 12 ou 24 mots");
          setLoading(false);
          return;
        }
        // Pour BIP-39 mnemonic (standard setup)
        const mnemonicString = words.join(" ");
        masterKeyHex = await mnemonicToMasterKey(mnemonicString);
      } else {
        // DiceKey method - phrase mnémonique Dice-Key
        if (!diceKeyInput.trim()) {
          setError(t('enter_dicekey_phrase') || "Veuillez entrer votre phrase mnémonique DiceKey");
          setLoading(false);
          return;
        }
        // Decode la phrase mnémonique DiceKey en hex
        masterKeyHex = decodeMnemonicToHex(diceKeyInput.trim());
      }

      // Authenticate with the backend
      const response = await authFetchV2WithRefresh<{
        user: { id: string; username: string; securityTier: 'standard' | 'dice-key' };
        accessToken: string;
        refreshToken: string;
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, masterKeyHex }),
      });
      
      // Store session
      await setTemporaryMasterKey(masterKeyHex);
      setSession({
        user: response.user,
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      
      navigate("/conversations");
    } catch (err: any) {
      setError(err instanceof Error ? err.message : (t('login_error') || "Une erreur est survenue lors de la connexion"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center">
      <DecorativeBackground />
      
      {/* Language Switcher - Top Right */}
      <div className="absolute top-6 right-6 z-20">
        <LanguageSwitcher />
      </div>
      
      <div className="relative z-10 w-full max-w-md px-6">
        <div className="glass-panel rounded-2xl p-8 space-y-6">
          <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-200 mb-2 text-center">
            {t('login')} – Cipher Pulse
          </h1>
            <p className="text-slate-400 text-sm">
              {t('login_secure')}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-2">
                {t('username')}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="input-field w-full"
                placeholder={t('your_username')}
                required
                autoComplete="username"
              />
            </div>

            {/* Authentication Method */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                {t('auth_method')}
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMethod("mnemonic")}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    method === "mnemonic"
                      ? "bg-brand-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {t('mnemonic_phrase')}
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("dicekey")}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
                    method === "dicekey"
                      ? "bg-brand-600 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {t('dicekey')}
                </button>
              </div>
            </div>

            {/* Mnemonic Input */}
            {method === "mnemonic" && (
              <div>
                <label htmlFor="mnemonic" className="block text-sm font-medium text-slate-300 mb-2">
                  {t('mnemonic_12_24')}
                </label>
                <textarea
                  id="mnemonic"
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  className="input-field w-full min-h-[100px] resize-none"
                  placeholder={t('enter_words')}
                  required
                  autoComplete="off"
                />
              </div>
            )}

            {/* DiceKey Input */}
            {method === "dicekey" && (
              <div>
                <label htmlFor="dicekey" className="block text-sm font-medium text-slate-300 mb-2">
                  {t('dicekey_6_words')}
                </label>
                <textarea
                  id="dicekey"
                  value={diceKeyInput}
                  onChange={(e) => setDiceKeyInput(e.target.value)}
                  className="input-field w-full min-h-[100px] resize-none"
                  placeholder={t('enter_dicekey')}
                  required
                  autoComplete="off"
                />
                <p className="text-xs text-slate-500 mt-1">
                  {t('dicekey_hint')}
                </p>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm"
                role="alert"
                aria-live="polite"
              >
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? t('logging_in') : t('login_button')}
            </button>
          </form>

          {/* Footer Links */}
          <div className="text-center space-y-2 text-sm">
            <p className="text-slate-400">
              {t('no_account')}{" "}
              <Link to="/signup" className="text-brand-400 hover:text-brand-300 font-medium">
                {t('create_account')}
              </Link>
            </p>
            <Link to="/" className="text-slate-500 hover:text-slate-400 block">
              {t('back_home')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function DecorativeBackground() {
  return (
    <div aria-hidden className="absolute inset-0">
      <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-brand-700/30 blur-3xl animate-float" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-indigo-700/30 blur-3xl animate-float" style={{ animationDelay: '1.2s' }} />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" />
    </div>
  );
}

export default Login;
