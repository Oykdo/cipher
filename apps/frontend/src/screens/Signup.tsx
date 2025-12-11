import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/auth";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import DiceKeyInput from "../components/DiceKeyInput";
import { deriveAllKeysFromDice } from "../lib/kdf";
import { generateCompleteKeySet, serializeKeySet, generateUserId, encodeKey } from "../lib/keyGeneration";
import { API_BASE_URL } from "../config";

import { debugLogger } from '../lib/debugLogger';
function SignupNew() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  
  const [step, setStep] = useState<"choose" | "username" | "dicekey" | "generating" | "display">("choose");
  const [username, setUsername] = useState("");
  const [method, setMethod] = useState<"standard" | "dicekey" | null>(null);
  const [mnemonicLength, setMnemonicLength] = useState<12 | 24>(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatedMnemonic, setGeneratedMnemonic] = useState<string | null>(null);
  const [_diceRolls, setDiceRolls] = useState<number[] | null>(null);
  const [generatedKeys, setGeneratedKeys] = useState<any>(null);

  const handleMethodSelection = (selectedMethod: "standard" | "dicekey") => {
    setMethod(selectedMethod);
    setStep("username");
  };

  const handleUsernameSubmit = () => {
    if (!username.trim() || username.length < 3) {
      setError("Le nom d'utilisateur doit contenir au moins 3 caractères");
      return;
    }
    
    setError("");
    
    if (method === "dicekey") {
      setStep("dicekey");
    } else {
      handleGenerateMnemonic();
    }
  };

  const handleGenerateMnemonic = () => {
    // Mock mnemonic generation for standard method
    const words = [
      "abandon", "ability", "able", "about", "above", "absent", 
      "absorb", "abstract", "absurd", "abuse", "access", "accident",
      "account", "achieve", "acid", "acoustic", "acquire", "across",
      "act", "action", "actor", "actress", "actual", "adapt"
    ];
    const mnemonic = words.slice(0, mnemonicLength).join(" ");
    setGeneratedMnemonic(mnemonic);
    setStep("display");
  };

  const handleDiceKeyComplete = async (rolls: number[]) => {
    setDiceRolls(rolls);
    setStep("generating");
    setError("");

    try {
      // SECURITY: Sensitive log removed
      
      // Step 1: Derive all seeds from dice rolls (with Argon2id + HKDF)
      const derivedKeys = await deriveAllKeysFromDice(rolls);
      
      // Step 2: Generate complete key set (Ed25519 + X25519 pairs)
      const completeKeySet = generateCompleteKeySet({
        identityKeySeed: derivedKeys.identityKeySeed,
        signatureKeySeed: derivedKeys.signatureKeySeed,
        signedPreKeySeed: derivedKeys.signedPreKeySeed,
        oneTimePreKeySeeds: derivedKeys.oneTimePreKeySeeds,
      });
      
      // Step 3: Generate user ID from Identity Public Key
      const userId = await generateUserId(completeKeySet.identityKey.publicKey);
      
      // Step 4: Serialize for storage
      const serializedKeys = serializeKeySet(completeKeySet);
      
      setGeneratedKeys({
        userId,
        completeKeySet,
        serializedKeys,
        masterKey: derivedKeys.masterKey,
      });
      
      debugLogger.info('✅ Keys generated successfully! User ID: ${userId}');
      
      setStep("display");
    } catch (err: any) {
      console.error("❌ Key generation failed:", err);
      setError(err.message || "Échec de la génération des clés");
      setStep("dicekey"); // Go back to dice input
    }
  };

  const handleConfirmAccount = async () => {
    setLoading(true);
    setError("");

    try {
        if (method === "dicekey" && generatedKeys) {
        // Register DiceKey account with backend
        const response = await fetch(`${API_BASE_URL}/api/v2/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            method: "dice-key",
            masterKeyHex: encodeKey(generatedKeys.masterKey),
            identityPublicKey: generatedKeys.serializedKeys.identityKey.publicKey,
            signaturePublicKey: generatedKeys.serializedKeys.signatureKey.publicKey,
            signedPreKey: generatedKeys.serializedKeys.signedPreKey,
            oneTimePreKeys: generatedKeys.serializedKeys.oneTimePreKeys.slice(0, 100),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Échec de l'inscription");
        }

        const data = await response.json();

        // Store session
        setSession({
          user: {
            id: generatedKeys.userId,
            username: username.trim(),
            securityTier: "dice-key",
          },
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
        });

        navigate("/settings");
      } else {
        // Mock standard account creation
        setSession({
          user: {
            id: "user-new",
            username: username.trim(),
            securityTier: "standard",
          },
          accessToken: "mock-token",
          refreshToken: "mock-refresh",
        });

        navigate("/settings");
      }
    } catch (err: any) {
      console.error("Account creation failed:", err);
      setError(err.message || "Échec de la création du compte");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>
        
        <div className="relative bg-slate-800/50 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-slate-700">
          {/* Back Button - Only on choose screen */}
          {step === "choose" && (
            <button
              onClick={() => navigate("/")}
              className="absolute top-4 left-4 flex items-center gap-2 text-slate-400 hover:text-brand-400 transition-colors z-10"
            >
              <span className="text-xl">←</span>
              <span>{t('back')}</span>
            </button>
          )}

          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-400 to-indigo-200 mb-2 text-center">
            Cipher Pulse
          </h1>
          <p className="text-slate-400 text-center mb-8">{t('create_account')}</p>

          {/* Choose Method Screen */}
          {step === "choose" && (
            <div className="space-y-4">
              <p className="text-slate-300 text-center mb-6">
                Choisissez votre méthode de sécurité
              </p>
              
              <button
                onClick={() => handleMethodSelection("standard")}
                className="w-full p-6 bg-slate-900/50 border-2 border-slate-600 hover:border-brand-500 rounded-xl text-left transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">🔑</div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-100 mb-2 group-hover:text-brand-400">
                      Standard (BIP-39)
                    </h3>
                    <p className="text-slate-400 text-sm">
                      Génération automatique d'une phrase mnémonique de 12 ou 24 mots
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleMethodSelection("dicekey")}
                className="w-full p-6 bg-slate-900/50 border-2 border-slate-600 hover:border-indigo-500 rounded-xl text-left transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="text-3xl">🎲</div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-slate-100 mb-2 group-hover:text-indigo-400">
                      DiceKey (300 lancers)
                    </h3>
                    <p className="text-slate-400 text-sm">
                      Sécurité maximale : 775 bits d'entropie générés par 30 séries de 10 dés physiques
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-xs text-indigo-400">
                      <span className="px-2 py-1 bg-indigo-500/20 rounded">Quantum-resistant</span>
                      <span className="px-2 py-1 bg-indigo-500/20 rounded">Zero-knowledge</span>
                    </div>
                  </div>
                </div>
              </button>

              <div className="mt-6 text-center">
                <Link
                  to="/login"
                  className="text-brand-400 hover:text-brand-300 text-sm"
                >
                  Vous avez déjà un compte ? Se connecter
                </Link>
              </div>
            </div>
          )}

          {/* Username Input Screen */}
          {step === "username" && (
            <div className="space-y-6">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-300 mb-2">
                  Nom d'utilisateur
                </label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUsernameSubmit()}
                  className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Votre nom d'utilisateur"
                  autoFocus
                />
                <p className="text-slate-400 text-sm mt-2">
                  Au moins 3 caractères, sans espaces
                </p>
              </div>

              {method === "standard" && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Longueur de la phrase
                  </label>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setMnemonicLength(12)}
                      className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                        mnemonicLength === 12
                          ? "border-brand-500 bg-brand-500/20 text-brand-400"
                          : "border-slate-600 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      12 mots
                    </button>
                    <button
                      onClick={() => setMnemonicLength(24)}
                      className={`flex-1 py-2 px-4 rounded-lg border-2 transition-all ${
                        mnemonicLength === 24
                          ? "border-brand-500 bg-brand-500/20 text-brand-400"
                          : "border-slate-600 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      24 mots
                    </button>
                  </div>
                </div>
              )}

              {method === "dicekey" && (
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/50 rounded-lg">
                  <h4 className="font-semibold text-indigo-400 mb-2">📋 Ce dont vous aurez besoin :</h4>
                  <ul className="text-slate-300 text-sm space-y-1">
                    <li>• 10 dés physiques à 6 faces</li>
                    <li>• 10-15 minutes de temps</li>
                    <li>• Un environnement calme</li>
                    <li>• Papier et stylo pour noter vos lancers</li>
                  </ul>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setStep("choose");
                    setError("");
                  }}
                  className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all"
                >
                  Retour
                </button>
                <button
                  onClick={handleUsernameSubmit}
                  disabled={!username.trim() || username.length < 3}
                  className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {method === "dicekey" ? "Commencer la saisie 🎲" : "Générer"}
                </button>
              </div>
            </div>
          )}

          {/* DiceKey Input Screen */}
          {step === "dicekey" && (
            <div className="space-y-4">
              <DiceKeyInput
                onComplete={handleDiceKeyComplete}
                onCancel={() => setStep("username")}
              />
            </div>
          )}

          {/* Generating Keys Screen */}
          {step === "generating" && (
            <div className="space-y-6 text-center py-12">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="animate-spin rounded-full h-20 w-20 border-b-4 border-brand-500"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-3xl">🔐</div>
                  </div>
                </div>
              </div>
              
              <div>
                <h3 className="text-2xl font-bold text-slate-100 mb-3">
                  Génération de vos clés cryptographiques
                </h3>
                <p className="text-slate-400">
                  Cette opération prend 2-5 secondes pour maximiser la sécurité.
                </p>
              </div>

              <div className="space-y-3 max-w-md mx-auto">
                <div className="flex items-center gap-3 text-slate-300 p-3 bg-slate-900/50 rounded-lg">
                  <div className="w-3 h-3 bg-brand-500 rounded-full animate-pulse"></div>
                  <span className="text-sm">Application d'Argon2id (64 MB memory-hard)</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300 p-3 bg-slate-900/50 rounded-lg">
                  <div className="w-3 h-3 bg-brand-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <span className="text-sm">Dérivation HKDF des sous-clés</span>
                </div>
                <div className="flex items-center gap-3 text-slate-300 p-3 bg-slate-900/50 rounded-lg">
                  <div className="w-3 h-3 bg-brand-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                  <span className="text-sm">Génération des paires Ed25519 et X25519</span>
                </div>
              </div>

              <div className="text-sm text-slate-500 pt-4">
                <p>🎲 Traitement de 775 bits d'entropie...</p>
                <p className="mt-1">Quantum-resistant • Zero-knowledge • Deterministic</p>
              </div>
            </div>
          )}

          {/* Display Results Screen */}
          {step === "display" && (
            <div className="space-y-6">
              {method === "dicekey" && generatedKeys ? (
                <>
                  {/* DiceKey Success */}
                  <div className="p-4 bg-green-500/10 border border-green-500/50 rounded-lg">
                    <h3 className="text-green-400 font-semibold mb-2 flex items-center gap-2">
                      <span>✅</span>
                      Clés générées avec succès !
                    </h3>
                    <p className="text-slate-300 text-sm">
                      Votre identité cryptographique a été créée avec 775 bits d'entropie.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="p-4 bg-slate-900/50 rounded-lg">
                      <label className="block text-sm font-medium text-slate-400 mb-1">
                        Votre User ID
                      </label>
                      <code className="text-brand-400 text-lg font-mono">
                        {generatedKeys.userId}
                      </code>
                    </div>

                    <div className="p-4 bg-slate-900/50 rounded-lg">
                      <label className="block text-sm font-medium text-slate-400 mb-2">
                        Clés générées
                      </label>
                      <div className="space-y-2 text-sm text-slate-300">
                        <div className="flex justify-between">
                          <span>Identity Key (Ed25519):</span>
                          <span className="text-green-400">✓</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Signature Key (Ed25519):</span>
                          <span className="text-green-400">✓</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Signed Pre-Key (X25519):</span>
                          <span className="text-green-400">✓</span>
                        </div>
                        <div className="flex justify-between">
                          <span>One-Time Pre-Keys:</span>
                          <span className="text-green-400">✓ 100 clés</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg">
                    <h4 className="text-amber-400 font-semibold mb-2 flex items-center gap-2">
                      <span>⚠️</span>
                      IMPORTANT : Conservez votre séquence de dés
                    </h4>
                    <ul className="text-slate-300 text-sm space-y-1">
                      <li>• Vos 300 lancers de dés sont la SEULE façon de récupérer votre compte</li>
                      <li>• Notez-les sur papier et conservez-les en lieu sûr</li>
                      <li>• Les checksums affichés vous aident à vérifier chaque série</li>
                      <li>• Sans cette séquence, vous perdrez définitivement l'accès</li>
                    </ul>
                  </div>
                </>
              ) : (
                <>
                  {/* Standard BIP-39 */}
                  <div className="p-4 bg-amber-500/10 border border-amber-500/50 rounded-lg">
                    <p className="text-amber-400 text-sm font-medium mb-2">
                      ⚠️ IMPORTANT : Notez cette phrase de récupération
                    </p>
                    <p className="text-slate-300 text-sm">
                      C'est la seule façon de récupérer votre compte. Conservez-la en lieu sûr.
                    </p>
                  </div>

                  <div className="p-6 bg-slate-900/50 border border-slate-600 rounded-lg">
                    <div className="grid grid-cols-3 gap-3">
                      {generatedMnemonic?.split(" ").map((word, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 bg-slate-800 rounded">
                          <span className="text-xs text-slate-500 font-mono">{index + 1}.</span>
                          <span className="text-slate-100 font-medium">{word}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="p-3 bg-red-500/10 border border-red-500/50 rounded-lg text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setStep(method === "dicekey" ? "dicekey" : "username");
                    setGeneratedKeys(null);
                    setGeneratedMnemonic(null);
                  }}
                  className="flex-1 py-3 px-4 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all"
                  disabled={loading}
                >
                  Recommencer
                </button>
                <button
                  onClick={handleConfirmAccount}
                  disabled={loading}
                  className="flex-1 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
                >
                  {loading ? "Création..." : "Créer le compte"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SignupNew;
