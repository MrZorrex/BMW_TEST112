import { useEffect } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { BadgeDollarSign, KeyRound } from "lucide-react";
import type { CarModel } from "../data/game";
import { fmtMoney } from "../game/format";
import { useI18n } from "../i18n";
import { modelText } from "../i18n/data";
import CarImage from "./CarImage";

interface UnlockModalProps {
  model: CarModel;
  onClose: () => void;
}

export default function UnlockModal({ model, onClose }: UnlockModalProps) {
  const { t, lang } = useI18n();
  const mt = modelText(lang, model);

  useEffect(() => {
    const colors = ["#5cb1eb", "#14335f", "#e30a17", "#ffffff"];
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.55 }, colors });
    const t1 = setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0, y: 0.65 }, colors }), 300);
    const t2 = setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1, y: 0.65 }, colors }), 480);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-night/85 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.8, y: 40, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.9, y: 20, opacity: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-deep my-auto w-full max-w-[560px] overflow-hidden rounded-3xl"
      >
        <div className="relative">
          <motion.div
            initial={{ scale: 1.15 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.4, ease: "easeOut" }}
          >
            <CarImage model={model} eager className="aspect-[1200/627] w-full object-cover" />
          </motion.div>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a0e14] via-transparent to-transparent" />
          <div className="absolute left-4 top-4 rounded-full bg-bmw/90 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-white backdrop-blur">
            {t.unlock.newRide}
          </div>
          <div className="absolute bottom-3 left-5 right-5 flex items-end justify-between gap-3">
            <div>
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="font-display text-2xl font-black text-white sm:text-3xl"
              >
                {model.name}
              </motion.h2>
              <div className="mt-1 text-[12px] font-bold text-white/60">
                {mt.years} · {mt.era}
              </div>
            </div>
            <KeyRound className="mb-1 size-6 shrink-0 text-gold" />
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-[13.5px] font-medium leading-relaxed text-white/65"
          >
            {mt.desc}
          </motion.p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-mint/25 bg-mint/10 px-3 py-1.5 text-[12px] font-bold text-mint">
              <BadgeDollarSign className="size-4" />
              <span className="tabular">{t.unlock.clickBase}: {fmtMoney(model.base)}</span>
            </div>
            <div
              className="rounded-full px-3 py-1.5 text-[12px] font-bold"
              style={{ background: `${model.tint}1e`, color: model.tint }}
            >
              {t.unlock.era}: {mt.era}
            </div>
          </div>

          <button
            onClick={onClose}
            className="shine-btn tap-min mt-5 w-full rounded-2xl bg-gradient-to-r from-bmw to-bmw-soft py-4 font-display text-sm font-black tracking-wide text-white shadow-[0_10px_35px_-8px_rgba(28,105,212,.8)] transition hover:brightness-110 active:scale-[0.98]"
          >
            {t.unlock.goFurther}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
