/**
 * Резолвер изображений.
 *
 * Картинки игры — обычные файлы в src/assets/{models,cards,rewards}/\*.jpg.
 * Заменить фотографию модели = положить файл в эту папку, ничего больше
 * править не нужно.
 *
 * `import.meta.glob(..., { eager: true, import: "default" })` разворачивается
 * Vite НА ЭТАПЕ СБОРКИ в объект «исходный путь → итоговый URL файла». Vite сам
 * кладёт картинки в assets/ и подставляет относительный путь с учётом `base`,
 * поэтому ссылки работают и на сервере Яндекс Игр (игра раздаётся из вложенной
 * папки), и на любом хостинге, и с file:// в single-file сборке для ПК.
 *
 * Никакой сети и никаких внешних адресов: в релизном архиве только файлы самой
 * игры — это прямое требование п. 8.4.2 («игра не должна обращаться к внешним
 * ресурсам»).
 */
const FILES: Record<string, string> = import.meta.glob("../assets/**/*.jpg", {
  eager: true,
  import: "default",
});

/** "../assets/models/dixi.jpg" → "/models/dixi.jpg" — ключи, которые использует игра. */
const IMAGES: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([file, url]) => ["/" + file.replace(/^.*\/assets\//, ""), url])
);

/**
 * Превращает путь из данных игры ("/models/dixi.jpg") в URL собранного файла.
 *
 * Если файла нет, возвращается исходный путь — в dev это сразу видно по 404,
 * а на релизе ловит `npm run validate:yandex` (он сверяет ссылки с файлами в
 * сборке). В браузере недозагруженную картинку подстраховывает CarImage:
 * вместо битого <img> рисуется стилизованный силуэт.
 */
export function A(path: string): string {
  const url = IMAGES[path];
  if (url) return url;
  if (import.meta.env.DEV) console.warn(`[assets] нет файла для "${path}" — положите его в src/assets`);
  return path;
}
