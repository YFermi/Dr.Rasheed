# باني الأفكار | Idea Builder

بيئة عمل بحثية لتنظيم وتصدير الأفكار المستخرجة من جلسات العصف الذهني، مستوحاة من واجهة COMSOL Model Builder.

A research workspace for organizing and exporting ideas extracted from brainstorming sessions, inspired by the COMSOL Model Builder interface.

## Features / الميزات

- 🌳 Idea tree with drag-and-drop (شجرة أفكار تفاعلية)
- 🔗 Cross-branch linking (تشابكات بين الأفكار)
- 📄 Live Word preview (معاينة مستند حية)
- 📚 Blog corpus search — Dr. Rasheed Al-Jarrah's articles (بحث في مقالات المدونة)
- 📖 Quranic verse indexing, cross-referenced with the blog (فهرسة الآيات وربطها بالمدونة)
- 📊 Statistics dashboard (لوحة إحصائيات)
- 📥 Script import with AI — Gemini (استيراد بالذكاء الاصطناعي)
- ✍️ AI article drafting in Dr. Rasheed's style — Gemini (كتابة المقالات بأسلوب د. رشيد)
- 📤 Word/PDF export, with blog citations as footnotes (تصدير مع حواشي المراجع)

The project tree is saved in the browser (`localStorage`). Use the tree's JSON export to back it up or move it to another machine.

تُحفظ شجرة المشروع في المتصفح (`localStorage`)؛ استخدم تصدير JSON لأخذ نسخة احتياطية أو نقلها إلى جهاز آخر.

## Setup / التثبيت

### Prerequisites / المتطلبات

- Node.js 18+
- npm or bun

### Install / التثبيت

```bash
git clone https://github.com/YOUR_USERNAME/idea-builder.git
cd idea-builder
npm install
```

### Blog Corpus / مدونة المقالات

The `.docx` sources are **not** in git (too large). Only the generated `public/blog/blog.json` is committed, and it is what the deployed app reads.

ملفات Word **لا تُرفع** إلى GitHub؛ يُرفع فقط الملف المولَّد `public/blog/blog.json` الذي يقرؤه التطبيق.

1. Place the `.docx` files in `content/blog/قصة لوط/`
   ضع ملفات Word في `content/blog/قصة لوط/`
2. Run / شغّل: `npm run blog`
3. Check the summary it prints (articles, paragraphs, verses), then commit `public/blog/blog.json`
   راجع الملخص المطبوع ثم ارفع `public/blog/blog.json`

If the folder is empty, `npm run blog` keeps the existing `blog.json` instead of overwriting it.

The articles cite verses with a Quran font whose glyphs are not readable text. `npm run blog` replaces each cited verse with the canonical text of its reference `[سورة: آية]` from the [Tanzil Project](https://tanzil.net) (see `data/quran/README.md`), and prints a summary listing any verse it could not replace.

تُستبدل رموز خط المصحف في الآيات بالنص القرآني من [مشروع تنزيل](https://tanzil.net) اعتماداً على المرجع `[سورة: آية]`، ويطبع الأمر قائمة بالآيات التي تعذّر استبدالها.

### Local Development / التشغيل المحلي

```bash
# Option 1: Express server (full features including AI)
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY
npm run dev            # http://localhost:3000

# Option 2: Vercel-like environment (requires: npm i -g vercel)
npm run dev:vercel
```

The AI features use Google Gemini through its REST API (`gemini-3.8-flash` by default; set `GEMINI_MODEL` to change it). The key can come from the server (`GEMINI_API_KEY`) or be entered by each user in the app (🔑 button in the navbar), stored only in that browser. Get a free key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey). Without any key, everything works except the AI features: script import falls back to local suggestions and article writing is disabled.

تعمل ميزات الذكاء الاصطناعي بنموذج Gemini من Google. يُؤخذ المفتاح من الخادم (`GEMINI_API_KEY`) أو يدخله المستخدم من زر 🔑 في الشريط العلوي فيُحفظ في متصفحه فقط. المفتاح مجاني من [Google AI Studio](https://aistudio.google.com/app/apikey). بدون مفتاح تعمل كل الميزات ما عدا ميزات الذكاء الاصطناعي.

### Scripts / الأوامر

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server (Express + Vite, `server.ts`) |
| `npm run dev:vercel` | Local Vercel emulation (`vercel dev`) |
| `npm run blog` | Convert `.docx` → `public/blog/blog.json` (run manually before committing) |
| `npm run build` | Production build (blog + examples + `vite build` → `dist/`) |
| `npm run preview` | Preview the production build |
| `npm run lint` | Type-check (`tsc --noEmit`) |

### Deploy to Vercel / النشر على Vercel

1. Push to GitHub / ارفع المشروع إلى GitHub
2. Import the repo in the Vercel dashboard / استورد المستودع في لوحة Vercel
3. Optional: add `GEMINI_API_KEY` in **Settings → Environment Variables** (otherwise each user enters a key in the app)
   اختياري: أضف `GEMINI_API_KEY` من **Settings → Environment Variables** (وإلا يدخل كل مستخدم مفتاحه في التطبيق)
4. Deploy / انشر

Build settings and function limits come from `vercel.json`. The AI endpoints run as serverless functions under `api/`; `server.ts` is for local development only.

إعدادات البناء وحدود الدوال موجودة في `vercel.json`. نقاط الذكاء الاصطناعي تعمل كدوال في مجلد `api/`، أما `server.ts` فللتشغيل المحلي فقط.

## Project Structure / بنية المشروع

```text
api/extract-ideas.ts     Serverless function: idea extraction (Gemini)
api/article/*.ts         Serverless functions: article outline / section / stitch (Gemini)
api/key-check.ts         Serverless function: API key status and test
api/_lib/gemini.ts       Gemini REST API calls (fetch), key resolution
server.ts                Local dev server (mounts the same handler)
content/blog/قصة لوط/    .docx sources (git-ignored)
scripts/build-blog.ts    .docx → blog.json converter (mammoth)
public/blog/blog.json    Generated blog corpus (committed)
src/
  components/            Tree, middle-column tabs, Word preview, blog reader
  store/                 Zustand stores (useIdeaStore, useBlogStore)
  utils/                 Arabic search, blog links, Word export
```

## Tech Stack

React 19 · TypeScript · Vite 8 · Tailwind 4 · Zustand 5 · react-arborist · mammoth · docx · Google Gemini API

Quran text: [Tanzil Project](https://tanzil.net) (CC BY 3.0, verbatim).
