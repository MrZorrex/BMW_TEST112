import { useEffect, useState } from "react";

export interface Viewport {
  w: number;
  h: number;
  /** Грубое указание (тачскрин): нужны крупные тап-зоны (п. 1.8). */
  isCoarse: boolean;
  /** Точное указание (мышь): можно показывать клавиатурные подсказки. */
  isFine: boolean;
  /** Альбомная ориентация. */
  isLandscape: boolean;
  /** Низкое окно: альбомный телефон, сплющенное окно десктопа — компактный режим. */
  isShort: boolean;
  /** Узкое окно: портретный телефон — одноэкранный режим с переключением видов. */
  isNarrow: boolean;
}

function read(): Viewport {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const fine = window.matchMedia?.("(pointer: fine)").matches ?? true;
  return {
    w,
    h,
    isCoarse: coarse,
    isFine: fine,
    isLandscape: w > h,
    isShort: h < 560,
    isNarrow: w < 1024,
  };
}

/** Живые размеры окна и тип указателя — для адаптации под ориентацию и устройство (п. 1.10). */
export function useViewport(): Viewport {
  const [v, setV] = useState<Viewport>(read);

  useEffect(() => {
    let raf = 0;
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setV(read()));
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  return v;
}
