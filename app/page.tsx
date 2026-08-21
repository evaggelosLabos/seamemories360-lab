"use client";

import { useEffect, useState } from "react";

type Frame = {
  src: string;
  second: number;
  time: string;
};

export default function Home() {
  const [video, setVideo] = useState<File | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [start, setStart] = useState<Frame | null>(null);
  const [end, setEnd] = useState<Frame | null>(null);
  const [loading, setLoading] = useState(false);
  const [cutting, setCutting] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);

  const [uploadProgress, setUploadProgress] = useState(0);

const [uploadStage, setUploadStage] =
  useState<
    "idle" |
    "uploading" |
    "processing"
  >("idle");

  function goToFrame(index: number) {
    if (!frames.length) return;

    const safeIndex = Math.max(0, Math.min(index, frames.length - 1));
    setSelectedIndex(safeIndex);
    setSelectedFrame(frames[safeIndex]);
  }

  function goPrev() {
    goToFrame(selectedIndex - 1);
  }

  function goNext() {
    goToFrame(selectedIndex + 1);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!frames.length) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [frames, selectedIndex]);

  async function uploadVideo() {
  if (!video) return;

  const CHUNK_SIZE =
    25 * 1024 * 1024;

  const totalChunks = Math.ceil(
    video.size / CHUNK_SIZE
  );

  setLoading(true);
  setUploadStage("uploading");
  setUploadProgress(0);

  setClipUrl(null);
  setStart(null);
  setEnd(null);
  setFrames([]);
  setSelectedFrame(null);
  setSelectedIndex(0);

  try {
    /*
     * STEP 1
     * Create resumable upload session.
     */
    const initRes = await fetch(
      "/api/upload/init",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          filename: video.name,
          totalChunks,
          fileSize: video.size,
        }),
      }
    );

    const initData =
      await initRes.json();

    if (!initRes.ok) {
      throw new Error(
        initData.error ||
          "Could not initialize upload"
      );
    }

    const newProjectId =
      initData.projectId;

    /*
     * STEP 2
     * Send each 25 MB piece.
     */
    for (
      let chunkIndex = 0;
      chunkIndex < totalChunks;
      chunkIndex++
    ) {
      const startByte =
        chunkIndex * CHUNK_SIZE;

      const endByte = Math.min(
        startByte + CHUNK_SIZE,
        video.size
      );

      const chunk = video.slice(
        startByte,
        endByte
      );

      let uploaded = false;

      /*
       * Retry each failed piece
       * up to 5 times.
       */
      for (
        let attempt = 1;
        attempt <= 5;
        attempt++
      ) {
        try {
          const chunkRes =
            await fetch(
              "/api/upload/chunk",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/octet-stream",

                  "X-Project-Id":
                    newProjectId,

                  "X-Chunk-Index":
                    String(
                      chunkIndex
                    ),
                },

                body: chunk,
              }
            );

          if (!chunkRes.ok) {
            throw new Error(
              `Chunk ${chunkIndex} failed`
            );
          }

          uploaded = true;

          break;
        } catch (error) {
          console.error(
            `Chunk ${chunkIndex} attempt ${attempt} failed`,
            error
          );

          if (attempt < 5) {
            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  1500 * attempt
                )
            );
          }
        }
      }

      if (!uploaded) {
        throw new Error(
          `Could not upload chunk ${chunkIndex + 1}`
        );
      }

      const uploadedBytes =
        Math.min(
          (chunkIndex + 1) *
            CHUNK_SIZE,
          video.size
        );

      const percentage =
        Math.round(
          (uploadedBytes /
            video.size) *
            100
        );

      setUploadProgress(
        percentage
      );
    }

    /*
     * STEP 3
     * All chunks reached server.
     * Assemble file + run FFmpeg.
     */
    setUploadProgress(100);
    setUploadStage("processing");

    const finalizeRes =
      await fetch(
        "/api/upload/finalize",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            projectId:
              newProjectId,
          }),
        }
      );

    const data =
      await finalizeRes.json();

    if (!finalizeRes.ok) {
      throw new Error(
        data.error ||
          "Finalization failed"
      );
    }

    setProjectId(
      data.projectId
    );

    setFrames(
      data.frames
    );

    setSelectedFrame(
      data.frames[0] || null
    );

    setSelectedIndex(0);
  } catch (error) {
    console.error(error);

    alert(
      error instanceof Error
        ? error.message
        : "Upload failed"
    );
  } finally {
    setLoading(false);
    setUploadStage("idle");
  }
}
 

  function selectFrame(frame: Frame, index: number) {
    setSelectedFrame(frame);
    setSelectedIndex(index);

    if (!start) {
      setStart(frame);
      return;
    }

    if (!end) {
      if (frame.second <= start.second) {
        setStart(frame);
      } else {
        setEnd(frame);
      }
      return;
    }

    setStart(frame);
    setEnd(null);
    setClipUrl(null);
  }

  async function cutSelectedClip() {
    if (!projectId || !start || !end) return;

    setCutting(true);

    const res = await fetch("/api/cut", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        start: start.time,
        end: end.time,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "Cut failed");
      setCutting(false);
      return;
    }

    setClipUrl(data.clipUrl);
    setCutting(false);
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10">
          <p className="text-cyan-400 text-sm uppercase tracking-[0.3em]">
            SeaMemories Lab
          </p>

          <h1 className="text-4xl font-bold mt-3">Clip Cutter v0.3</h1>

          <p className="text-neutral-400 mt-3">
            Upload MP4 footage, inspect frames, move with arrows, select start
            and end, export a clean clip.
          </p>
        </header>

        <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-8">
          <label className="block mb-3 text-sm text-neutral-300">
            Upload MP4 video
          </label>

          <input
            type="file"
            accept="video/mp4"
            onChange={(e) => setVideo(e.target.files?.[0] || null)}
            className="block w-full text-sm text-neutral-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-500 file:px-4 file:py-2 file:text-black file:font-semibold"
          />

          <button
            onClick={uploadVideo}
            disabled={!video || loading}
            className="mt-5 rounded-xl bg-cyan-500 px-5 py-3 text-black font-semibold disabled:opacity-40"
          >
            {uploadStage === "uploading"
  ? `Uploading ${uploadProgress}%`
  : uploadStage === "processing"
  ? "Preparing video & extracting frames..."
  : "Upload & Extract Frames"}
          </button>
          {uploadStage === "uploading" && (
  <div className="mt-4">
    <div className="h-3 w-full rounded-full bg-neutral-800 overflow-hidden">
      <div
        className="h-full bg-cyan-500 transition-all duration-300"
        style={{
          width: `${uploadProgress}%`,
        }}
      />
    </div>

    <p className="mt-2 text-sm text-neutral-400">
      {uploadProgress}% uploaded
    </p>
  </div>
)}
        </section>

        {selectedFrame && (
          <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-semibold">Frame Preview</h2>
                <p className="text-neutral-400 text-sm">
                  Use keyboard ← / → or the buttons below.
                </p>
              </div>

              <div className="text-right">
                <p className="text-cyan-400">{selectedFrame.time}</p>
                <p className="text-xs text-neutral-500">
                  Frame {selectedIndex + 1} / {frames.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={goPrev}
                disabled={selectedIndex === 0}
                className="rounded-xl bg-neutral-800 px-5 py-4 text-2xl disabled:opacity-30"
              >
                ←
              </button>

              <img
                src={selectedFrame.src}
                alt={selectedFrame.time}
                className="w-full max-h-[520px] object-contain rounded-xl bg-black border border-neutral-800"
              />

              <button
                onClick={goNext}
                disabled={selectedIndex === frames.length - 1}
                className="rounded-xl bg-neutral-800 px-5 py-4 text-2xl disabled:opacity-30"
              >
                →
              </button>
            </div>

            <div className="mt-5 flex gap-3 flex-wrap">
  <button
    onClick={() => setStart(selectedFrame)}
    className="rounded-xl bg-cyan-500 px-5 py-3 text-black font-semibold"
  >
    Set as START
  </button>

  <button
    onClick={() => {
      if (!start || selectedFrame.second <= start.second) {
        alert("END must be after START");
        return;
      }
      setEnd(selectedFrame);
    }}
    className="rounded-xl bg-white px-5 py-3 text-black font-semibold"
  >
    Set as END
  </button>

  <a
    href={selectedFrame.src}
    download={`seamemories-frame-${selectedFrame.time.replaceAll(":", "-")}.jpg`}
    className="rounded-xl bg-neutral-700 px-5 py-3 text-white font-semibold"
  >
    Download Frame
  </a>
</div>
          </section>
        )}

        {frames.length > 0 && (
          <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-2xl font-semibold">Frame Timeline</h2>
                <p className="text-neutral-400 text-sm">
                  Click frame to preview/select. You can also use START/END
                  buttons above.
                </p>
              </div>

              <div className="text-sm text-neutral-300">
                Start:{" "}
                <span className="text-cyan-400">{start?.time || "--:--"}</span>{" "}
                / End:{" "}
                <span className="text-cyan-400">{end?.time || "--:--"}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4 max-h-[500px] overflow-y-auto pr-2">
              {frames.map((frame, index) => {
                const isSelected = selectedFrame?.src === frame.src;
                const isStart = start?.second === frame.second;
                const isEnd = end?.second === frame.second;
                const isInside =
                  start &&
                  end &&
                  frame.second > start.second &&
                  frame.second < end.second;

                return (
                  <button
                    key={frame.src}
                    onClick={() => selectFrame(frame, index)}
                    className={[
                      "relative rounded-xl overflow-hidden border text-left",
                      isSelected
                        ? "border-white"
                        : isStart || isEnd
                        ? "border-cyan-400"
                        : isInside
                        ? "border-cyan-800"
                        : "border-neutral-800",
                    ].join(" ")}
                  >
                    <img
                      src={frame.src}
                      alt={frame.time}
                      className="w-full aspect-video object-cover"
                    />

                    <div className="p-2 bg-neutral-950 text-xs flex justify-between">
                      <span>{frame.time}</span>
                      {isStart && <span className="text-cyan-400">START</span>}
                      {isEnd && <span className="text-cyan-400">END</span>}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex items-center gap-4">
              <button
                onClick={cutSelectedClip}
                disabled={!start || !end || cutting}
                className="rounded-xl bg-cyan-500 px-5 py-3 text-black font-semibold disabled:opacity-40"
              >
                {cutting ? "Cutting..." : "Export Clip"}
              </button>

              {clipUrl && (
                <a
                  href={clipUrl}
                  className="rounded-xl bg-white px-5 py-3 text-black font-semibold"
                >
                  Download Clip
                </a>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}