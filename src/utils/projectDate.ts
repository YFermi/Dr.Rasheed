// The project's date in full, Hijri (Umm al-Qura) and Gregorian together:
// «الثلاثاء، 23 جمادى الأولى 1448 هـ الموافق 3 نوفمبر 2026 م»

const HIJRI = new Intl.DateTimeFormat('ar-u-ca-islamic-umalqura-nu-latn', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const GREGORIAN = new Intl.DateTimeFormat('ar-u-ca-gregory-nu-latn', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatProjectDate(date: Date = new Date()): string {
  return `${HIJRI.format(date)} الموافق ${GREGORIAN.format(date)} م`;
}
