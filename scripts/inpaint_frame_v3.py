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

# IMPORTANT:
# Shrink the mask so we inpaint only the bright core,
# not the whole soft halo.
kernel = np.ones((15, 15), np.uint8)
tight_mask = cv2.erode(mask, kernel, iterations=1)

# Clean small noise
_, tight_mask = cv2.threshold(tight_mask, 127, 255, cv2.THRESH_BINARY)

# Inpaint
cleaned_telea = cv2.inpaint(frame, tight_mask, 5, cv2.INPAINT_TELEA)
cleaned_ns = cv2.inpaint(frame, tight_mask, 5, cv2.INPAINT_NS)

# Debug comparison
mask_bgr = cv2.cvtColor(tight_mask, cv2.COLOR_GRAY2BGR)
comparison = np.hstack([
    frame,
    cleaned_telea,
    cleaned_ns,
    mask_bgr
])

cv2.imwrite(os.path.join(OUT_DIR, "v3_original.jpg"), frame)
cv2.imwrite(os.path.join(OUT_DIR, "v3_tight_mask.jpg"), tight_mask)
cv2.imwrite(os.path.join(OUT_DIR, "v3_cleaned_telea.jpg"), cleaned_telea)
cv2.imwrite(os.path.join(OUT_DIR, "v3_cleaned_ns.jpg"), cleaned_ns)
cv2.imwrite(os.path.join(OUT_DIR, "v3_comparison.jpg"), comparison)

print("Done.")
print("Saved:")
print(os.path.join(OUT_DIR, "v3_comparison.jpg"))