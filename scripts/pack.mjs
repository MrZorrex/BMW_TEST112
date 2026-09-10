import { deflateRawSync } from "node:zlib";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceDir = "dist";
const outputDir = "publish";
const outputFile = path.join(outputDir, "bmw-clicker-yandex.zip");

// Small dependency-free ZIP writer. The archive stays below 100 MB and does
// not need ZIP64, so standard local/central headers are sufficient.
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

async function collect(dir, prefix = "") {
  const files = [];
  for (const name of (await readdir(dir)).sort()) {
    const absolute = path.join(dir, name);
    const relative = path.posix.join(prefix, name);
    const info = await stat(absolute);
    if (info.isDirectory()) files.push(...(await collect(absolute, relative)));
    else files.push({ absolute, relative, info });
  }
  return files;
}

const files = await collect(sourceDir);
if (!files.some((file) => file.relative === "index.html")) {
  throw new Error("dist/index.html is missing; run npm run build first.");
}

const localParts = [];
const centralParts = [];
let offset = 0;

for (const file of files) {
  const data = await readFile(file.absolute);
  const compressed = deflateRawSync(data, { level: 9 });
  const name = Buffer.from(file.relative, "utf8");
  const crc = crc32(data);
  const { time, day } = dosDateTime(file.info.mtime);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  localParts.push(local, name, compressed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centralParts.push(central, name);

  offset += local.length + name.length + compressed.length;
}

const centralDirectory = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);

await mkdir(outputDir, { recursive: true });
await writeFile(outputFile, Buffer.concat([...localParts, centralDirectory, end]));
const size = (await stat(outputFile)).size;
console.log(`Created ${outputFile}: ${(size / 1024 / 1024).toFixed(2)} MB, ${files.length} file(s).`);