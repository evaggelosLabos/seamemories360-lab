#!/usr/bin/env python3
"""
SeaMemories Lens Circle Cleaner - v1

What it does:
1) Opens a video.
2) Shows a frame where you can paint/remove droplet circles.
3) Exports a cleaned preview using nearby frames instead of basic OpenCV inpainting.

Controls in mask editor:
  Left click      = add circle
  Right click     = remove circle near cursor
  Mouse wheel     = change circle radius
  [ / ]           = smaller / bigger radius
  c               = clear mask
  s               = save mask
  q or ESC        = finish and export

Install:
  pip install opencv-python numpy

Run:
  python seamemories_lens_cleaner.py input.mp4 --seconds 5 --scale 0.5
"""

import argparse
import os
import cv2
import numpy as np


def read_frame(cap, frame_index):
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    if not ok:
        return None
    return frame


def build_mask(shape, circles):
    h, w = shape[:2]
    mask = np.zeros((h, w), dtype=np.uint8)
    for x, y, r in circles:
        cv2.circle(mask, (int(x), int(y)), int(r), 255, -1)
    mask = cv2.GaussianBlur(mask, (21, 21), 0)
    _, mask = cv2.threshold(mask, 20, 255, cv2.THRESH_BINARY)
    return mask


def edit_mask(frame, scale=0.5):
    original = frame.copy()
    display = cv2.resize(frame, None, fx=scale, fy=scale)
    circles = []
    radius = 28

    window = "SeaMemories mask editor"
    cv2.namedWindow(window, cv2.WINDOW_NORMAL)

    def redraw():
        preview = display.copy()
        for x, y, r in circles:
            cv2.circle(
                preview,
                (int(x * scale), int(y * scale)),
                int(r * scale),
                (0, 255, 255),
                2,
            )
        cv2.putText(
            preview,
            f"Left:add  Right:remove  radius:{radius}  [/] radius  c clear  q export",
            (20, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
        cv2.imshow(window, preview)

    def mouse(event, x, y, flags, param):
        nonlocal radius, circles
        ox, oy = int(x / scale), int(y / scale)

        if event == cv2.EVENT_LBUTTONDOWN:
            circles.append((ox, oy, radius))
            redraw()

        elif event == cv2.EVENT_RBUTTONDOWN:
            if circles:
                distances = [((cx - ox) ** 2 + (cy - oy) ** 2) for cx, cy, cr in circles]
                idx = int(np.argmin(distances))
                circles.pop(idx)
                redraw()

        elif event == cv2.EVENT_MOUSEWHEEL:
            if flags > 0:
                radius += 3
            else:
                radius = max(5, radius - 3)
            redraw()

    cv2.setMouseCallback(window, mouse)
    redraw()

    while True:
        key = cv2.waitKey(30) & 0xFF

        if key in [27, ord("q")]:
            break
        elif key == ord("["):
            radius = max(5, radius - 3)
            redraw()
        elif key == ord("]"):
            radius += 3
            redraw()
        elif key == ord("c"):
            circles = []
            redraw()
        elif key == ord("s"):
            mask = build_mask(original.shape, circles)
            cv2.imwrite("lens_mask.png", mask)
            print("Saved mask: lens_mask.png")

    cv2.destroyWindow(window)
    return build_mask(original.shape, circles), circles


def temporal_clean_frame(frames, center_idx, mask):
    """
    Simple temporal repair:
    Use median of neighboring frames inside the masked areas.
    This works best when droplets are static and the scene/camera changes slightly.
    """
    center = frames[center_idx].copy()

    stack = []
    for i, f in enumerate(frames):
        if i != center_idx:
            stack.append(f)

    if not stack:
        return center

    median = np.median(np.stack(stack, axis=0), axis=0).astype(np.uint8)

    soft = cv2.GaussianBlur(mask, (31, 31), 0).astype(np.float32) / 255.0
    soft = soft[..., None]

    cleaned = (center.astype(np.float32) * (1.0 - soft) + median.astype(np.float32) * soft)
    return np.clip(cleaned, 0, 255).astype(np.uint8)


def enhance_underwater(frame):
    """
    Light enhancement only. Keeps it natural.
    """
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=1.8, tileGridSize=(8, 8))
    l = clahe.apply(l)

    lab = cv2.merge([l, a, b])
    enhanced = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    return enhanced


def export_cleaned(video_path, output_path, mask, seconds=5, neighbor_radius=4):
    cap = cv2.VideoCapture(video_path)

    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    frame_limit = min(total, int(seconds * fps)) if seconds else total

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (w, h))

    all_frames = []
    for _ in range(frame_limit):
        ok, frame = cap.read()
        if not ok:
            break
        all_frames.append(frame)

    cap.release()

    n = len(all_frames)
    print(f"Cleaning {n} frames...")

    for idx in range(n):
        start = max(0, idx - neighbor_radius)
        end = min(n, idx + neighbor_radius + 1)
        local_frames = all_frames[start:end]
        center_idx = idx - start

        cleaned = temporal_clean_frame(local_frames, center_idx, mask)
        cleaned = enhance_underwater(cleaned)

        writer.write(cleaned)

        if idx % 25 == 0:
            print(f"{idx}/{n}")

    writer.release()
    print(f"Done: {output_path}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("video", help="Input video path")
    parser.add_argument("--output", default="seamemories_cleaned_preview.mp4")
    parser.add_argument("--seconds", type=float, default=5, help="Seconds to export. Use 0 for full video.")
    parser.add_argument("--scale", type=float, default=0.5, help="Preview scale for mask editor")
    parser.add_argument("--frame", type=int, default=None, help="Frame number to use for mask editor")
    parser.add_argument("--neighbors", type=int, default=4, help="Neighbor frames on each side")
    args = parser.parse_args()

    if not os.path.exists(args.video):
        raise FileNotFoundError(args.video)

    cap = cv2.VideoCapture(args.video)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    frame_index = args.frame if args.frame is not None else max(0, total // 3)
    frame = read_frame(cap, frame_index)
    cap.release()

    if frame is None:
        raise RuntimeError("Could not read video frame.")

    print("Draw circles over the lens droplets.")
    mask, circles = edit_mask(frame, scale=args.scale)

    print(f"Circles selected: {len(circles)}")
    cv2.imwrite("lens_mask.png", mask)
    print("Saved mask: lens_mask.png")

    export_seconds = None if args.seconds == 0 else args.seconds
    export_cleaned(
        args.video,
        args.output,
        mask,
        seconds=export_seconds,
        neighbor_radius=args.neighbors,
    )


if __name__ == "__main__":
    main()
