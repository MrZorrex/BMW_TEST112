import { useState } from "react";
import type { CarModel } from "../data/game";

/**
 * Фото модели с надёжным запасным вариантом.
 * Если внешнее изображение недоступно (нет сети, регион, блокировка),
 * показывается стилизованный студийный силуэт — игра никогда не выглядит «сломанной».
 */
export default function CarImage({
  model,
  className,
  eager,
}: {
  model: CarModel;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`relative grid place-items-center overflow-hidden ${className ?? ""}`}
        style={{ background: `radial-gradient(70% 90% at 50% 40%, ${model.tint}26, #0b0f16 70%)` }}
        aria-label={model.name}
      >
        <svg viewBox="0 0 240 100" className="w-[78%] max-w-[420px] opacity-90" role="img">
          <defs>
            <linearGradient id={`g-${model.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={model.tint} stopOpacity="0.95" />
              <stop offset="100%" stopColor={model.tint} stopOpacity="0.35" />
            </linearGradient>
          </defs>
          {/* кузов */}
          <path
            d="M18 66c0-6 5-9 11-10l18-3 16-14c4-3 9-5 14-5h34c6 0 11 2 15 6l12 13 24 4c11 2 18 6 18 11 0 4-3 6-8 6H26c-5 0-8-3-8-8z"
            fill={`url(#g-${model.id})`}
          />
          {/* стёкла */}
          <path d="M70 40l12-11c2-2 5-3 8-3h28c4 0 7 1 9 4l9 10z" fill="#0b0f16" opacity="0.75" />
          {/* колёса */}
          <circle cx="66" cy="72" r="13" fill="#0b0f16" />
          <circle cx="66" cy="72" r="6" fill={model.tint} opacity="0.65" />
          <circle cx="176" cy="72" r="13" fill="#0b0f16" />
          <circle cx="176" cy="72" r="6" fill={model.tint} opacity="0.65" />
          {/* блик */}
          <path d="M30 58h180" stroke="#fff" strokeOpacity="0.18" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div className="absolute bottom-2 left-0 right-0 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
          {model.years}
        </div>
      </div>
    );
  }

  return (
    <img
      src={model.img}
      alt={model.name}
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
