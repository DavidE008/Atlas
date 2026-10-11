import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileCameraCapture } from "./ProfileCameraCapture";

const getUserMedia = vi.fn();

beforeEach(() => {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLVideoElement.prototype, "srcObject", {
    configurable: true,
    writable: true,
    value: null,
  });
  Object.defineProperties(HTMLVideoElement.prototype, {
    readyState: { configurable: true, get: () => HTMLMediaElement.HAVE_CURRENT_DATA },
    videoWidth: { configurable: true, get: () => 640 },
    videoHeight: { configurable: true, get: () => 480 },
  });
  getUserMedia.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("ProfileCameraCapture", () => {
  it("requests camera access and returns a captured JPEG", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    getUserMedia.mockResolvedValue(stream);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["camera photo"], { type: "image/jpeg" }));
    });
    const onCapture = vi.fn();
    const { unmount } = render(<ProfileCameraCapture onClose={vi.fn()} onCapture={onCapture} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        facingMode: { ideal: "user" },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Live camera preview")).toHaveProperty("srcObject", stream),
    );

    fireEvent.click(screen.getByRole("button", { name: "Capture photo" }));
    await waitFor(() => expect(onCapture).toHaveBeenCalledOnce());
    const photo = onCapture.mock.calls[0]![0] as File;
    expect(photo.type).toBe("image/jpeg");
    expect(photo.name).toMatch(/^atlas-profile-.*\.jpg$/);

    unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("explains when camera permission is denied", async () => {
    getUserMedia.mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"));
    render(<ProfileCameraCapture onClose={vi.fn()} onCapture={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Camera permission was blocked. Allow camera access for Atlas",
    );
  });
});
