import React, { useEffect, useState } from 'react';
import { useApiKeyStore } from '../store/useApiKeyStore';
import { getApiKey, testApiKey, hasValidKeyFormat, KEY_PREFIX, MODEL_OPTIONS } from '../utils/apiKey';
import { KeyRound, Eye, EyeOff, ClipboardPaste, X, Loader2, ShieldAlert } from 'lucide-react';

type TestState = { status: 'idle' } | { status: 'testing' } | { status: 'valid'; source: string } | { status: 'invalid'; error: string };

// Google AI Studio's API keys page (free key)
const KEY_URL = 'https://aistudio.google.com/app/apikey';

export const ApiKeyModal: React.FC = () => {
  const { isModalOpen, closeModal, hasKey, maskedKey, serverHasKey, saveKey, deleteKey, model, chooseModel } = useApiKeyStore();
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [test, setTest] = useState<TestState>({ status: 'idle' });

  // Fresh state each time the modal opens
  useEffect(() => {
    if (isModalOpen) {
      setValue('');
      setVisible(false);
      setTest({ status: 'idle' });
    }
  }, [isModalOpen]);

  if (!isModalOpen) return null;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setValue(text.trim());
    } catch {
      // clipboard access denied: the user can paste with Ctrl+V
    }
  };

  const typed = value.trim();
  const formatError = typed !== '' && !hasValidKeyFormat(typed);

  const handleSave = () => {
    if (!typed || formatError) return;
    saveKey(value);
    closeModal();
  };

  const handleDelete = () => {
    if (window.confirm('هل تريد حذف مفتاح API المحفوظ في هذا المتصفح؟')) {
      deleteKey();
      setTest({ status: 'idle' });
    }
  };

  // Tests the typed key, else the saved one, else the server's own key
  const handleTest = async () => {
    setTest({ status: 'testing' });
    const result = await testApiKey(value.trim() || getApiKey());
    setTest(result.valid
      ? { status: 'valid', source: result.source === 'env' ? 'مفتاح الخادم' : 'مفتاحك' }
      : { status: 'invalid', error: result.error ?? 'المفتاح غير صالح' });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 select-none" onClick={closeModal}>
      <div
        role="dialog"
        aria-label="إعداد مفتاح API"
        className="w-full max-w-md bg-[#121212] border border-[#2e2817] rounded-xl shadow-2xl text-[#efe6cf] text-right"
        onClick={e => e.stopPropagation()}
      >
        {/* A) Header */}
        <div className="h-11 px-4 bg-[#0a0a0a] border-b border-[#2e2817] rounded-t-xl flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm text-white">
            <KeyRound className="w-4 h-4 text-amber-300" />
            <span>🔑 إعداد مفتاح API</span>
          </div>
          <button type="button" onClick={closeModal} title="إغلاق" className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          {/* B) Explanation */}
          <p className="leading-relaxed text-gray-300">
            أدخل مفتاح Gemini API (<span dir="ltr" className="font-mono">GEMINI_API_KEY</span>) لتفعيل ميزات الذكاء الاصطناعي
            (استخراج الأفكار من السكريبتات + كتابة المقالات).
            يمكنك الحصول على مفتاح مجاني من Google AI Studio:{' '}
            <a href={KEY_URL} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-[#d4af37] hover:underline select-text">
              {KEY_URL}
            </a>
          </p>

          {/* D) Status */}
          <div className={`p-2 rounded border flex items-center justify-between ${hasKey ? 'bg-emerald-950/30 border-emerald-800/60' : 'bg-amber-950/30 border-amber-800/60'}`}>
            <span className={hasKey ? 'text-emerald-300' : 'text-amber-300'}>
              {hasKey ? '✅ المفتاح محفوظ' : '⚠️ لم يتم إدخال مفتاح'}
            </span>
            {hasKey && <span dir="ltr" className="font-mono fs-11 text-gray-300">{maskedKey}</span>}
          </div>
          {!hasKey && serverHasKey && (
            <p className="fs-10.5 text-gray-400">الخادم مزوّد بمفتاح خاص، فالميزات تعمل الآن؛ مفتاحك — إن أدخلته — يُستعمل بدلاً منه.</p>
          )}

          {/* C) Input */}
          <div className="space-y-1">
            <label className="fs-11 text-gray-300 block">{hasKey ? 'استبدال المفتاح:' : 'المفتاح:'}</label>
            <div className={`flex items-center gap-1 bg-[#0a0a0a] border rounded px-2 py-1 ${formatError ? 'border-rose-500' : 'border-[#2e2817] focus-within:border-amber-500/60'}`}>
              <input
                type={visible ? 'text' : 'password'}
                dir="ltr"
                value={value}
                onChange={e => { setValue(e.target.value); setTest({ status: 'idle' }); }}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="AIza..."
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-transparent text-white font-mono text-xs focus:outline-none select-text"
              />
              <button type="button" onClick={() => setVisible(!visible)} title={visible ? 'إخفاء' : 'إظهار'} className="p-1 text-gray-400 hover:text-white">
                {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button type="button" onClick={handlePaste} title="لصق" className="p-1 text-gray-400 hover:text-white">
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
            </div>
            <p role={formatError ? 'alert' : undefined} className={`fs-10.5 ${formatError ? 'text-rose-400 font-semibold' : 'text-gray-500'}`}>
              {formatError ? '⚠️ ' : ''}المفتاح يجب أن يبدأ بـ <span dir="ltr" className="font-mono">{KEY_PREFIX}</span>
            </p>
          </div>

          {/* Model: applies at once, kept in this browser */}
          <div className="space-y-1">
            <label className="fs-11 text-gray-300 block">الموديل:</label>
            <select
              value={model}
              onChange={e => { chooseModel(e.target.value); setTest({ status: 'idle' }); }}
              className="w-full bg-[#0a0a0a] border border-[#2e2817] rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-500/60"
            >
              {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <p className="fs-10.5 text-gray-500">
              لكل ميزات الذكاء الاصطناعي. الأقوى أجود كتابةً لكنه أبطأ وأغلى؛ «اختبار الاتصال» يختبر المفتاح مع الموديل المختار.
            </p>
          </div>

          {/* F) Test */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={test.status === 'testing' || formatError || (!typed && !hasKey && !serverHasKey)}
              className="px-2.5 py-1 bg-[#2e2817] hover:bg-[#4a4027] disabled:opacity-40 text-white rounded fs-11 transition"
            >
              🧪 اختبار الاتصال
            </button>
            {test.status === 'testing' && (
              <span className="flex items-center gap-1 text-gray-300"><Loader2 className="w-3.5 h-3.5 animate-spin" /> ⏳ جاري الاختبار...</span>
            )}
            {test.status === 'valid' && <span className="text-emerald-400">✅ المفتاح صالح ({test.source})</span>}
            {test.status === 'invalid' && <span className="text-rose-400">❌ {test.error === 'المفتاح غير صالح' ? 'المفتاح غير صالح' : `تعذر الاختبار: ${test.error}`}</span>}
          </div>

          {/* Security note */}
          <p className="flex items-start gap-1.5 fs-10.5 text-amber-200/80 leading-relaxed">
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>⚠️ المفتاح محفوظ في متصفحك فقط. لا تشاركه مع الآخرين.</span>
          </p>
        </div>

        {/* E) Buttons */}
        <div className="px-4 py-3 bg-[#0a0a0a] border-t border-[#2e2817] rounded-b-xl flex items-center justify-between">
          <button
            type="button"
            onClick={handleDelete}
            disabled={!hasKey}
            className="px-2.5 py-1.5 text-rose-400 hover:text-rose-300 disabled:opacity-30 text-xs"
          >
            🗑 حذف
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={closeModal} className="px-3 py-1.5 text-gray-400 hover:text-white text-xs">
              ❌ إلغاء
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!typed || formatError}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded text-xs font-semibold transition"
            >
              💾 حفظ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
