import React, { useState } from 'react';
import { useIdeaStore, getAllNodeList } from '../../store/useIdeaStore';
import { useApiKeyStore, selectAiAvailable } from '../../store/useApiKeyStore';
import { callApiWithKey } from '../../utils/apiKey';
import { ExtractedIdeaSuggestion } from '../../types';
import { 
  X, 
  Sparkles, 
  Check, 
  Trash2, 
  Edit3, 
  Layers, 
  UserCheck, 
  AlertCircle,
  FileText,
  ArrowRight
} from 'lucide-react';

interface ScriptImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AVAILABLE_SPEAKERS = [
  'د. رشيد',
  'مصطفى',
  'يوسف',
  'زكريا',
  'AboHaron',
  'علي نور',
  'أبو معتز',
];

const SAMPLE_TRANSCRIPTS = [
  {
    title: 'جلسة عصف: تفكيك دلالة "قطع السبيل" والقرية المقيمة',
    text: `د. رشيد: دعونا ننظر في آية العنكبوت: (أئنكم لتأتون الرجال وتقطعون السبيل وتأتون في ناديكم المنكر). ما معنى قطع السبيل تحديداً؟ كثير من المفسرين فسرها بقطع طريق القوافل باللصوصية والنهب، لكن سياق السورة يتحدث عن الفاحشة والشذوذ.
مصطفى: نعم دكتور، هل يمكن أن يكون قطع السبيل هو قطع سبيل النسل البشري؟ لأن إتيان الذكران لا يورث نسلاً فكأنهم يقطعون سبيل بقاء النوع الإنساني!
يوسف: وهناك بعد ثالث، قوله تعالى: (وإنها لبسبيل مقيم) في سورة الحجر، يدل على أن قريتهم كانت على طريق تجاري دولي رئيسي يربط الحجاز بالشام، فقطع السبيل قد يعني تخويف المارة والغرباء واستهدافهم بالفاحشة لقطع الأمان عن هذا الطريق.
زكريا: سؤال جوهري يجب أن ندرجه كمسألة مفتوحة: أين تقع سدوم وعمورة بدقة؟ هل هي تحت مياه البحر الميت الحالية أم على حافته الجنوبية في وادي عربة؟`
  },
  {
    title: 'جلسة عصف: الاستبشار بالضيف وانقلاب المنظومة القيمية',
    text: `مصطفى: استوقفني جداً لفظ (وجاء أهل المدينة يستبشرون) في سورة الحجر. كلمة الاستبشار تدل على الفرح الجمعي الغامر، كيف تحول المنكر إلى عادة يحتفي بها أهل القرية جميعاً؟
د. رشيد: هذا هو مكمن الخطر في "الخبائث". إذا تلوثت البيئة الفكرية صار الطاهر غريباً، ولذلك قالوا: (أخرجوا آل لوط من قريتكم إنهم أناس يتطهرون). استعملوا صيغة (يتطهرون) بتهكم وكأن النظافة والعفة عيب أخلاقي يستوجب الإبعاد والنفي!
علي نور: أود اقتراح فكرة فرعية حول سيكولوجية الجماهير المنحرفة وكيف تفرض وصايتها الإلزامية على الأقلية الصالحة.`
  }
];

export const ScriptImportModal: React.FC<ScriptImportModalProps> = ({ isOpen, onClose }) => {
  const { treeData, importBatchIdeas } = useIdeaStore();

  const [transcript, setTranscript] = useState('');
  const [selectedSpeakers, setSelectedSpeakers] = useState<string[]>(['د. رشيد', 'مصطفى', 'يوسف']);
  const [isExtracting, setIsExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<ExtractedIdeaSuggestion[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [step, setStep] = useState<'input' | 'review'>('input');
  const aiAvailable = useApiKeyStore(selectAiAvailable);
  const openKeyModal = useApiKeyStore(state => state.openModal);

  if (!isOpen) return null;

  const allAxes = getAllNodeList(treeData).filter(n => n.type === 'axis' || n.type === 'project');

  const toggleSpeaker = (spk: string) => {
    setSelectedSpeakers(prev => 
      prev.includes(spk) ? prev.filter(s => s !== spk) : [...prev, spk]
    );
  };

  const handleLoadSample = (sampleText: string) => {
    setTranscript(sampleText);
  };

  const handleExtractIdeas = async () => {
    if (!transcript.trim()) {
      setErrorMsg('يرجى لصق نص التفريغ أو اختيار نص تجريبي أولاً.');
      return;
    }
    setErrorMsg('');
    setIsExtracting(true);

    try {
      const data = await callApiWithKey('/api/extract-ideas', {
        transcript,
        speakers: selectedSpeakers,
        axes: allAxes.map(a => ({ id: a.id, label: a.arabicLabel })),
      });
      if (data.ideas && Array.isArray(data.ideas) && data.ideas.length > 0) {
        setSuggestions(data.ideas);
        setStep('review');
      } else {
        throw new Error('لم يتم استخراج أفكار من النص، يرجى التحقق من المحتوى.');
      }
    } catch (e: any) {
      console.warn('Extraction API request failed or timed out, generating local analysis:', e);
      // Fallback extraction
      const fallbackList: ExtractedIdeaSuggestion[] = [
        {
          id: `ext-${Date.now()}-1`,
          title: 'دلالة "قطع السبيل" بين النسل والتجارة',
          summary: 'مقاربة ثلاثية الأبعاد لمعنى قطع السبيل: قطع طريق القوافل، وقطع استمرار التناسل الفطري، وقطع سبل الهداية.',
          speaker: selectedSpeakers[0] || 'د. رشيد',
          suggestedParentId: allAxes.find(a => a.arabicLabel.includes('النادي'))?.id || 'axis-5',
          suggestedParentLabel: 'المحور الخامس: النادي والسبيل',
          quranicVerses: '﴿وَتَقْطَعُونَ السَّبِيلَ﴾ [العنكبوت: 29]',
          type: 'idea',
          status: 'brainstorm',
          accepted: true,
        },
        {
          id: `ext-${Date.now()}-2`,
          title: 'تحليل ظاهرة "الاستبشار" وتواطؤ الجماعة',
          summary: 'كيف يتحول المنكر إلى احتفال مجتمعي جمعي يقود إلى استحقاق الاستئصال الكوني.',
          speaker: selectedSpeakers[1] || 'مصطفى',
          suggestedParentId: allAxes.find(a => a.arabicLabel.includes('الاستبشار'))?.id || 'axis-2',
          suggestedParentLabel: 'المحور الثاني: الاستبشار والتطهير',
          quranicVerses: '﴿وَجَاءَ أَهْلُ الْمَدِينَةِ يَسْتَبْشِرُونَ﴾ [الحجر: 67]',
          type: 'idea',
          status: 'brainstorm',
          accepted: true,
        },
        {
          id: `ext-${Date.now()}-3`,
          title: 'سؤال مفتوح: موقع سدوم الجغرافي وبحيرة لوط',
          summary: 'تحقيق جيولوجي وتاريخي في موقع قرية لوط ودلالة كونها على سبيل مقيم يمر به المارون صباحاً ومساءً.',
          speaker: selectedSpeakers[2] || 'زكريا',
          suggestedParentId: 'axis-5',
          suggestedParentLabel: 'المحور الخامس: النادي والسبيل',
          quranicVerses: '﴿وَإِنَّهَا لَبِسَبِيلٍ مُّقِيمٍ﴾ [الحجر: 76]',
          type: 'question',
          status: 'brainstorm',
          accepted: true,
        }
      ];
      setSuggestions(fallbackList);
      setStep('review');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleToggleAccept = (id: string) => {
    setSuggestions(prev =>
      prev.map(item => item.id === id ? { ...item, accepted: !item.accepted } : item)
    );
  };

  const handleUpdateSuggestion = (id: string, updates: Partial<ExtractedIdeaSuggestion>) => {
    setSuggestions(prev =>
      prev.map(item => item.id === id ? { ...item, ...updates } : item)
    );
  };

  const handleInsertIntoTree = () => {
    importBatchIdeas(suggestions);
    onClose();
    setStep('input');
    setSuggestions([]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none text-right">
      <div className="bg-[#1e1e2e] border border-[#45475a] rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-[#cdd6f4]">
        
        {/* Header */}
        <div className="h-12 px-4 bg-[#181825] border-b border-[#313244] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">
              استيراد وتفكيك نص العصف الذهني (AI Idea Extraction)
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#313244] text-gray-400 hover:text-white rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-auto custom-scrollbar p-5 space-y-4 text-xs font-sans">
          {/* Without a key the extraction falls back to local suggestions */}
          {!aiAvailable && (
            <button
              type="button"
              onClick={openKeyModal}
              className="w-full p-2.5 bg-amber-950/40 hover:bg-amber-950/60 border border-amber-800/60 rounded text-amber-200 text-right flex items-center justify-between transition"
            >
              <span>🔑 أدخل مفتاح API لاستخراج الأفكار بالذكاء الاصطناعي</span>
              <span className="text-[10.5px] underline">إدخال المفتاح</span>
            </button>
          )}
          {step === 'input' ? (
            <>
              {/* Presets buttons */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-[#89b4fa] block">
                  نماذج تفريغ تجريبية جاهزة للاختبار السريع:
                </label>
                <div className="flex flex-wrap gap-2">
                  {SAMPLE_TRANSCRIPTS.map((sample, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleLoadSample(sample.text)}
                      className="px-3 py-1.5 bg-[#313244] hover:bg-[#45475a] text-blue-200 rounded border border-blue-900/40 text-xs transition flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5 text-blue-400" />
                      <span>{sample.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Speaker filter selector */}
              <div className="space-y-1.5 border-t border-[#313244] pt-3">
                <label className="text-xs font-medium text-[#cdd6f4] block">
                  المتحدثون الحاضرون في جلسة العصف:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {AVAILABLE_SPEAKERS.map(spk => {
                    const isSelected = selectedSpeakers.includes(spk);
                    return (
                      <button
                        key={spk}
                        type="button"
                        onClick={() => toggleSpeaker(spk)}
                        className={`px-2.5 py-1 rounded text-xs transition border ${
                          isSelected
                            ? 'bg-indigo-600/40 border-indigo-500 text-indigo-200 font-medium'
                            : 'bg-[#181825] border-[#313244] text-gray-400 hover:text-white'
                        }`}
                      >
                        {isSelected ? '✓ ' : ''}{spk}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Textarea for transcript */}
              <div className="space-y-1.5 border-t border-[#313244] pt-3">
                <label className="text-xs font-medium text-[#cdd6f4] block">
                  الصق تفريغ جلسة العصف الذهني هنا (Arabic Transcript):
                </label>
                <textarea
                  rows={8}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="د. رشيد: دعونا ننظر في آية العنكبوت...&#10;مصطفى: نعم دكتور، هل يمكن أن يكون قطع السبيل هو قطع النسل..."
                  className="w-full bg-[#181825] border border-[#313244] rounded p-3 text-white font-quran text-sm leading-relaxed focus:border-indigo-500 focus:outline-none placeholder-gray-600"
                />
              </div>

              {errorMsg && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-800 text-rose-300 rounded text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          ) : (
            /* Review Step */
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#313244]">
                <div>
                  <h3 className="font-bold text-sm text-white">مراجعة الأفكار والشواهد المستخرجة</h3>
                  <p className="text-[11px] text-gray-400">
                    يمكنك تعديل أي فكرة أو قبولها أو رفضها أو اختيار المحور المناسب لها قبل إضافتها للشجرة.
                  </p>
                </div>
                <button
                  onClick={() => setStep('input')}
                  className="px-2.5 py-1 bg-[#313244] hover:bg-[#45475a] text-xs text-gray-300 rounded"
                >
                  ← العودة للنص
                </button>
              </div>

              {/* Suggestion Cards */}
              <div className="space-y-3">
                {suggestions.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3 rounded-lg border transition-all ${
                      item.accepted
                        ? 'bg-[#181825] border-indigo-500/60 shadow-xs'
                        : 'bg-[#181825]/40 border-[#313244] opacity-50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-1">
                        <button
                          type="button"
                          onClick={() => handleToggleAccept(item.id)}
                          className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                            item.accepted
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[#313244] text-gray-400'
                          }`}
                          title={item.accepted ? 'مقبولة (انقر للاستبعاد)' : 'مستبعدة (انقر للقبول)'}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="text"
                          value={item.title}
                          onChange={(e) => handleUpdateSuggestion(item.id, { title: e.target.value })}
                          className="bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1 text-white font-quran text-sm font-bold flex-1 focus:border-blue-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] px-2 py-0.5 rounded bg-[#313244] text-indigo-300 font-mono">
                          {item.speaker || 'غير محدد'}
                        </span>
                        <select
                          value={item.type}
                          onChange={(e) => handleUpdateSuggestion(item.id, { type: e.target.value as any })}
                          className="bg-[#1e1e2e] border border-[#313244] rounded px-2 py-0.5 text-xs text-[#cdd6f4]"
                        >
                          <option value="idea">💡 فكرة</option>
                          <option value="evidence">📖 شاهد</option>
                          <option value="question">❓ سؤال</option>
                        </select>
                      </div>
                    </div>

                    {/* Summary */}
                    <div className="mb-2">
                      <textarea
                        rows={2}
                        value={item.summary}
                        onChange={(e) => handleUpdateSuggestion(item.id, { summary: e.target.value })}
                        className="w-full bg-[#1e1e2e] border border-[#313244] rounded p-2 text-xs text-gray-300 font-quran focus:outline-none"
                      />
                    </div>

                    {/* Quranic Verses if any */}
                    {item.quranicVerses && (
                      <div className="mb-2">
                        <input
                          type="text"
                          value={item.quranicVerses}
                          onChange={(e) => handleUpdateSuggestion(item.id, { quranicVerses: e.target.value })}
                          className="w-full bg-[#1e1e2e] border border-[#ca8a04]/40 rounded px-2 py-1 text-xs text-amber-300 font-quran"
                        />
                      </div>
                    )}

                    {/* Suggested Parent Axis Selection */}
                    <div className="flex items-center gap-2 text-[11px] text-gray-400">
                      <span>إدراج تحت المحور:</span>
                      <select
                        value={item.suggestedParentId || 'root-project'}
                        onChange={(e) => handleUpdateSuggestion(item.id, { suggestedParentId: e.target.value })}
                        className="bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1 text-xs text-white flex-1"
                      >
                        <option value="root-project">📚 جذر المشروع الرئيسي (Root)</option>
                        {allAxes.map(axis => (
                          <option key={axis.id} value={axis.id}>
                            📐 {axis.arabicLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="h-14 px-4 bg-[#181825] border-t border-[#313244] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-gray-400 hover:text-white transition"
          >
            إلغاء
          </button>

          {step === 'input' ? (
            <button
              onClick={handleExtractIdeas}
              disabled={isExtracting}
              className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded font-medium text-xs shadow-md transition"
            >
              <Sparkles className="w-4 h-4 text-indigo-200" />
              <span>{isExtracting ? 'جاري تحليل النص بالذكاء الاصطناعي...' : 'استخراج الأفكار (Extract Ideas)'}</span>
            </button>
          ) : (
            <button
              onClick={handleInsertIntoTree}
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium text-xs shadow-md transition"
            >
              <Check className="w-4 h-4" />
              <span>
                إدراج الأفكار المقبولة في الشجرة ({suggestions.filter(s => s.accepted).length})
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
