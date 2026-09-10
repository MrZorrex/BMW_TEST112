import { motion } from "framer-motion";
import { MODELS } from "../data/game";
import { fill, useI18n } from "../i18n";
import { localizedEras, modelText, shortEra } from "../i18n/data";

interface TimelineProps {
  modelIndex: number;
}

export default function Timeline({ modelIndex }: TimelineProps) {
  const { t, lang } = useI18n();
  const ERAS = localizedEras(lang);
  const eraOf = (idx: number) => modelText(lang, MODELS[idx]).era;
  const currentEra = eraOf(modelIndex);
  const currentEraIdx = ERAS.indexOf(currentEra);

  return (
    <div className="border-b border-line bg-night/60">
      <div className="mx-auto max-w-[1600px] px-4 py-2.5 sm:px-6">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40">
          <span>
            {t.timeline.collection}{" "}
            <span className="text-white/80">
              {modelIndex + 1}<span className="text-white/40">/{MODELS.length}</span>
            </span>
          </span>
          <span>
            {t.timeline.era}: <span className="text-bmw-soft">{currentEra}</span>
          </span>
        </div>

        {/* Полоса десятилетий */}
        <div className="relative">
          <div className="flex gap-1">
            {ERAS.map((era, eraIdx) => {
              const count = MODELS.filter((m) => modelText(lang, m).era === era).length;
              const owned = MODELS.filter(
                (m) => modelText(lang, m).era === era && MODELS.indexOf(m) <= modelIndex
              ).length;
              const empty = count === 0;
              const active = era === currentEra;
              // эпоха пройдена: все модели куплены ИЛИ (пустая эпоха и мы уже дальше по времени)
              const passedEmpty = empty && eraIdx < currentEraIdx;
              const done = (count > 0 && owned === count) || passedEmpty;
              return (
                <div
                  key={era}
                  className="group relative flex-1"
                  title={
                    empty
                      ? `${fill(t.timeline.emptyTitle, { era })}${passedEmpty ? t.timeline.emptyPassed : ""}`
                      : fill(t.timeline.eraProgress, { era, o: owned, c: count })
                  }
                >
                  <div
                    className={`h-1.5 overflow-hidden rounded-full transition-colors ${
                      done
                        ? passedEmpty
                          ? "bg-bmw/70"
                          : "bg-bmw"
                        : active
                          ? "bg-white/10"
                          : owned > 0
                            ? "bg-bmw/50"
                            : empty
                              ? "bg-white/5"
                              : "bg-white/10"
                    }`}
                  >
                    {active && !done && count > 0 && (
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-bmw to-bmw-soft"
                        initial={{ width: "0%" }}
                        animate={{ width: `${(owned / count) * 100}%` }}
                        transition={{ type: "spring", stiffness: 140, damping: 20 }}
                      />
                    )}
                  </div>
                  <div
                    className={`mt-1 truncate text-center text-[8.5px] font-bold tracking-wider transition-colors sm:text-[9px] ${
                      active
                        ? "text-bmw-soft"
                        : done
                          ? "text-white/45"
                          : empty
                            ? "text-white/15"
                            : "text-white/30"
                    }`}
                  >
                    {shortEra(lang, era)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
