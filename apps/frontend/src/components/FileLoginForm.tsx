import { useState } from 'react';
import { motion } from 'framer-motion';
import { TFunction } from 'i18next'; // Import TFunction

function FileLoginForm({
  onSubmit,
  onBack,
  error,
  loading,
  t,
}: {
  onSubmit: (file: File) => void;
  onBack: () => void;
  error: string;
  loading: boolean;
  t: TFunction;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    } else {
      setFile(null); // Clear file if no file selected (e.g., user cancels file dialog)
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.blend')) {
        setFile(droppedFile);
      } else {
        // Optionally provide feedback for invalid file type
        console.warn('Only .blend files are accepted.');
        setFile(null);
      }
    }
  };

  const handleClearFile = () => {
    setFile(null);
    // Reset file input value to allow re-uploading the same file if needed
    const fileInput = document.getElementById('blend-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      onSubmit(file);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex items-center justify-center min-h-screen p-8"
    >
      <div className="max-w-xl w-full">
        <div className="text-center mb-8">
          <h2
            className="text-4xl font-black mb-3 glow-text-cyan"
            style={{ color: 'var(--neon-purple)' }}
          >
            {t('auth.file_login') || 'Login with Key File'}
          </h2>
          <p className="text-soft-grey">
            {t('auth.upload_key_file') || 'Upload your .blend avatar file'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="glass-card p-8 mb-6">
            <div className="mb-6">
              <label className="block mb-2 text-sm font-semibold text-pure-white">
                {t('auth.key_file') || 'Key File (.blend)'}
              </label>
              <div
                className={`flex flex-col items-center justify-center w-full min-h-[120px] border-2 rounded-lg cursor-pointer
                  ${isDragging ? 'border-quantum-cyan bg-white/5' :
                    file ? 'border-green-500/50 bg-green-900/20' :
                    'border-gray-600 hover:border-gray-500 hover:bg-white/5'}
                `}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <label
                  htmlFor="blend-file-input"
                  className="flex flex-col items-center justify-center w-full h-full p-4"
                >
                  {file ? (
                    <div className="flex items-center gap-2 text-green-300">
                      <span className="text-2xl">✅</span>
                      <span className="text-lg font-semibold truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={handleClearFile}
                        className="text-red-400 hover:text-red-300 text-sm ml-2"
                        aria-label="Clear selected file"
                      >
                        {t('common.clear')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="text-4xl mb-2 text-soft-grey">🧊</div>
                      <p className="mb-2 text-sm text-gray-400">
                        <span className="font-semibold">{t('auth.click_to_upload') || 'Click to upload'}</span>
                        {' '}{t('common.or')} {' '}
                        <span className="font-semibold">{t('common.drag_and_drop') || 'drag and drop'}</span>
                      </p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        .blend files only
                      </p>
                    </>
                  )}
                  <input
                    id="blend-file-input"
                    type="file"
                    className="hidden"
                    accept=".blend"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                </label>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-4 bg-error-glow/10 border border-error-glow/30 rounded-lg"
                role="alert"
                aria-live="polite"
              >
                <p className="text-sm text-error-glow font-semibold mb-2">⚠️ {error}</p>
              </motion.div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onBack}
              disabled={loading}
              className="btn btn-ghost flex-1"
            >
              ← {t('common.back')}
            </motion.button>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              disabled={!file || loading}
              className="btn btn-primary flex-1"
            >
              {loading ? t('auth.connecting') : `${t('auth.login_button')} 🔐`}
            </motion.button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}

export default FileLoginForm;
