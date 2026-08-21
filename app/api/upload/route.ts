import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";
import { ensureStorageDirs, UPLOADS_DIR, FRAMES_DIR } from "@/lib/storage";
import {
  extractFrames,
  frameIndexToSeconds,
  secondsToTime,
} from "@/lib/ffmpeg";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();

    const formData = await req.formData();
    const file = formData.get("video");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No video uploaded" }, { status: 400 });
    }

    const ext = path.extname(file.name).toLowerCase();

    if (ext !== ".mp4") {
      return NextResponse.json(
        { error: "For v0.1 upload only .mp4 files" },
        { status: 400 }
      );
    }

    const projectId = uuidv4();

    const uploadPath = path.join(UPLOADS_DIR, `${projectId}.mp4`);
    const projectFramesDir = path.join(FRAMES_DIR, projectId);

    await fs.mkdir(projectFramesDir, { recursive: true });

    const bytes = await file.arrayBuffer();
    await fs.writeFile(uploadPath, Buffer.from(bytes));

    const framePattern = path.join(projectFramesDir, "frame_%04d.jpg");

    await extractFrames(uploadPath, framePattern);

    const frameFiles = await fs.readdir(projectFramesDir);

    const frames = frameFiles
      .filter((file) => file.endsWith(".jpg"))
      .sort()
      .map((filename, index) => {
        const seconds = frameIndexToSeconds(index);

        return {
          src: `/api/frame/${projectId}/${filename}`,
          second: seconds,
          time: secondsToTime(seconds),
        };
      });

    return NextResponse.json({
      projectId,
      originalName: file.name,
      frames,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Upload or frame extraction failed" },
      { status: 500 }
    );
  }
}