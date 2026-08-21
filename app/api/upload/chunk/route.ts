import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

import {
  ensureStorageDirs,
  STORAGE_ROOT,
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validProjectId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

export async function POST(req: Request) {
  try {
    await ensureStorageDirs();

    const projectId = req.headers.get("x-project-id");
    const chunkIndexRaw =
      req.headers.get("x-chunk-index");

    if (
      !projectId ||
      !validProjectId(projectId)
    ) {
      return NextResponse.json(
        { error: "Invalid project ID" },
        { status: 400 }
      );
    }

    const chunkIndex = Number(chunkIndexRaw);

    if (
      !Number.isInteger(chunkIndex) ||
      chunkIndex < 0
    ) {
      return NextResponse.json(
        { error: "Invalid chunk index" },
        { status: 400 }
      );
    }

    if (!req.body) {
      return NextResponse.json(
        { error: "Missing chunk data" },
        { status: 400 }
      );
    }

    const chunksDir = path.join(
      STORAGE_ROOT,
      "chunks",
      projectId
    );

    const metadataPath = path.join(
      chunksDir,
      "metadata.json"
    );

    try {
      await fsPromises.access(metadataPath);
    } catch {
      return NextResponse.json(
        { error: "Upload session not found" },
        { status: 404 }
      );
    }

    const chunkPath = path.join(
      chunksDir,
      `chunk_${String(chunkIndex).padStart(6, "0")}`
    );

    const temporaryPath =
      `${chunkPath}.part`;

    const inputStream = Readable.fromWeb(
      req.body as any
    );

    const outputStream =
      fs.createWriteStream(temporaryPath);

    await pipeline(
      inputStream,
      outputStream
    );

    /*
     * Atomic rename means a failed request
     * never leaves a chunk looking "complete".
     */
    await fsPromises.rename(
      temporaryPath,
      chunkPath
    );

    const stats =
      await fsPromises.stat(chunkPath);

    console.log(
      `Chunk ${chunkIndex} saved for ${projectId}: ${stats.size} bytes`
    );

    return NextResponse.json({
      ok: true,
      chunkIndex,
      bytes: stats.size,
    });
  } catch (error) {
    console.error(
      "Chunk upload error:",
      error
    );

    return NextResponse.json(
      { error: "Chunk upload failed" },
      { status: 500 }
    );
  }
}