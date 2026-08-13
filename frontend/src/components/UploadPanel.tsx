// frontend/src/components/UploadPanel.tsx
import { useState, useRef } from "react";
import { Spinner } from "./LoadingStates";
import { analyzeAudio } from "../lib/api";
import { ClipAnalysis } from "../lib/types";

interface UploadPanelProps {
  onUploadSuccess: (result: ClipAnalysis) => void;
}

export default function UploadPanel({ onUploadSuccess }: UploadPanelProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("audio/")) {
      setError("Please upload an audio file (wav, mp3, etc.)");
      return;
    }
    
    setError(null);
    setIsUploading(true);
    
    try {
      // For a real app, inputs would capture driver, race, and lap.
      // For this hackathon UI, we just send the file.
      const result = await analyzeAudio(file);
      onUploadSuccess(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to analyze audio");
    } finally {
      setIsUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="p-6 rounded-xl border border-gray-800 bg-gray-900/50">
      <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-4">Analyze Custom Audio</h3>
      
      <div 
        onClick={() => fileInputRef.current?.click()}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragging ? "border-blue-500 bg-blue-500/10" : "border-gray-700 hover:border-gray-500 hover:bg-gray-800/50"
        }`}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="audio/*"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFile(e.target.files[0]);
            }
          }}
        />
        
        {isUploading ? (
          <div className="flex flex-col items-center text-gray-400">
            <Spinner className="w-8 h-8 mb-2 text-blue-500" />
            <span>Analyzing audio pipeline...</span>
            <span className="text-xs text-gray-500 mt-1">ASR → Emotion → Prosody → Fusion</span>
          </div>
        ) : (
          <div className="text-gray-400">
            <div className="text-3xl mb-2">🎙️</div>
            <p className="font-medium">Click or drag audio file to analyze</p>
            <p className="text-xs text-gray-500 mt-1">Supports WAV, MP3, M4A up to 60s</p>
          </div>
        )}
      </div>
      
      {error && (
        <div className="mt-4 p-3 bg-red-900/30 border border-red-500/50 rounded text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
