import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface TooltipProps {
  title: string;
  lines: { label: string; value?: string; accent?: string }[];
  hint?: string;
  color?: string;
  children: ReactNode;
  className?: string;
  /** К какому краю прижать всплывашку, чтобы не вылезала за экран (п. 1.10.1). */
  align?: "left" | "right";
}

/**
 * Всплывающая подсказка: объясняет, что значит показатель и от чего он зависит.
 * Работает и на тач-устройствах (по нажатию).
 */
export default function Tooltip({
  title,
  lines,
  hint,
  color = "#5aa9ff",
  children,
  className,
  align = "right",
}: TooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`relative ${className ?? ""}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onTouchStart={() => setOpen((v) => !v)}
    >
      {children}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={`pointer-events-none absolute top-[calc(100%+10px)] z-50 w-[268px] max-w-[calc(100vw-2rem)] ${
              align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left"
            }`}
          >
            {/* стрелка */}
            <div
              className={`absolute -top-1.5 size-3 rotate-45 border-l border-t ${
                align === "right" ? "right-6" : "left-6"
              }`}
              style={{ borderColor: `${color}45`, background: "#0d131c" }}
            />
            <div
              className="overflow-hidden rounded-2xl border shadow-[0_20px_50px_-12px_rgba(0,0,0,.9)] backdrop-blur-xl"
              style={{ borderColor: `${color}40`, background: "linear-gradient(165deg,#0f1620,#0a0e14)" }}
            >
              <div
                className="border-b px-3.5 py-2 font-display text-[11px] font-black uppercase tracking-[0.14em]"
                style={{ borderColor: `${color}25`, color, background: `${color}12` }}
              >
                {title}
              </div>
              <div className="space-y-1.5 px-3.5 py-2.5">
                {lines.map((l, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] font-semibold leading-snug text-white/50">{l.label}</span>
                    {l.value && (
                      <span
                        className="tabular shrink-0 text-[11.5px] font-black"
                        style={{ color: l.accent ?? "rgba(255,255,255,.9)" }}
                      >
                        {l.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {hint && (
                <div className="border-t border-white/5 bg-white/[0.02] px-3.5 py-2 text-[10.5px] font-medium leading-relaxed text-white/40">
                  {hint}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
