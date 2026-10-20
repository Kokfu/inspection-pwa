import { useEffect, useId, useRef, useState } from "react";

type Props = {
  onCapture: (blob: Blob, capturedAt: string) => Promise<void>;
  onClose: () => void;
  onGallery?: () => void;
};

export function stopMediaStream(stream?: MediaStream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function activateMediaStream(
  stream: MediaStream,
  video: HTMLVideoElement | null,
  isActive: () => boolean
) {
  if (!video || !isActive()) {
    stopMediaStream(stream);
    return false;
  }
  video.srcObject = stream;
  try {
    await video.play();
  } catch (error) {
    stopMediaStream(stream);
    if (video.srcObject === stream) video.srcObject = null;
    throw error;
  }
  if (!isActive()) {
    stopMediaStream(stream);
    if (video.srcObject === stream) video.srcObject = null;
    return false;
  }
  return true;
}

export async function initializeMediaStream(
  acquireStream: () => Promise<MediaStream>,
  video: HTMLVideoElement | null,
  isCurrent: () => boolean,
  onAcquired: (stream: MediaStream) => void
) {
  const stream = await acquireStream();
  if (!isCurrent()) {
    stopMediaStream(stream);
    return undefined;
  }
  onAcquired(stream);
  if (!isCurrent()) {
    stopMediaStream(stream);
    if (video?.srcObject === stream) video.srcObject = null;
    return undefined;
  }
  const started = await activateMediaStream(stream, video, isCurrent);
  return started && isCurrent() ? stream : undefined;
}

export async function captureCameraFrame(
  video: HTMLVideoElement | null,
  stopCamera: () => void
) {
  try {
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      throw new Error("Camera image is not ready yet.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Camera capture is unavailable");
    context.drawImage(video, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Camera capture failed")),
        "image/jpeg",
        0.92
      )
    );
  } finally {
    stopCamera();
  }
}

export function CameraCaptureDialog({ onCapture, onClose, onGallery }: Props) {
  const titleId = useId();
  const confirmTitleId = useId();
  const confirmRef = useRef<HTMLDialogElement>(null);
  const galleryLink = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const initializationGeneration = useRef(0);
  const [message, setMessage] = useState("Starting rear camera…");
  const [capturing, setCapturing] = useState(false);
  const [startFailed, setStartFailed] = useState(false);
  const [started, setStarted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!confirmOpen) return;
    const dialog = confirmRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); galleryLink.current?.focus(); };
  }, [confirmOpen]);

  function stopCamera(stream = streamRef.current) {
    stopMediaStream(stream);
    if (streamRef.current === stream) {
      const video = videoRef.current;
      if (video && video.srcObject === stream) video.srcObject = null;
      streamRef.current = undefined;
    }
  }

  useEffect(() => {
    let active = true;
    const generation = ++initializationGeneration.current;
    const isCurrent = () =>
      active && initializationGeneration.current === generation;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setStartFailed(true);
      setMessage("Camera is unavailable here.");
      return () => undefined;
    }
    stopCamera();
    void initializeMediaStream(
      () => navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } }
      }),
      videoRef.current,
      isCurrent,
      (stream) => {
        if (!isCurrent()) {
          stopMediaStream(stream);
          return;
        }
        stopCamera();
        streamRef.current = stream;
      }
    ).then((stream) => {
      if (stream && isCurrent() && streamRef.current === stream) {
        setMessage("");
        setStarted(true);
      }
    }).catch((error: unknown) => {
      if (!isCurrent()) return;
      stopCamera();
      setStartFailed(true);
      setMessage(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission was denied."
          : "Camera could not be started."
      );
    });
    return () => {
      active = false;
      if (initializationGeneration.current === generation) {
        initializationGeneration.current += 1;
      }
      stopCamera();
    };
  }, []);

  async function capture() {
    setCapturing(true);
    try {
      // A frame error keeps the live stream available for another Capture attempt.
      const blob = await captureCameraFrame(videoRef.current, () => undefined);
      await onCapture(blob, new Date().toISOString());
      onClose();
      stopCamera();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Camera capture failed");
    } finally {
      setCapturing(false);
    }
  }

  function close() {
    stopCamera();
    onClose();
  }

  return <div className="photo-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby={titleId}>
    <section className="photo-dialog camera-dialog">
      <h3 id={titleId}>Take Photo</h3>
      <video ref={videoRef} autoPlay muted playsInline />
      {message ? <p className="form-message" role="status">{message}</p> : null}
      {startFailed && onGallery ? <button ref={galleryLink} type="button" className="secondary-command"
        onClick={() => setConfirmOpen(true)}>Camera not working? Upload from gallery</button> : null}
      <div className="inline-actions">
        <button type="button" className="secondary-command" onClick={close}>Cancel</button>
        <button type="button" disabled={capturing || !started} onClick={() => void capture()}>
          {capturing ? "Saving" : "Capture"}
        </button>
      </div>
    </section>
    {confirmOpen ? <dialog ref={confirmRef} className="photo-dialog" role="dialog" aria-modal="true"
      aria-labelledby={confirmTitleId} onCancel={event => { event.preventDefault(); setConfirmOpen(false); }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const buttons = event.currentTarget.querySelectorAll("button");
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <h3 id={confirmTitleId}>This photo will be marked Uploaded from gallery for KPI.</h3>
      <div className="inline-actions">
        <button type="button" className="secondary-command" autoFocus onClick={() => setConfirmOpen(false)}>Cancel</button>
        <button type="button" onClick={() => {
          // Keep the picker call synchronous with this tap (required by mobile browsers).
          onGallery?.();
          setConfirmOpen(false);
        }}>Confirm</button>
      </div>
    </dialog> : null}
  </div>;
}
