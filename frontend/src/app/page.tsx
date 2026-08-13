"use client";

import { useEffect, useState } from "react";
import { fetchClips, fetchClip, fetchCorrelation } from "../lib/api";
import { ClipSummary, ClipAnalysis, CorrelationSummary } from "../lib/types";
import Sidebar from "../components/Sidebar";
import MoodCard from "../components/MoodCard";
import LapChart from "../components/LapChart";
import TranscriptView from "../components/TranscriptView";
import AudioPlayer from "../components/AudioPlayer";
import CorrelationPlot from "../components/CorrelationPlot";
import UploadPanel from "../components/UploadPanel";
import ArousalValenceGauge from "../components/ArousalValenceGauge";
import { SkeletonPanel } from "../components/LoadingStates";

export default function Home() {
  const [clips, setClips] = useState<ClipSummary[]>([]);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [activeClip, setActiveClip] = useState<ClipAnalysis | null>(null);
  const [correlation, setCorrelation] = useState<CorrelationSummary | null>(null);
  
  const [isLoadingClips, setIsLoadingClips] = useState(true);
  const [isLoadingClip, setIsLoadingClip] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showUpload, setShowUpload] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const [clipsData, corrData] = await Promise.all([
          fetchClips(),
          fetchCorrelation()
        ]);
        setClips(clipsData);
        setCorrelation(corrData);
        if (clipsData.length > 0) {
          setActiveClipId(clipsData[0].clip_id);
        }
      } catch (err) {
        console.error("Failed to load initial data", err);
      } finally {
        setIsLoadingClips(false);
      }
    };
    init();
  }, []);

  useEffect(() => {
    const loadClip = async () => {
      if (!activeClipId || activeClipId.startsWith("upload_")) return; // skip fetch for local uploads
      
      setIsLoadingClip(true);
      setCurrentTime(0);
      try {
        const clipData = await fetchClip(activeClipId);
        setActiveClip(clipData);
        setShowUpload(false);
      } catch (err) {
        console.error("Failed to load clip", err);
      } finally {
        setIsLoadingClip(false);
      }
    };
    loadClip();
  }, [activeClipId]);

  const handleUploadSuccess = (result: ClipAnalysis) => {
    // Generate a local ID for it if it's new
    const id = result.clip_id || `upload_${Date.now()}`;
    result.clip_id = id;
    
    // Add to sidebar
    const newSummary: ClipSummary = {
      clip_id: id,
      driver: result.driver,
      race: result.race,
      lap: result.lap,
      duration_s: result.prosody.duration_s,
      mood_label: result.mood.label,
      stress_index: result.mood.stress_index,
      delta_s: result.lap_context?.delta_s ?? null,
      transcript_preview: result.transcript.substring(0, 60),
      audio_url: result.audio_url,
    };
    
    setClips(prev => [newSummary, ...prev]);
    setActiveClip(result);
    setActiveClipId(id);
    setShowUpload(false);
  };

  return (
    <main className="flex h-screen pt-8">
      {/* Sidebar */}
      <Sidebar 
        clips={clips} 
        activeClipId={activeClipId} 
        onSelectClip={setActiveClipId} 
        isLoading={isLoadingClips} 
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-[#0a0a0f]">
        
        {/* Top Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {activeClip?.race} <span className="text-gray-500">|</span> {activeClip?.driver || "Custom"}
            </h2>
            {activeClip?.mocked && (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-900/30 text-amber-500 border border-amber-500/30">MOCK</span>
            )}
          </div>
          
          <button 
            onClick={() => setShowUpload(!showUpload)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors border ${
              showUpload ? "bg-gray-800 border-gray-700 text-white" : "bg-blue-600 border-blue-500 text-white hover:bg-blue-500"
            }`}
          >
            {showUpload ? "Cancel Upload" : "Upload Audio"}
          </button>
        </div>

        {showUpload ? (
          <UploadPanel onUploadSuccess={handleUploadSuccess} />
        ) : (
          <div className="flex-1 grid grid-cols-12 gap-6 pb-20">
            {/* Left Column - Audio, Transcript, Correlation */}
            <div className="col-span-12 xl:col-span-8 flex flex-col gap-6">
              
              {/* Top row: Player + Transcript */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-64">
                <div className="flex flex-col h-full">
                  {isLoadingClip || !activeClip ? <SkeletonPanel className="h-full" /> : (
                    <AudioPlayer 
                      url={activeClip.audio_url} 
                      onTimeUpdate={setCurrentTime} 
                    />
                  )}
                </div>
                <div className="flex flex-col h-full">
                  {isLoadingClip || !activeClip ? <SkeletonPanel className="h-full" /> : (
                    <TranscriptView 
                      words={activeClip.words} 
                      currentTime={currentTime} 
                    />
                  )}
                </div>
              </div>

              {/* Bottom row: Lap Chart + Correlation */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
                <div className="flex flex-col">
                  {isLoadingClip || !activeClip ? <SkeletonPanel className="h-[300px]" /> : (
                    <LapChart lapContext={activeClip.lap_context} />
                  )}
                </div>
                <div className="flex flex-col">
                  {isLoadingClips ? <SkeletonPanel className="h-[300px]" /> : (
                    <CorrelationPlot data={correlation} />
                  )}
                </div>
              </div>
            </div>

            {/* Right Column - Mood Analysis */}
            <div className="col-span-12 xl:col-span-4 flex flex-col gap-6">
              {isLoadingClip || !activeClip ? <SkeletonPanel className="h-72" /> : (
                <MoodCard mood={activeClip.mood} />
              )}
              
              <div className="h-72">
                {isLoadingClip || !activeClip ? <SkeletonPanel className="h-full" /> : (
                  <ArousalValenceGauge 
                    arousal={activeClip.prosody.arousal} 
                    valence={activeClip.prosody.valence} 
                    quadrant={activeClip.mood.quadrant} 
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
