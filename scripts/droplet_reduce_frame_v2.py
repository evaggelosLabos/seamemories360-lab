import cv2
import numpy as np
import os

VIDEO_PATH = "storage/input/test.mp4"
MASK_PATH = "lens_mask.png"
OUT_DIR = "storage/output"
FRAME_NUMBER = 80

os.makedirs(OUT_DIR, exist_ok=True)

cap = cv2.VideoCapture(VIDEO_PATH)
cap.set(cv2.CAP_PROP_POS_FRAMES, FRAME_NUMBER)
ok, frame = cap.read()
cap.release()

if not ok:
    raise RuntimeError("Could not read frame")

mask = cv2.imread(MASK_PATH, cv2.IMREAD_GRAYSCALE)
if mask is None:
    raise RuntimeError("Could not read lens_mask.png")

mask = cv2.resize(mask, (frame.shape[1], frame.shape[0]))
mask_soft = cv2.GaussianBlur(mask, (61, 61), 0)
alpha = mask_soft.astype(np.float32) / 255.0
alpha = alpha[..., None]

# Estimate clean background using large blur outside/around droplets
background = cv2.GaussianBlur(frame, (151, 151), 0)

# Droplets are mostly bright/whitish haze.
# Pull masked pixels toward darker/local background while preserving some detail.
frame_f = frame.astype(np.float32)
bg_f = background.astype(np.float32)

reduced = frame_f.copy()

# Strength: increase to remove more, decrease to keep more natural
strength = 1.15

corrected = frame_f - strength * alpha * (frame_f - bg_f)
reduced = frame_f * (1 - alpha) + corrected * alpha

reduced = np.clip(reduced, 0, 255).astype(np.uint8)



comparison = np.hstack([frame, reduced])

cv2.imwrite(os.path.join(OUT_DIR, "original_frame.jpg"), frame)
cv2.imwrite(os.path.join(OUT_DIR, "cleaned_frame_v2.jpg"), reduced)
cv2.imwrite(os.path.join(OUT_DIR, "comparison_v2.jpg"), comparison)

print("Done.")
print("Saved:")
print(os.path.join(OUT_DIR, "original_frame.jpg"))
print(os.path.join(OUT_DIR, "cleaned_frame_v2.jpg"))
print(os.path.join(OUT_DIR, "comparison_v2.jpg"))