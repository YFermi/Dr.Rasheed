import React, { useEffect } from 'react';
import { Joyride, EVENTS, STATUS, type EventData, type Step } from 'react-joyride';
import { useUIStore } from '../store/useUIStore';
import { useIdeaStore } from '../store/useIdeaStore';

const GOLD = '#d4af37';
const BLACK = '#0a0a0a';
const IVORY = '#efe6cf';

// Targets carry data-tour attributes (Navbar, MiddleTabPanel)
const STEPS: Step[] = [
  {
    target: '[data-tour="logo"]',
    title: 'بيت العنكبوت',
    content: 'مرحباً بك في بيت العنكبوت! منصة البحث المنهجي والتفكيك النصي لخطاب القرآن. دعنا نأخذك في جولة سريعة.',
  },
  {
    target: '[data-tour="new-project"]',
    title: 'مشروع جديد',
    content: 'ابدأ دائماً من هنا لتنظيف مساحة العمل والبدء بمشروع فارغ.',
  },
  {
    target: '[data-tour="reference"]',
    title: 'مقال مرجعي',
    content: 'ارفع هنا أحدث مقال معتمد. سيعتمده الذكاء الاصطناعي كمرجع للأسلوب وكمعرفة سابقة ليبني عليها.',
  },
  {
    target: '[data-tour="import"]',
    title: 'استيراد عصف ذهني',
    content: 'أدخل هنا تفريغ جلسة العصف الذهني الجديدة ليتم تحليلها واستخراج الأفكار منها.',
  },
  {
    target: '[data-tour="params-tab"]',
    title: 'الخصائص',
    content: 'لا تنسَ إدخال عنوان المشروع وتعديل التوطئة من هنا قبل توليد المقال.',
    // Show the project's parameters (title, foreword) under the tab
    before: async () => {
      const ideas = useIdeaStore.getState();
      ideas.selectNode(ideas.treeData.id);
      ideas.setActiveMiddleTab('params');
    },
  },
  {
    target: '[data-tour="write"]',
    title: 'كتابة المقال',
    content: 'بعد ترتيب الأفكار في الشجرة، اضغط هنا لتوليد المقال الجديد بناءً على المنهجية.',
  },
  {
    target: '[data-tour="export"]',
    title: 'تصدير Word',
    content: 'أخيراً، قم بتصدير مقالك الجاهز كملف Word بضغطة زر.',
  },
];

const LOCALE = {
  back: 'السابق',
  close: 'إغلاق',
  last: 'إنهاء الجولة',
  next: 'التالي',
  nextWithProgress: 'التالي ({current} من {total})',
  skip: 'تخطي الجولة',
};

// A tour that fails (e.g. a target's layout cannot be measured) closes itself
// instead of taking the whole app down with it
class TourErrorBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('Tutorial tour failed:', error);
    useUIStore.getState().finishTour();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

// Guided tour: opens by itself on the first visit; «مساعدة» in the navbar replays it.
// Finishing, skipping or closing it marks it completed (useUIStore, localStorage).
export const TutorialTour: React.FC = () => (
  <TourErrorBoundary>
    <Tour />
  </TourErrorBoundary>
);

const Tour: React.FC = () => {
  const { isTourRunning, tourCompleted, startTour, finishTour } = useUIStore();

  useEffect(() => {
    if (tourCompleted) return;
    // Let the panels lay out before the first spotlight
    const timer = window.setTimeout(startTour, 800);
    return () => window.clearTimeout(timer);
  }, []);

  const handleEvent = (data: EventData) => {
    if (data.type === EVENTS.TOUR_END || data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      finishTour();
    }
  };

  if (!isTourRunning) return null;

  return (
    <Joyride
      key="tour"
      steps={STEPS}
      run={isTourRunning}
      continuous
      onEvent={handleEvent}
      locale={LOCALE}
      options={{
        skipBeacon: true,
        showProgress: true,
        buttons: ['back', 'close', 'primary', 'skip'],
        closeButtonAction: 'skip',
        overlayClickAction: false,
        primaryColor: GOLD,
        backgroundColor: BLACK,
        textColor: IVORY,
        arrowColor: BLACK,
        overlayColor: 'rgba(0, 0, 0, 0.6)',
        spotlightRadius: 6,
        spotlightPadding: 6,
        zIndex: 1000,
        width: 340,
      }}
      styles={{
        tooltip: {
          direction: 'rtl',
          textAlign: 'right',
          fontFamily: 'var(--ui-font)',
          fontSize: 'calc(14px * var(--ui-scale, 1))',
          border: `1px solid ${GOLD}`,
          borderRadius: 10,
          boxShadow: '0 0 24px rgba(212, 175, 55, 0.25)',
        },
        tooltipTitle: { color: GOLD, fontWeight: 700, fontSize: 'calc(16px * var(--ui-scale, 1))', textAlign: 'right' },
        tooltipContent: { lineHeight: 1.8, padding: '12px 4px' },
        buttonPrimary: { backgroundColor: GOLD, color: BLACK, fontWeight: 700, borderRadius: 6 },
        buttonBack: { color: GOLD },
        buttonSkip: { color: '#8a7f66' },
        buttonClose: { color: GOLD },
        spotlight: { stroke: GOLD, strokeWidth: 2 } as any,
      }}
    />
  );
};
