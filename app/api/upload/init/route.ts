import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

import {
  ensureStorageDirs,
  STORAGE_ROOT,
  FRAMES_DIR,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();

    const body = await req.json();

    const filename =
      typeof body.filename === "string"
        ? body.filename
        : null;

    const totalChunks =
      Number.isInteger(body.totalChunks)
        ? body.totalChunks
        : null;

    if (!filename) {
      return NextResponse.json(
        { error: "Missing filename" },
        { status: 400 }
      );
    }

    if (!totalChunks || totalChunks < 1) {
      return NextResponse.json(
        { error: "Invalid total chunk count" },
        { status: 400 }
      );
    }

    if (path.extname(filename).toLowerCase() !== ".mp4") {
      return NextResponse.json(
        { error: "Only .mp4 files are supported" },
        { status: 400 }
      );
    }

    const projectId = uuidv4();

    const chunksDir = path.join(
      STORAGE_ROOT,
      "chunks",
      projectId
    );

    const framesDir = path.join(
      FRAMES_DIR,
      projectId
    );

    await fs.mkdir(chunksDir, {
      recursive: true,
    });

    await fs.mkdir(framesDir, {
      recursive: true,
    });

    await fs.writeFile(
      path.join(chunksDir, "metadata.json"),
      JSON.stringify(
        {
          filename,
          totalChunks,
          createdAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    return NextResponse.json({
      projectId,
    });
  } catch (error) {
    console.error("Upload init error:", error);

    return NextResponse.json(
      { error: "Could not initialize upload" },
      { status: 500 }
    );
  }
}