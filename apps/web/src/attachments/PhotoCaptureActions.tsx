import { useRef, useState, type ReactNode } from "react";
import { CameraCaptureDialog } from "./CameraCaptureDialog";

type Props = {
  disabled?: boolean;
  hasPhoto?: boolean;
  onCapture: (blob: Blob, capturedAt: string) => Promise<void>;
  onGallery: (file: File) => Promise<void>;
  children?: ReactNode;
};

/** All photo entry points use the same camera-first interaction; callers own persistence. */
export function PhotoCaptureActions({ disabled, hasPhoto, onCapture, onGallery, children }: Props) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  function close() {
    setCameraOpen(false);
    button.current?.focus();
  }
  return <>
    <div className="photo-actions">
      <button ref={button} type="button" disabled={disabled} onClick={() => setCameraOpen(true)}>
        {hasPhoto ? "Replace with Camera" : "Take Photo"}
      </button>
      {children}
      <input ref={input} hidden type="file" accept="image/*" aria-label="Upload from gallery"
        onChange={event => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) { close(); void onGallery(file); }
        }} />
    </div>
    {cameraOpen ? <CameraCaptureDialog onCapture={onCapture} onClose={close}
      onGallery={() => input.current?.click()} /> : null}
  </>;
}
