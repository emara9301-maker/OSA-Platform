"use client";

import { useRef, useState } from "react";
import { t, type Lang } from "@/lib/messages";

// Reads a QR code with the camera using the browser's built-in BarcodeDetector.
// Browsers without it (for example some iPhone versions) can still type the code in.
export function QrScanner({ targetName, lang }: { targetName: string; lang: Lang }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  async function start() {
    setMessage(null);

    const Detector = (window as unknown as { BarcodeDetector?: new (options: object) => BarcodeDetectorLike })
      .BarcodeDetector;
    if (!Detector) {
      setMessage(t(lang, "noCamera"));
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.srcObject = stream;
    await video.play();
    setScanning(true);

    const detector = new Detector({ formats: ["qr_code"] });
    const timer = window.setInterval(async () => {
      const codes = await detector.detect(video);
      if (codes.length === 0) {
        return;
      }
      const input = document.querySelector<HTMLInputElement>(`input[name="${targetName}"]`);
      if (input) {
        input.value = codes[0].rawValue;
      }
      window.clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
      setScanning(false);
      setMessage(t(lang, "codeRead"));
    }, 400);
  }

  return (
    <div>
      <button type="button" onClick={start} disabled={scanning}>
        {t(lang, "scanCamera")}
      </button>
      <video ref={videoRef} muted playsInline style={{ display: scanning ? "block" : "none", maxWidth: "100%" }} />
      {message && <p role="status">{message}</p>}
    </div>
  );
}

type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
};
