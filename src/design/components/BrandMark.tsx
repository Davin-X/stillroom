import React from "react";

/**
 * Stillroom brand mark — matches the macOS app icon
 * (sun over mountains on a purple→red gradient tile).
 */
export function BrandMark({
  size = 26,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={`brand-mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Stillroom"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="srBrandGradient"
          x1="6"
          y1="4"
          x2="58"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#5b2a9c" />
          <stop offset="0.55" stopColor="#c01f6a" />
          <stop offset="1" stopColor="#ff4a45" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="64" height="64" rx="15" fill="url(#srBrandGradient)" />
      <rect
        x="0.6"
        y="0.6"
        width="62.8"
        height="62.8"
        rx="14.4"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1.2"
      />

      {/* sun */}
      <circle cx="32.5" cy="24" r="9" fill="#ffd23f" />

      {/* mountains */}
      <path d="M12 50 L30 22 L39 33 L45 26.5 L56 50 Z" fill="#ffffff" />

      {/* viewfinder corners */}
      <path
        d="M13 9 H9 V13"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M51 55 H55 V51"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default BrandMark;
