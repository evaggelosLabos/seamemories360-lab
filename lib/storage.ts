import path from "path";
import fs from "fs/promises";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");
export const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");
export const FRAMES_DIR = path.join(STORAGE_ROOT, "frames");
export const CLIPS_DIR = path.join(STORAGE_ROOT, "clips");

export async function ensureStorageDirs() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.mkdir(FRAMES_DIR, { recursive: true });
  await fs.mkdir(CLIPS_DIR, { recursive: true });
}