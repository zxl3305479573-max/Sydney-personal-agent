import { useEffect, useRef } from "react";
import fluidImage from "./fluid-avatar.png";
import { cn } from "./lib/utils.js";

type Frame = (time: number) => void;
const frames = new Set<Frame>();
let frameId = 0;

function tick(time: number) {
  for (const draw of frames) draw(time);
  frameId = frames.size ? requestAnimationFrame(tick) : 0;
}

function animate(draw: Frame) {
  frames.add(draw);
  if (!frameId) frameId = requestAnimationFrame(tick);
  return () => {
    frames.delete(draw);
    if (!frames.size && frameId) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  };
}

function colorFilter(color: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return "none";
  const rgb = [0, 2, 4].map((index) => parseInt(match[1]!.slice(index, index + 2), 16) / 255);
  const [red, green, blue] = rgb as [number, number, number];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  return `hue-rotate(${hue - 235}deg) saturate(${max ? Math.max(0, delta / max) : 0}) brightness(${Math.max(0.55, max)})`;
}

export function FluidAvatar({
  color,
  size,
  className,
}: {
  color: string;
  size: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const image = new Image();
    image.src = fluidImage;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let stop: (() => void) | undefined;
    let mouseX = 0;
    let mouseY = 0;
    let currentX = 0;
    let currentY = 0;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * scale);
    canvas.height = Math.round(size * scale);

    function draw(time: number) {
      if (!context || !canvas || !image.complete || !image.naturalWidth) return;
      currentX += (mouseX - currentX) * 0.08;
      currentY += (mouseY - currentY) * 0.08;
      const width = canvas.width;
      const pulse = media.matches ? 1 : 1.015 + Math.sin(time / 1400) * 0.012;
      context.clearRect(0, 0, width, width);
      context.save();
      context.beginPath();
      context.arc(width / 2, width / 2, width / 2, 0, Math.PI * 2);
      context.clip();
      context.filter = colorFilter(color);
      const drawn = width * pulse;
      context.drawImage(
        image,
        (width - drawn) / 2 + currentX * width * 0.025,
        (width - drawn) / 2 + currentY * width * 0.025,
        drawn,
        drawn,
      );
      context.restore();
    }

    function sync() {
      stop?.();
      stop = undefined;
      if (visible && !document.hidden && !media.matches) stop = animate(draw);
      else draw(0);
    }
    function move(event: PointerEvent) {
      if (!canvas || media.matches) return;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - (rect.left + rect.width / 2)) / Math.max(rect.width, 1);
      const y = (event.clientY - (rect.top + rect.height / 2)) / Math.max(rect.height, 1);
      if (Math.hypot(x, y) < 3) {
        mouseX = Math.max(-1, Math.min(1, x));
        mouseY = Math.max(-1, Math.min(1, y));
      } else {
        mouseX = 0;
        mouseY = 0;
      }
    }
    function leave() {
      mouseX = 0;
      mouseY = 0;
    }
    const observer =
      typeof IntersectionObserver === "undefined"
        ? undefined
        : new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? false;
            sync();
          });
    observer?.observe(canvas);
    image.onload = sync;
    media.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    sync();
    return () => {
      stop?.();
      observer?.disconnect();
      image.onload = null;
      media.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
    };
  }, [color, size]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={cn("shrink-0 rounded-full", className)}
      style={{
        width: size,
        height: size,
        background: `#040b2c url("${fluidImage}") center / cover`,
      }}
    />
  );
}
