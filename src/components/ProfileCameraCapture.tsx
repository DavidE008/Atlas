import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";

type ProfileCameraCaptureProps = {
  onClose: () => void;
  onCapture: (file: File) => void;
};

export function ProfileCameraCapture({ onClose, onCapture }: ProfileCameraCaptureProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [starting, setStarting] = useState(true);
  const [cameraError, setCameraError] = useState("");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
    let active = true;
    let stream: MediaStream | null = null;

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Camera access requires a secure browser connection. Open Atlas over HTTPS and try again.",
        );
        setStarting(false);
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (issue) {
        const name = issue instanceof DOMException ? issue.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "Camera permission was blocked. Allow camera access for Atlas in your browser settings, then try again."
            : name === "NotFoundError"
              ? "No camera was found on this device."
              : name === "NotReadableError"
                ? "The camera is busy in another app. Close that app and try again."
                : "We couldn't start your camera. Check your browser's camera permissions and try again.",
        );
      } finally {
        if (active) setStarting(false);
      }
    }

    void startCamera();
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    setCapturing(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height)
        throw new Error("The camera image is not ready yet.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (!blob) throw new Error("We couldn't capture that photo. Please try again.");
      onCapture(new File([blob], `atlas-profile-${Date.now()}.jpg`, { type: "image/jpeg" }));
    } catch (issue) {
      setCameraError(issue instanceof Error ? issue.message : "We couldn't capture that photo.");
      setCapturing(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="profile-camera-dialog"
      aria-labelledby="profile-camera-title"
      onCancel={onClose}
    >
      <div className="profile-camera-heading">
        <div>
          <span className="eyebrow">Your Atlas account</span>
          <h2 id="profile-camera-title">Take a profile photo</h2>
        </div>
        <button
          type="button"
          className="profile-camera-close"
          onClick={onClose}
          aria-label="Close camera"
        >
          <X size={19} />
        </button>
      </div>
      <p className="profile-camera-help">Allow Atlas to use your camera, then frame your photo.</p>
      <div className="profile-camera-preview">
        <video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview" />
        {starting && (
          <div className="profile-camera-status">
            <Loader2 size={20} className="animate-spin" />
            <span>Waiting for camera permission…</span>
          </div>
        )}
        {!!cameraError && (
          <p className="profile-camera-error" role="alert">
            {cameraError}
          </p>
        )}
      </div>
      <div className="profile-camera-actions">
        {!!cameraError && (
          <button className="button-secondary" type="button" onClick={onClose}>
            Close
          </button>
        )}
        <button
          className="button-primary"
          type="button"
          onClick={() => void capturePhoto()}
          disabled={starting || !!cameraError || capturing}
        >
          {capturing ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}
          {capturing ? "Capturing…" : "Capture photo"}
        </button>
      </div>
    </dialog>
  );
}
