/**
 * Резолвер изображений.
 *
 * Окружение раздаёт игру одним файлом dist/index.html — статика из public/
 * до игрока не доходит (отсюда «заглушки» вместо картинок). Поэтому все
 * изображения хранятся прямо в исходнике (src/assets-data.ts, data-URI)
 * и попадают в бандл автоматически: сборка не зависит от внешних файлов.
 */
import IMAGES from "../assets-data";

/** Превращает старый путь из public ("/models/dixi.jpg") в data-URI из бандла. */
export function A(path: string): string {
  return IMAGES[path] ?? path;
}
