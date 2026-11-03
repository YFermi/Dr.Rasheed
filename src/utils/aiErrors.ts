// A clear Arabic reason for a failed AI call (ScriptImportModal, ReferenceArticleModal)
export function aiErrorMessage(e: unknown, action: string): string {
  const message = e instanceof Error ? e.message : String(e);
  if (/Missing GEMINI_API_KEY|المفتاح غير صالح|صلاحية/.test(message)) {
    return 'تعذر الاتصال بالذكاء الاصطناعي. تأكد من إدخال مفتاح API صالح في الإعدادات (زر 🔑).';
  }
  if (e instanceof TypeError || /Failed to fetch|NetworkError/i.test(message)) {
    return 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.';
  }
  return `تعذر ${action}: ${message}`;
}
