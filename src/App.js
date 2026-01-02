import React, { useState, useRef, useEffect } from "react";
import { Camera, Mic } from "lucide-react";

export default function App() {
  const [step, setStep] = useState("landing"); // landing | upload | analyzing | insight
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function handleFile(f) {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    setProgress(0);
    setError(null);
  }

  function handleUpload() {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setError(null);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:4000/upload');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      if (xhr.status >= 200 && xhr.status < 300) {
        // go to analyzing to keep flow consistent
        setStep('analyzing');
        // simulate a short analysis then show insight
        setTimeout(() => setStep('insight'), 1200);
      } else {
        setError(`Upload failed: ${xhr.status} ${xhr.statusText}`);
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      setError('Upload failed due to a network error');
    };

    const form = new FormData();
    form.append('image', file);
    xhr.send(form);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-semibold text-emerald-700">LabelSense AI</div>
          <button className="text-sm text-gray-500">Login</button>
        </header>

        {/* Content */}
        <div className="p-6">
          {step === "landing" && (
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-800 mb-4">
                Food labels weren’t made for humans.
              </h1>
              <p className="text-gray-600 mb-6">
                LabelSense uses AI to explain what actually matters — instantly.
              </p>
              <button
                onClick={() => setStep("upload")}
                className="bg-emerald-600 text-white px-6 py-3 rounded-full w-full"
              >
                Scan an ingredient label
              </button>
              <p className="text-xs text-gray-400 mt-3">Try with sample data</p>
            </div>
          )}

          {step === "upload" && (
              <div className="text-center">
                <h2 className="text-lg font-semibold mb-4">
                  Upload or drag an ingredient label
                </h2>

                <div
                  className="border-2 border-dashed border-emerald-200 rounded-xl p-6 mb-4 cursor-pointer"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handleFile(f);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Camera className="mx-auto text-emerald-500 mb-2" size={32} />
                  <p className="text-gray-500 text-sm">Drop an image or click to choose</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </div>

                {preview && (
                  <div className="mb-4">
                    <img src={preview} alt="preview" className="mx-auto rounded-md max-h-48" />
                  </div>
                )}

                {error && <p className="text-red-500 text-sm mb-2">{error}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={uploading ? null : handleUpload}
                    disabled={!file || uploading}
                    className={`flex-1 ${uploading ? 'bg-emerald-300' : 'bg-emerald-600'} text-white px-5 py-2 rounded-full`}
                  >
                    {uploading ? `Uploading (${progress}%)` : 'Upload a photo'}
                  </button>

                  <button
                    onClick={clearFile}
                    className="bg-gray-100 text-gray-700 px-4 py-2 rounded-full"
                  >
                    Clear
                  </button>
                </div>

                <p className="text-xs text-gray-400 mt-2">or paste ingredient text</p>
              </div>
          )}

          {step === "analyzing" && (
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-6">
                Analyzing ingredients…
              </h2>
              <ul className="space-y-3 text-gray-600 text-sm">
                <li>Reading the label…</li>
                <li>Interpreting ingredient meaning…</li>
                <li>Simplifying the insight…</li>
              </ul>
              <div className="flex justify-center space-x-2 mt-6">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="w-2 h-2 bg-emerald-300 rounded-full animate-pulse" />
                <span className="w-2 h-2 bg-emerald-200 rounded-full animate-pulse" />
              </div>
              <button
                onClick={() => setStep("insight")}
                className="text-xs text-gray-400 mt-6"
              >
                Skip
              </button>
            </div>
          )}

          {step === "insight" && (
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                You’re asking about this product
              </h2>

              <div className="bg-emerald-50 rounded-xl p-4 text-sm text-gray-700 mb-4">
                For children, it’s generally better to limit products with higher added sugar.
                Occasional use is okay, but daily consumption isn’t recommended.
              </div>

              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-600 mb-6">
                If reducing sugar intake matters to you, this product may not be ideal for daily use.
                Occasional consumption is likely fine.
              </div>

              <div className="flex items-center gap-3 bg-white border rounded-full px-4 py-2 shadow">
                <Mic className="text-emerald-600" size={20} />
                <span className="text-gray-500 text-xs">Ask naturally — I’m listening</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
