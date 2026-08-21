import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { v4 as uuidv4 } from "uuid";

import {
  ensureStorageDirs,
  UPLOADS_DIR,
  FRAMES_DIR,
} from "@/lib/storage";

import {
  extractFrames,
  frameIndexToSeconds,
  secondsToTime,
} from "@/lib/ffmpeg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let uploadPath: string | null = null;

  try {
    await ensureStorageDirs();

    const encodedFilename = req.headers.get("x-filename");

    const filename = encodedFilename
      ? decodeURIComponent(encodedFilename)
      : null;

    if (!filename) {
      return NextResponse.json(
        { error: "Missing filename" },
        { status: 400 }
      );
    }

    const ext = path.extname(filename).toLowerCase();

    if (ext !== ".mp4") {
      return NextResponse.json(
        { error: "Only .mp4 files are supported" },
        { status: 400 }
      );
    }

    if (!req.body) {
      return NextResponse.json(
        { error: "No video data received" },
        { status: 400 }
      );
    }

    const projectId = uuidv4();

    uploadPath = path.join(
      UPLOADS_DIR,
      `${projectId}.mp4`
    );

    const projectFramesDir = path.join(
      FRAMES_DIR,
      projectId
    );

    await fsPromises.mkdir(projectFramesDir, {
      recursive: true,
    });

    const nodeStream = Readable.fromWeb(
      req.body as any
    );

    const fileStream = fs.createWriteStream(uploadPath);

    await pipeline(nodeStream, fileStream);

    console.log(`Upload completed: ${uploadPath}`);

    const framePattern = path.join(
      projectFramesDir,
      "frame_%04d.jpg"
    );

    console.log(`Extracting frames: ${projectId}`);

    await extractFrames(
      uploadPath,
      framePattern
    );

    console.log(`Frames completed: ${projectId}`);

    const frameFiles =
      await fsPromises.readdir(projectFramesDir);

    const frames = frameFiles
      .filter((file) => file.endsWith(".jpg"))
      .sort()
      .map((filename, index) => {
        const seconds =
          frameIndexToSeconds(index);

        return {
          src: `/api/frame/${projectId}/${filename}`,
          second: seconds,
          time: secondsToTime(seconds),
        };
      });

    return NextResponse.json({
      projectId,
      originalName: filename,
      frames,
    });
  } catch (error) {
    console.error(
      "Upload/frame extraction error:",
      error
    );

    if (uploadPath) {
      try {
        await fsPromises.unlink(uploadPath);
      } catch {
        // Ignore cleanup failure
      }
    }

    return NextResponse.json(
      {
        error: "Upload or frame extraction failed",
      },
      { status: 500 }
    );
  }
}