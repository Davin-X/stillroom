import React, { useId } from "react";

/** Small standalone color-iris mark matching Stillroom's app icon. */
export function BrandMark({
  size = 26,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const markId = useId().replace(/:/g, "");
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
        <linearGradient id={`${markId}-warm`} x1="22" y1="8" x2="37" y2="32" gradientUnits="userSpaceOnUse"><stop stopColor="#ffe064" /><stop offset="1" stopColor="#ff804d" /></linearGradient>
        <linearGradient id={`${markId}-pink`} x1="20" y1="17" x2="43" y2="29" gradientUnits="userSpaceOnUse"><stop stopColor="#ff58a5" /><stop offset="1" stopColor="#a85bec" /></linearGradient>
        <linearGradient id={`${markId}-blue`} x1="27" y1="13" x2="41" y2="41" gradientUnits="userSpaceOnUse"><stop stopColor="#58d8e9" /><stop offset="1" stopColor="#627cf4" /></linearGradient>
        <linearGradient id={`${markId}-mint`} x1="38" y1="20" x2="20" y2="45" gradientUnits="userSpaceOnUse"><stop stopColor="#5ae5b6" /><stop offset="1" stopColor="#31aebd" /></linearGradient>
        <linearGradient id={`${markId}-violet`} x1="42" y1="37" x2="20" y2="22" gradientUnits="userSpaceOnUse"><stop stopColor="#b770eb" /><stop offset="1" stopColor="#ec59c2" /></linearGradient>
      </defs>
      <path d="M32 31c-3.8-3.5-9.5-8.2-9.5-13.6 0-5 3.6-9 9.5-12 5.1 3 8 7.4 7.3 12.2-.8 5.7-4.8 9.9-7.3 13.4Z" fill={`url(#${markId}-warm)`} />
      <path d="M32 31c-3.8-3.5-9.5-8.2-9.5-13.6 0-5 3.6-9 9.5-12 5.1 3 8 7.4 7.3 12.2-.8 5.7-4.8 9.9-7.3 13.4Z" fill={`url(#${markId}-pink)`} transform="rotate(72 32 32)" />
      <path d="M32 31c-3.8-3.5-9.5-8.2-9.5-13.6 0-5 3.6-9 9.5-12 5.1 3 8 7.4 7.3 12.2-.8 5.7-4.8 9.9-7.3 13.4Z" fill={`url(#${markId}-blue)`} transform="rotate(144 32 32)" />
      <path d="M32 31c-3.8-3.5-9.5-8.2-9.5-13.6 0-5 3.6-9 9.5-12 5.1 3 8 7.4 7.3 12.2-.8 5.7-4.8 9.9-7.3 13.4Z" fill={`url(#${markId}-mint)`} transform="rotate(216 32 32)" />
      <path d="M32 31c-3.8-3.5-9.5-8.2-9.5-13.6 0-5 3.6-9 9.5-12 5.1 3 8 7.4 7.3 12.2-.8 5.7-4.8 9.9-7.3 13.4Z" fill={`url(#${markId}-violet)`} transform="rotate(288 32 32)" />
      <circle cx="32" cy="32" r="4.6" fill="#301b43" stroke="#fff0ee" strokeWidth="1.2" />
    </svg>
  );
}

export default BrandMark;
