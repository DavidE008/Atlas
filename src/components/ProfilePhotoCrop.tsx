import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Check, Loader2, Minus, Plus, X } from "lucide-react";
import { profileCropRect } from "./profile-photo-crop-utils";

const CROP_SIZE = 320;
const OUTPUT_SIZE = 512;
const PREVIEW_SIZE = 104;

type Point = { x: number; y: number };
type ProfilePhotoCropProps = {
  file: File;
  onCancel: () => void;
  onSave: (file: File) => void;
};

function clampOffset(offset: Point, width: number, height: number): Point {
  const maxX = Math.max(0, (width - CROP_SIZE) / 2);
  const maxY = Math.max(0, (height - CROP_SIZE) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, offset.x)),
    y: Math.max(-maxY, Math.min(maxY, offset.y)),
  };
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ProfilePhotoCrop({ file, onCancel, onSave }: ProfilePhotoCropProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    offset: Point;
    scale: number;
  } | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [dimensions, setDimensions] = useState<Point>({ x: 0, y: 0 });
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dialogRef.current?.showModal();
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const imageLayout = useMemo(() => {
    if (!dimensions.x || !dimensions.y) return { width: CROP_SIZE, height: CROP_SIZE };
    const scale = Math.max(CROP_SIZE / dimensions.x, CROP_SIZE / dimensions.y) * zoom;
    return { width: dimensions.x * scale, height: dimensions.y * scale };
  }, [dimensions, zoom]);

  const imageStyle = useMemo(
    () => ({
      width: imageLayout.width,
      height: imageLayout.height,
      left: `calc(50% + ${offset.x}px)`,
      top: `calc(50% + ${offset.y}px)`,
    }),
    [imageLayout, offset],
  );

  const previewScale = PREVIEW_SIZE / CROP_SIZE;
  const previewStyle = useMemo(
    () => ({
      width: imageLayout.width * previewScale,
      height: imageLayout.height * previewScale,
      left: `calc(50% + ${offset.x * previewScale}px)`,
      top: `calc(50% + ${offset.y * previewScale}px)`,
    }),
    [imageLayout, offset, previewScale],
  );

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dimensions.x || !dimensions.y) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      offset,
      scale: event.currentTarget.getBoundingClientRect().width / CROP_SIZE,
    };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset(
      clampOffset(
        {
          x: drag.offset.x + (event.clientX - drag.x) / drag.scale,
          y: drag.offset.y + (event.clientY - drag.y) / drag.scale,
        },
        imageLayout.width,
        imageLayout.height,
      ),
    );
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function changeZoom(value: number) {
    const nextZoom = Math.max(1, Math.min(3, value));
    setZoom(nextZoom);
    if (!dimensions.x || !dimensions.y) return;
    const scale = Math.max(CROP_SIZE / dimensions.x, CROP_SIZE / dimensions.y) * nextZoom;
    setOffset((current) => clampOffset(current, dimensions.x * scale, dimensions.y * scale));
  }

  async function saveCrop() {
    const image = imageRef.current;
    if (!image || !dimensions.x || !dimensions.y) return;
    setSaving(true);
    setError("");
    try {
      const crop = profileCropRect(dimensions.x, dimensions.y, zoom, offset);
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser could not prepare this image.");
      context.drawImage(
        image,
        crop.x,
        crop.y,
        crop.size,
        crop.size,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("We couldn't prepare this crop. Please try again.");
      onSave(new File([blob], "atlas-profile.jpg", { type: "image/jpeg" }));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "We couldn't prepare this crop.");
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="profile-camera-dialog profile-crop-dialog"
      aria-labelledby="profile-crop-title"
      onCancel={onCancel}
    >
      <div className="profile-camera-heading">
        <div className="profile-crop-stage">
          <span className="eyebrow">Profile photo</span>
          <h2 id="profile-crop-title">Make it yours.</h2>
        </div>
        <button
          type="button"
          className="profile-camera-close"
          onClick={onCancel}
          aria-label="Cancel photo crop"
        >
          <X size={19} />
        </button>
      </div>
      <p className="profile-camera-help">
        Drag to position your photo and adjust the zoom. The circle previews how it will appear on
        Atlas.
      </p>

      <div className="profile-crop-layout">
        <div>
          <div
            className="profile-crop-frame"
            aria-label="Square crop area. Drag the photo to reposition it."
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
          >
            {imageUrl && (
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Selected photo to crop"
                draggable={false}
                onLoad={(event) => {
                  setDimensions({
                    x: event.currentTarget.naturalWidth,
                    y: event.currentTarget.naturalHeight,
                  });
                  setOffset({ x: 0, y: 0 });
                  setZoom(1);
                }}
                onError={() => setError("This image couldn't be opened. Choose a JPG, PNG, or WebP photo.")}
                style={imageStyle}
              />
            )}
            <span className="profile-crop-frame-label">Square crop · drag to move</span>
          </div>
          <div className="profile-crop-zoom">
            <Minus size={15} aria-hidden="true" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              onChange={(event) => changeZoom(Number(event.currentTarget.value))}
              aria-label="Zoom photo"
            />
            <Plus size={15} aria-hidden="true" />
            <output>{zoom.toFixed(1)}×</output>
          </div>
        </div>

        <aside className="profile-crop-details" aria-label="Photo crop details">
          <div className="profile-crop-result">
            {imageUrl && <img src={imageUrl} alt="" draggable={false} style={previewStyle} />}
          </div>
          <strong>Profile preview</strong>
          <dl>
            <div>
              <dt>Original</dt>
              <dd>
                {dimensions.x && dimensions.y ? `${dimensions.x} × ${dimensions.y}` : "Loading…"}
              </dd>
            </div>
            <div>
              <dt>File size</dt>
              <dd>{formatBytes(file.size)}</dd>
            </div>
            <div>
              <dt>Atlas photo</dt>
              <dd>
                {OUTPUT_SIZE} × {OUTPUT_SIZE}
              </dd>
            </div>
          </dl>
        </aside>
      </div>

      {!!error && (
        <p className="profile-camera-error profile-crop-error" role="alert">
          {error}
        </p>
      )}
      <div className="profile-camera-actions">
        <button className="button-secondary" type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          className="button-primary"
          type="button"
          onClick={() => void saveCrop()}
          disabled={saving || !dimensions.x || !dimensions.y}
        >
          {saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
          {saving ? "Preparing…" : "Use photo"}
        </button>
      </div>
    </dialog>
  );
}
