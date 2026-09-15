import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const mediaDir = path.join(publicDir, "media");
const thumbDir = path.join(publicDir, "thumbs");
const posterDir = path.join(publicDir, "posters");
const isProduction = process.env.NODE_ENV === "production";
const accessCode = process.env.PRIVATE_ACCESS_CODE;
const sessionSecret = process.env.SESSION_SECRET || "development-only-session-secret";
const execFileAsync = promisify(execFile);
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const videoExtensions = new Set([".mp4", ".mov", ".webm", ".m4v"]);

type MediaKind = "image" | "video";
type MediaItem = {
  id: string;
  name: string;
  kind: MediaKind;
  size: number;
  date: string | null;
  url: string;
  previewUrl: string;
  fileExtension: string;
};

function parseDate(name: string) {
  const match = name.match(/(20\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

async function listMedia(): Promise<MediaItem[]> {
  const entries = await fsp.readdir(mediaDir, { withFileTypes: true });
  const items: MediaItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const extension = path.extname(entry.name).toLowerCase();
    const kind = imageExtensions.has(extension)
      ? "image"
      : videoExtensions.has(extension)
        ? "video"
        : null;
    if (!kind) continue;
    const stat = await fsp.stat(path.join(mediaDir, entry.name));
    const encoded = encodeURIComponent(entry.name);
    const previewName = kind === "image" ? entry.name : `${path.basename(entry.name, extension)}.jpg`;
    const previewPath = kind === "image"
      ? path.join(thumbDir, entry.name)
      : path.join(posterDir, previewName);
    const previewUrl = fs.existsSync(previewPath)
      ? kind === "image"
        ? `/thumbs/${encoded}`
        : `/posters/${encodeURIComponent(previewName)}`
      : kind === "image"
        ? `/media/${encoded}`
        : "";
    items.push({
      id: entry.name,
      name: entry.name,
      kind,
      size: stat.size,
      date: parseDate(entry.name),
      url: `/media/${encoded}`,
      previewUrl,
      fileExtension: extension.slice(1).toUpperCase(),
    });
  }
  return items.sort((a, b) => {
    const dateSort = (b.date || "").localeCompare(a.date || "");
    return dateSort || a.name.localeCompare(b.name);
  });
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.cookie?.split(";").map((part) => part.trim()) || [];
  const target = cookies.find((part) => part.startsWith(`${name}=`));
  return target?.slice(name.length + 1);
}

function sessionToken() {
  return crypto.createHmac("sha256", sessionSecret).update("gallery-session").digest("hex");
}

function isAuthenticated(request: Request) {
  // When no access code is configured, the gallery is intentionally link-accessible.
  if (!accessCode) return true;
  return cookieValue(request, "little_universe_session") === sessionToken();
}

function requireAuth(request: Request, response: Response, next: () => void) {
  if (!isAuthenticated(request)) {
    response.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

async function hashFile(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function safeFilename(value: unknown) {
  const raw = typeof value === "string" ? value : "laiba-photo";
  let decoded = raw;
  try {
    decoded = raw.includes("%") ? decodeURIComponent(raw) : raw;
  } catch {
    decoded = raw;
  }
  const basename = path.basename(decoded).normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return basename.replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").slice(0, 180);
}

async function nextMediaFilename(kind: MediaKind, extension: string) {
  const prefix = kind === "image" ? "laiba picture" : "laiba video";
  const pattern = new RegExp(`^${prefix} (\\d+)\\.[^.]+$`, "i");
  const entries = await fsp.readdir(mediaDir);
  const highestNumber = entries.reduce((highest, entry) => {
    const match = entry.match(pattern);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${prefix} ${highestNumber + 1}${extension}`;
}

async function createPreview(filename: string, kind: MediaKind) {
  const source = path.join(mediaDir, filename);
  try {
    if (kind === "image") {
      await execFileAsync("convert", [source, "-auto-orient", "-resize", "720x720>", path.join(thumbDir, filename)], { timeout: 120000 });
    } else {
      const posterName = `${path.basename(filename, path.extname(filename))}.jpg`;
      await execFileAsync("ffmpeg", ["-y", "-ss", "00:00:01", "-i", source, "-frames:v", "1", "-vf", "scale='min(720,iw)':-2", path.join(posterDir, posterName)], { timeout: 120000 });
    }
  } catch (error) {
    console.warn(`Could not create ${kind} preview for ${filename}:`, error instanceof Error ? error.message : error);
  }
}

async function removeMedia(filename: string) {
  const extension = path.extname(filename);
  const target = path.join(mediaDir, filename);
  await fsp.rm(target, { force: true });
  await fsp.rm(path.join(thumbDir, filename), { force: true });
  await fsp.rm(path.join(posterDir, `${path.basename(filename, extension)}.jpg`), { force: true });
}

async function buildImportReport(items: MediaItem[]) {
  const hashes = new Map<string, string[]>();
  let missingPreviews = 0;
  let originalBytes = 0;
  for (const item of items) {
    originalBytes += item.size;
    const previewPath = item.kind === "image"
      ? path.join(thumbDir, item.name)
      : path.join(posterDir, `${path.basename(item.name, path.extname(item.name))}.jpg`);
    if (!fs.existsSync(previewPath)) missingPreviews += 1;
    const hash = await hashFile(path.join(mediaDir, item.name));
    hashes.set(hash, [...(hashes.get(hash) || []), item.name]);
  }
  const duplicateGroups = [...hashes.values()].filter((group) => group.length > 1);
  return {
    generatedAt: new Date().toISOString(),
    archiveFilesDiscovered: items.length,
    imagesImported: items.filter((item) => item.kind === "image").length,
    videosImported: items.filter((item) => item.kind === "video").length,
    unsupportedFiles: 0,
    duplicateGroups,
    failedImports: 0,
    missingPreviews,
    finalMediaItems: items.length,
    originalBytes,
    items,
  };
}

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.get("/api/health", (_request, response) => response.json({ ok: true, service: "little-universe" }));

app.get("/api/auth/status", (request, response) => {
  response.json({ authenticated: isAuthenticated(request), setupRequired: isProduction && !accessCode });
});

app.post("/api/auth/unlock", (request, response) => {
  if (!accessCode) {
    response.status(400).json({ error: "PRIVATE_ACCESS_CODE is not configured." });
    return;
  }
  if (typeof request.body?.code !== "string" || request.body.code.length < 1 || request.body.code !== accessCode) {
    response.status(401).json({ error: "That access code is not correct." });
    return;
  }
  const secureFlag = isProduction ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `little_universe_session=${sessionToken()}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}${secureFlag}`,
  );
  response.json({ authenticated: true });
});

app.post("/api/auth/lock", (_request, response) => {
  response.setHeader("Set-Cookie", "little_universe_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0");
  response.json({ authenticated: false });
});

app.get("/api/media", requireAuth, async (request, response) => {
  const items = await listMedia();
  const query = typeof request.query.q === "string" ? request.query.q.toLowerCase() : "";
  const kind = request.query.kind === "image" || request.query.kind === "video" ? request.query.kind : "all";
  const filtered = items.filter((item) => {
    const matchesQuery = !query || item.name.toLowerCase().includes(query);
    const matchesKind = kind === "all" || item.kind === kind;
    return matchesQuery && matchesKind;
  });
  response.json({ items: filtered, total: items.length });
});

app.get("/api/report", requireAuth, async (_request, response) => {
  const items = await listMedia();
  response.json(await buildImportReport(items));
});

app.post("/api/media/upload", requireAuth, express.raw({ type: "*/*", limit: "2gb" }), async (request, response) => {
  const requestedName = request.header("x-filename");
  const filename = safeFilename(requestedName);
  const extension = path.extname(filename).toLowerCase();
  const kind = imageExtensions.has(extension) ? "image" : videoExtensions.has(extension) ? "video" : null;
  const body = Buffer.isBuffer(request.body) ? request.body : null;

  if (!kind || !body || body.length === 0) {
    response.status(400).json({ error: "Choose a JPG, PNG, WEBP, GIF, MP4, MOV, WEBM, or M4V file." });
    return;
  }

  const finalName = await nextMediaFilename(kind, extension);
  await fsp.writeFile(path.join(mediaDir, finalName), body);
  await createPreview(finalName, kind);
  const items = await listMedia();
  response.status(201).json({ item: items.find((item) => item.name === finalName) });
});

app.delete("/api/media", requireAuth, async (request, response) => {
  const requestedFiles = Array.isArray(request.body?.files) ? request.body.files : [];
  const filenames: string[] = Array.from(new Set<string>(requestedFiles.filter((value: unknown): value is string => typeof value === "string").map(safeFilename))).slice(0, 500);
  const existing = filenames.filter((filename) => fs.existsSync(path.join(mediaDir, filename)));

  if (existing.length === 0) {
    response.status(400).json({ error: "No files were selected." });
    return;
  }

  await Promise.all(existing.map(removeMedia));
  response.json({ deleted: existing });
});

app.get("/api/media/download", requireAuth, async (request, response) => {
  const queryFiles = request.query.file;
  const requestedFiles = Array.isArray(queryFiles) ? queryFiles : typeof queryFiles === "string" ? [queryFiles] : [];
  const filenames = [...new Set(requestedFiles.map(safeFilename))].slice(0, 500);
  const existing = filenames.filter((filename) => fs.existsSync(path.join(mediaDir, filename)));

  if (existing.length === 0) {
    response.status(400).json({ error: "No files were selected." });
    return;
  }

  const temporaryDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "laiba-download-"));
  const zipPath = path.join(temporaryDirectory, "laiba-photos.zip");
  try {
    await execFileAsync("zip", ["-j", zipPath, ...existing.map((filename) => path.join(mediaDir, filename))], { timeout: 120000 });
    response.download(zipPath, "laiba-photos.zip", async () => {
      await fsp.rm(temporaryDirectory, { recursive: true, force: true });
    });
  } catch (error) {
    await fsp.rm(temporaryDirectory, { recursive: true, force: true });
    response.status(500).json({ error: "The download could not be prepared." });
  }
});

app.get("/media/:filename", requireAuth, async (request, response) => {
  const rawFilename = Array.isArray(request.params.filename) ? request.params.filename[0] : request.params.filename;
  const filename = path.basename(decodeURIComponent(rawFilename));
  const target = path.join(mediaDir, filename);
  if (filename !== request.params.filename || !fs.existsSync(target)) {
    response.status(404).json({ error: "Media not found" });
    return;
  }
  response.sendFile(target);
});

app.use("/thumbs", express.static(thumbDir, { maxAge: "7d", immutable: true }));
app.use("/posters", express.static(posterDir, { maxAge: "7d", immutable: true }));

if (isProduction) {
  app.use(express.static(path.join(root, "dist")));
  app.get("*", (_request, response) => response.sendFile(path.join(root, "dist", "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true, hmr: false } });
  app.use(vite.middlewares);
}

const port = Number(process.env.PORT) || 5000;
app.listen(port, "0.0.0.0", () => {
  console.log(`Little Universe listening on port ${port}`);
});