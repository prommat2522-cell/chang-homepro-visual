import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "manifest.json");
const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const PRODUCT_RULES = [
  ["air", /^(RAC|AIR|AC)[-_ ]/i, ["แอร์", "เครื่องปรับอากาศ", "air conditioner", "rac"]],
  ["refrigerator", /^(REF|FRIDGE)[-_ ]/i, ["ตู้เย็น", "refrigerator", "ref"]],
  ["washer", /^(WM|WASHER)[-_ ]/i, ["เครื่องซักผ้า", "washer", "wm"]],
  ["dryer", /^(DRY|DRYER)[-_ ]/i, ["เครื่องอบผ้า", "dryer"]],
  ["pump", /^(PUMP)[-_ ]/i, ["ปั๊มน้ำ", "pump"]],
  ["water_heater", /^(WH|WATER-HEATER)[-_ ]/i, ["เครื่องทำน้ำอุ่น", "water heater"]],
  ["fan", /^(FAN)[-_ ]/i, ["พัดลม", "fan"]],
  ["tv", /^(TV)[-_ ]/i, ["ทีวี", "โทรทัศน์", "tv"]],
  ["microwave", /^(MW|MICROWAVE)[-_ ]/i, ["ไมโครเวฟ", "microwave"]],
  ["vacuum", /^(VAC|VACUUM)[-_ ]/i, ["เครื่องดูดฝุ่น", "vacuum"]],
  ["rice_cooker", /^(RICE|RICE-COOKER)[-_ ]/i, ["หม้อหุงข้าว", "rice cooker"]],
  ["cctv", /^(CCTV)[-_ ]/i, ["กล้องวงจรปิด", "cctv"]],
  ["ev_charger", /^(EV|EV-CHARGER)[-_ ]/i, ["ev charger", "เครื่องชาร์จรถไฟฟ้า"]],
];

const TYPE_RULES = [
  ["diagnosis", /(อาการ|ไม่ทำงาน|ไม่เย็น|ไม่ร้อน|ไม่หมุน|ไม่ปั่น|ไม่ตัด|เสียงดัง|น้ำรั่ว|น้ำหยด|ไฟดูด|error|เออเรอร์|เสีย)/i],
  ["installation", /(ติดตั้ง|installation|มาตรฐาน|checklist|check-list|ตรวจรับ)/i],
  ["maintenance", /(บำรุง|ล้าง|ทำความสะอาด|maintenance|pm)/i],
  ["component", /(อะไหล่|ชิ้นส่วน|component|part)/i],
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "node_modules", ".github", "scripts"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function cleanText(value) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function detectProduct(filename) {
  for (const [product, pattern, keywords] of PRODUCT_RULES) {
    if (pattern.test(filename)) return { product, productKeywords: keywords };
  }
  return { product: "general", productKeywords: [] };
}

function detectType(filename) {
  for (const [type, pattern] of TYPE_RULES) {
    if (pattern.test(filename)) return type;
  }
  return "general";
}

function buildKeywords(filename, productKeywords) {
  const stem = cleanText(filename);
  const normalized = stem
    .replace(/[-–—]+/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const words = normalized
    .split(" ")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length >= 2 && !/^\d+$/.test(v));

  return [...new Set([
    normalized.toLowerCase(),
    ...words,
    ...productKeywords,
  ])].filter(Boolean);
}

function encodePath(relativePath) {
  return relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

const baseUrl = (process.env.VISUAL_BASE_URL || "").replace(/\/+$/, "");
if (!baseUrl) {
  throw new Error("Missing VISUAL_BASE_URL environment variable");
}

const imageFiles = walk(ROOT)
  .filter((file) => ALLOWED_EXTENSIONS.has(path.extname(file).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, "th"));

const usedIds = new Set();

const items = imageFiles.map((fullPath, index) => {
  const relativePath = path.relative(ROOT, fullPath).replaceAll("\\", "/");
  const filename = path.basename(relativePath);
  const title = cleanText(filename);
  const { product, productKeywords } = detectProduct(filename);
  const type = detectType(filename);

  let id = slugify(title) || `visual-${index + 1}`;
  let suffix = 2;
  while (usedIds.has(id)) id = `${slugify(title) || "visual"}-${suffix++}`;
  usedIds.add(id);

  const url = `${baseUrl}/${encodePath(relativePath)}`;

  return {
    id,
    title,
    product,
    type,
    keywords: buildKeywords(filename, productKeywords),
    originalUrl: url,
    previewUrl: url,
    objectKey: "",
    enabled: true,
  };
});

const manifest = {
  version: "1.0",
  generatedAt: new Date().toISOString(),
  count: items.length,
  items,
};

fs.writeFileSync(OUTPUT, JSON.stringify(manifest, null, 2) + "\n", "utf8");
console.log(`Generated ${items.length} visual assets → manifest.json`);
