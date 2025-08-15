'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceRecorderProps {
  onRecordingComplete?: (blob: Blob) => void;
  maxDuration?: number; // in milliseconds, default 3000 (3 seconds)
}

export function VoiceRecorder({ 
  onRecordingComplete, 
  maxDuration = 3000 
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConsented, setHasConsented] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Check if user has previously consented (stored in localStorage)
  useEffect(() => {
    const consent = localStorage.getItem('voiceRecordingConsent');
    if (consent === 'true') {
      setHasConsented(true);
    }
  }, []);

  const handleConsent = useCallback(() => {
    setHasConsented(true);
    setShowConsent(false);
    localStorage.setItem('voiceRecordingConsent', 'true');
    // Will trigger startRecording after state update
    setTimeout(() => startRecording(), 100);
  }, []);

  const handleRecordClick = useCallback(() => {
    if (!hasConsented) {
      setShowConsent(true);
    } else {
      startRecording();
    }
  }, [hasConsented]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setShowConsent(false);
      
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });

      // Create MediaRecorder with webm/opus codec for best compression
      const options: MediaRecorderOptions = {};
      
      // Try different codecs in order of preference
      const codecs = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4'
      ];
      
      for (const codec of codecs) {
        if (MediaRecorder.isTypeSupported(codec)) {
          options.mimeType = codec;
          break;
        }
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { 
          type: mediaRecorder.mimeType || 'audio/webm' 
        });
        
        setHasRecording(true);
        onRecordingComplete?.(blob);
        
        // Clean up stream
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.onerror = (event) => {
        setError('Recording failed. Please try again.');
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };

      // Start recording
      mediaRecorder.start();
      setIsRecording(true);

      // Auto-stop after maxDuration
      timerRef.current = setTimeout(() => {
        stopRecording();
      }, maxDuration);

    } catch (err) {
      console.error('Failed to start recording:', err);
      
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          setError('Microphone access denied. Please allow access and try again.');
        } else if (err.name === 'NotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.');
        } else {
          setError('Failed to access microphone. Please check your settings.');
        }
      } else {
        setError('Failed to start recording. Please try again.');
      }
    }
  }, [maxDuration, onRecordingComplete]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const resetRecording = useCallback(() => {
    setHasRecording(false);
    setError(null);
    chunksRef.current = [];
  }, []);

  return (
    <div className="voice-recorder">
      <div className="flex items-center gap-3">
        {!hasRecording ? (
          <>
            <button
              type="button"
              onClick={isRecording ? stopRecording : handleRecordClick}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              }`}
              aria-label={isRecording ? 'Stop recording' : 'Start recording'}
            >
              {isRecording ? (
                <>
                  <span className="inline-block w-2 h-2 bg-white rounded-full mr-2"></span>
                  Recording... ({Math.ceil(maxDuration / 1000)}s max)
                </>
              ) : (
                <>🎤 Record Voice (optional)</>
              )}
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-green-600 font-medium">✓ Voice recorded</span>
            <button
              type="button"
              onClick={resetRecording}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Re-record
            </button>
          </div>
        )}
      </div>
      
      {error && (
        <div className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </div>
      )}

      {!isRecording && !hasRecording && !error && (
        <div className="mt-2 space-y-1">
          <div className="text-xs text-gray-500">
            Add a {maxDuration / 1000}-second voice note to help identify yourself
          </div>
          <div className="text-xs text-gray-400 italic">
            🔒 Your voice is encrypted and only shared with the recipient
          </div>
        </div>
      )}

      {/* Privacy Consent Dialog */}
      {showConsent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-3">Voice Recording Privacy</h3>
            <div className="space-y-3 text-sm text-gray-600">
              <p>
                By recording your voice, you consent to:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Recording a 3-second voice clip</li>
                <li>Securely transmitting it to the recipient</li>
                <li>Temporary storage (auto-deleted after 30 days)</li>
              </ul>
              <p className="font-medium text-gray-700">
                Your privacy is protected:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>🔒 End-to-end encrypted transmission</li>
                <li>🚫 Never used for training or analysis</li>
                <li>👤 Only shared with your intended recipient</li>
                <li>🗑️ Automatically deleted after verification</li>
              </ul>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={handleConsent}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-medium"
              >
                I Understand & Consent
              </button>
              <button
                type="button"
                onClick={() => setShowConsent(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
              >
                Cancel
              </button>
            </div>
            <p className="mt-4 text-xs text-gray-500 text-center">
              This choice will be remembered for future recordings
            </p>
          </div>
        </div>
      )}
    </div>
  );
}