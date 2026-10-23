import React from "react";
import appIcon from "../../../src-tauri/icons/icon.png";

/** The shared Stillroom app mark used in the top bar and empty states. */
export function BrandMark({
  size = 26,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <img
      className={`brand-mark ${className}`.trim()}
      src={appIcon}
      width={size}
      height={size}
      alt="Stillroom"
      draggable={false}
    />
  );
}

export default BrandMark;
