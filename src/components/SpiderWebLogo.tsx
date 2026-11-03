import React from 'react';

// The app's mark: an eight-spoke spider web (also public/spider-web.svg, the favicon)
export const SpiderWebLogo: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" className={className} aria-hidden="true">
    <path d="M16 16L16.0 2.0 M16 16L25.9 6.1 M16 16L30.0 16.0 M16 16L25.9 25.9 M16 16L16.0 30.0 M16 16L6.1 25.9 M16 16L2.0 16.0 M16 16L6.1 6.1" />
    <path d="M16.0 12.0 L18.8 13.2 L20.0 16.0 L18.8 18.8 L16.0 20.0 L13.2 18.8 L12.0 16.0 L13.2 13.2Z M16.0 7.5 L22.0 10.0 L24.5 16.0 L22.0 22.0 L16.0 24.5 L10.0 22.0 L7.5 16.0 L10.0 10.0Z M16.0 3.0 L25.2 6.8 L29.0 16.0 L25.2 25.2 L16.0 29.0 L6.8 25.2 L3.0 16.0 L6.8 6.8Z" />
    <circle cx="16" cy="16" r="1.6" fill="currentColor" stroke="none" />
  </svg>
);
