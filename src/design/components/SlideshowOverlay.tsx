import { useCallback, useEffect, useRef, useState } from "react";
import { useSlideshowStore, useDraftTransforms, draftTransformStyle, type SlideshowTransition } from "../../engine/stores";
import { GearIcon, PauseIcon, PlayIcon, StopIcon } from "./icons";

interface SlideshowOverlayProps {
  assetUrl: (path: string) => string;
}

// A slideshow is a mode, not a destination. It floats above whatever screen
// launched it, owns its own item list, and leaves the library selection and
// inspection state untouched when it closes.
export function SlideshowOverlay({ assetUrl }: SlideshowOverlayProps) {
  const isOpen = useSlideshowStore((s) => s.isOpen);
  const draftTransforms = useDraftTransforms();
  const items = useSlideshowStore((s) => s.items);
  const index = useSlideshowStore((s) => s.index);
  const playing = useSlideshowStore((s) => s.playing);
  const interval = useSlideshowStore((s) => s.interval);
  const shuffle = useSlideshowStore((s) => s.shuffle);
  const transition = useSlideshowStore((s) => s.transition);
  const item = items[index];
  const close = useSlideshowStore((s) => s.close);
  const next = useSlideshowStore((s) => s.next);
  const previous = useSlideshowStore((s) => s.previous);
  const toggle = useSlideshowStore((s) => s.toggle);
  const setInterval = useSlideshowStore((s) => s.setInterval);
  const setShuffle = useSlideshowStore((s) => s.setShuffle);
  const setTransition = useSlideshowStore((s) => s.setTransition);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hudVisible, setHudVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Controls fade out while the slideshow plays and come back on movement.
  const poke = useCallback(() => {
    setHudVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setHudVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    poke();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [isOpen, poke]);

  // Capture phase: the Viewer underneath also listens for arrows/space, and a
  // slideshow key press should never drive the hidden screen.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        previous();
      } else if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, close, next, previous, toggle]);

  // The slideshow's play/pause state owns its video too. Videos advance on
  // `ended`, while still images use the configured interval timer.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || item?.kind !== "video") return;
    if (playing) void video.play().catch(() => {});
    else video.pause();
    return () => video.pause();
  }, [item?.id, item?.kind, playing]);

  // Keep the slideshow from continuing to play media behind another app.
  useEffect(() => {
    if (!isOpen) return;
    const pauseWhenBackgrounded = () => {
      if (document.visibilityState !== "hidden" && document.hasFocus()) return;
      const state = useSlideshowStore.getState();
      if (state.playing) state.toggle();
      videoRef.current?.pause();
    };
    document.addEventListener("visibilitychange", pauseWhenBackgrounded);
    window.addEventListener("blur", pauseWhenBackgrounded);
    return () => {
      document.removeEventListener("visibilitychange", pauseWhenBackgrounded);
      window.removeEventListener("blur", pauseWhenBackgrounded);
      videoRef.current?.pause();
    };
  }, [isOpen]);

  // Reset the settings popover when the session ends.
  useEffect(() => {
    if (!isOpen) setSettingsOpen(false);
  }, [isOpen]);

  if (!isOpen) return null;
  if (!item) return null;

  const hudShown = hudVisible || !playing || settingsOpen;
  const position = `${(index + 1).toLocaleString()} / ${items.length.toLocaleString()}`;
  const draftTransform = draftTransforms.get(item.id);
  const rotated = Boolean(draftTransform && draftTransform.rotation % 180 !== 0);

  return (
    <div
      className={`slideshow-overlay${hudShown ? " hud-visible" : ""}`}
      data-transition={transition}
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow"
      onMouseMove={poke}
    >
      <div className="slideshow-media" key={item.id} onClick={toggle} title={playing ? "Pause" : "Play"}>
        {item.kind === "video" ? (
          <video
            ref={videoRef}
            src={assetUrl(item.path)}
            autoPlay={playing}
            loop={false}
            playsInline
            onEnded={() => (items.length > 1 ? next() : toggle())}
          />
        ) : (
          <img
            src={assetUrl(item.path)}
            alt={item.name}
            decoding="async"
            style={{
              maxWidth: rotated ? "min(100%, 100cqh)" : undefined,
              maxHeight: rotated ? "min(100%, 100cqw)" : undefined,
              transform: draftTransformStyle(draftTransform),
            }}
          />
        )}
      </div>

      <div className="slideshow-hud slideshow-hud-top">
        <span className="slideshow-position">{position}</span>
        <div className="slideshow-hud-actions">
          <button
            type="button"
            className={settingsOpen ? "active" : ""}
            onClick={() => setSettingsOpen((open) => !open)}
            aria-label="Slideshow settings"
            title="Slideshow settings"
          >
            <GearIcon size={16} />
          </button>
          <button type="button" onClick={close} aria-label="Close slideshow" title="Close (Esc)">
            ×
          </button>
        </div>
      </div>

      <div className="slideshow-hud slideshow-hud-bottom">
        <div className="slideshow-transport">
          <button type="button" onClick={previous} aria-label="Previous slide" title="Previous (←)">
            ‹
          </button>
          <button type="button" className="slideshow-toggle" onClick={toggle} aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause (Space)" : "Play (Space)"}>
            {playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}
          </button>
          <button type="button" onClick={next} aria-label="Next slide" title="Next (→)">
            ›
          </button>
        </div>

        <div className="slideshow-overlay-caption">
          <b>{item.name}</b>
          <span>
            {new Date(item.modifiedAt).toLocaleDateString()}
            {item.extension ? ` · ${item.extension.toUpperCase()}` : ""}
          </span>
        </div>

        <button type="button" className="slideshow-stop" onClick={close}>
          <StopIcon size={13} /> Stop
        </button>
      </div>

      {settingsOpen && (
        <div className="slideshow-settings-pop" role="dialog" aria-label="Slideshow settings">
          <div className="slideshow-settings-head">
            <b>Slideshow</b>
            <button type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button>
          </div>

          <label className="slideshow-setting">
            <span>Interval <i>{interval}s</i></span>
            <input
              type="range"
              min={2}
              max={30}
              step={1}
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </label>

          <label className="slideshow-setting row">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
            <span>Shuffle</span>
          </label>

          <label className="slideshow-setting">
            <span>Transition</span>
            <select value={transition} onChange={(e) => setTransition(e.target.value as SlideshowTransition)}>
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="none">None</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
