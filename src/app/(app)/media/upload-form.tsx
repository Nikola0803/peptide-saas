"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadMedia } from "./actions";

export function UploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ uploaded: number; skipped: string[] } | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError("");
    setResult(null);
    setBusy(true);
    try {
      const formData = new FormData();
      for (const file of Array.from(fileList)) formData.append("files", file);
      const res = await uploadMedia(formData);
      setResult(res);
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragging ? "border-primary-400 bg-primary-50" : "border-background-300 hover:border-background-400"
        }`}
      >
        <i className="ri-upload-cloud-2-line text-2xl text-foreground-400" />
        <p className="text-sm text-foreground-700 mt-2">{busy ? "Uploading…" : "Drag files here, or click to choose"}</p>
        <p className="text-xs text-foreground-500 mt-1">Images, videos, or docs/PDFs, up to 15MB each</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf,video/mp4,video/webm,video/quicktime,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>
      {error && <p className="text-xs text-accent-700 mt-2">{error}</p>}
      {result && (
        <p className="text-xs text-foreground-600 mt-2">
          Uploaded {result.uploaded}.
          {result.skipped.length > 0 && ` Skipped: ${result.skipped.join(", ")}`}
        </p>
      )}
    </div>
  );
}
