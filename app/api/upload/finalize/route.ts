import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import fsPromises from "fs/promises";

import {
  ensureStorageDirs,
  STORAGE_ROOT,
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

function validProjectId(value: string) {
  return /^[0-9a-f-]{36}$/i.test(value);
}

async function appendFile(
  source: string,
  destination: fs.WriteStream
) {
  return new Promise<void>(
    (resolve, reject) => {
      const input =
        fs.createReadStream(source);

      input.on("error", reject);
      destination.on("error", reject);

      input.on("end", resolve);

      input.pipe(destination, {
        end: false,
      });
    }
  );
}

export async function POST(req: Request) {
  let finalUploadPath:
    | string
    | null = null;

  try {
    await ensureStorageDirs();

    const body = await req.json();

    const projectId =
      typeof body.projectId === "string"
        ? body.projectId
        : "";

    if (!validProjectId(projectId)) {
      return NextResponse.json(
        { error: "Invalid project ID" },
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

    const metadata = JSON.parse(
      await fsPromises.readFile(
        metadataPath,
        "utf8"
      )
    );

    const totalChunks =
      Number(metadata.totalChunks);

    const filename =
      String(metadata.filename);

    /*
     * Verify every piece exists BEFORE
     * assembling the final MP4.
     */
    for (
      let i = 0;
      i < totalChunks;
      i++
    ) {
      const chunkPath = path.join(
        chunksDir,
        `chunk_${String(i).padStart(6, "0")}`
      );

      try {
        await fsPromises.access(chunkPath);
      } catch {
        return NextResponse.json(
          {
            error: `Missing chunk ${i}`,
          },
          { status: 409 }
        );
      }
    }

    finalUploadPath = path.join(
      UPLOADS_DIR,
      `${projectId}.mp4`
    );

    const output =
      fs.createWriteStream(
        finalUploadPath
      );

    for (
      let i = 0;
      i < totalChunks;
      i++
    ) {
      const chunkPath = path.join(
        chunksDir,
        `chunk_${String(i).padStart(6, "0")}`
      );

      console.log(
        `Joining chunk ${
          i + 1
        }/${totalChunks}`
      );

      await appendFile(
        chunkPath,
        output
      );
    }

    await new Promise<void>(
      (resolve, reject) => {
        output.end(resolve);
        output.on("error", reject);
      }
    );

    const finalStats =
      await fsPromises.stat(
        finalUploadPath
      );

    console.log(
      `Final video assembled: ${finalUploadPath} (${finalStats.size} bytes)`
    );

    /*
     * Chunks are no longer required.
     */
    await fsPromises.rm(
      chunksDir,
      {
        recursive: true,
        force: true,
      }
    );

    const projectFramesDir =
      path.join(
        FRAMES_DIR,
        projectId
      );

    await fsPromises.mkdir(
      projectFramesDir,
      {
        recursive: true,
      }
    );

    const framePattern = path.join(
      projectFramesDir,
      "frame_%04d.jpg"
    );

    console.log(
      `Extracting frames: ${projectId}`
    );

    await extractFrames(
      finalUploadPath,
      framePattern
    );

    console.log(
      `Frames completed: ${projectId}`
    );

    const frameFiles =
      await fsPromises.readdir(
        projectFramesDir
      );

    const frames = frameFiles
      .filter((file) =>
        file.endsWith(".jpg")
      )
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
      "Finalize upload error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Could not finalize upload",
      },
      { status: 500 }
    );
  }
}