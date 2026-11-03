import React, { useEffect, useRef, useState } from 'react';
import { Type } from 'lucide-react';
import {
  useUIStore,
  UI_FONTS,
  UIFontFamily,
  UI_FONT_SIZE_DEFAULT,
  UI_FONT_SIZE_MAX,
  UI_FONT_SIZE_MIN,
} from '../store/useUIStore';

// Navbar menu: interface font size (A- / A+) and Arabic font. The A4 sheets keep theirs.
export const UIPreferencesMenu: React.FC = () => {
  const { uiFontSize, uiFontFamily, increaseFont, decreaseFont, resetFont, setFontFamily } = useUIStore();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Fixed position under the button: the navbar scrolls sideways when crowded and would clip it
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const toggle = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 8, left: Math.max(8, rect.left) });
    setIsOpen(!isOpen);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    const close = () => setIsOpen(false);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
    };
  }, [isOpen]);

  const stepButton = 'w-9 h-8 flex items-center justify-center rounded border border-[#4a4027] bg-[#0a0a0a] hover:border-[#d4af37] hover:text-[#d4af37] disabled:opacity-40 disabled:cursor-not-allowed transition font-bold';

  return (
    <div ref={menuRef} className="relative flex-shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        title="حجم خط الواجهة ونوعه"
        aria-expanded={isOpen}
        className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition whitespace-nowrap ${
          isOpen
            ? 'bg-[#1f1d18] text-[#d4af37] border-[#d4af37]'
            : 'bg-[#0a0a0a] text-[#efe6cf] border-[#2e2817] hover:border-[#4a4027]'
        }`}
      >
        <Type className="w-3.5 h-3.5" />
        <span className="nav-secondary hidden 2xl:inline">الخط</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="إعدادات خط الواجهة"
          style={{ top: position.top, left: position.left }}
          className="fixed w-72 p-3 space-y-3 bg-[#0a0a0a] border border-[#4a4027] rounded-lg shadow-[0_8px_30px_rgba(0,0,0,0.6)] z-50 text-[#efe6cf] text-xs"
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[#c2b691]">حجم خط الواجهة</span>
              <button
                type="button"
                onClick={resetFont}
                title="الحجم الافتراضي"
                className="text-[#d4af37] hover:text-[#ecd99c] fs-10 transition"
              >
                افتراضي ({UI_FONT_SIZE_DEFAULT}%)
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={decreaseFont} disabled={uiFontSize <= UI_FONT_SIZE_MIN} title="تصغير الخط" className={stepButton}>
                A-
              </button>
              <span className="flex-1 text-center font-bold text-[#d4af37]">{uiFontSize}%</span>
              <button type="button" onClick={increaseFont} disabled={uiFontSize >= UI_FONT_SIZE_MAX} title="تكبير الخط" className={`${stepButton} text-sm`}>
                A+
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-[#c2b691] block">خط الواجهة العربي</span>
            {(Object.keys(UI_FONTS) as UIFontFamily[]).map(family => (
              <button
                key={family}
                type="button"
                onClick={() => setFontFamily(family)}
                style={{ fontFamily: UI_FONTS[family].stack }}
                className={`w-full flex items-center justify-between gap-2 whitespace-nowrap px-2.5 py-1.5 rounded border transition ${
                  uiFontFamily === family
                    ? 'border-[#d4af37] bg-[#1f1d18] text-[#d4af37]'
                    : 'border-[#2e2817] hover:border-[#4a4027]'
                }`}
              >
                <span>{UI_FONTS[family].label}</span>
                <span className="text-sm">بيت العنكبوت</span>
              </button>
            ))}
            <p className="fs-10 text-[#8a7f66] leading-relaxed">
              الحروف اللاتينية والأرقام بخط Dosis. Adobe Arabic يظهر فقط إن كان مثبتاً على الجهاز، وإلا يحل محله أميري. ورقة المقال (A4) لا تتأثر.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
