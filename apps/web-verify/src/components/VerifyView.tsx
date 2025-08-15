'use client';

import { useState, useEffect, useCallback } from 'react';
import { VoiceRecorder } from './VoiceRecorder';
import { 
  type VerifyCodeStatusResponse, 
  type VerifyCodeSubmitRequest,
  type VerifyCodeSubmitResponse,
  type VoiceUploadResponse,
  type PassCheckResponse 
} from '@verifd/shared';

interface VerifyViewProps {
  code: string;
}

export default function VerifyView({ code }: VerifyViewProps) {
  const [status, setStatus] = useState<'loading' | 'pending' | 'verified' | 'expired' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  
  // Form fields
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  
  // Verified details (when status is 'verified')
  const [verifiedName, setVerifiedName] = useState<string>('');
  const [verifiedReason, setVerifiedReason] = useState<string>('');
  
  // Pass check state (only when phone parameter is present)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [passStatus, setPassStatus] = useState<PassCheckResponse | null>(null);
  const [passCheckLoading, setPassCheckLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

  // Parse phone parameter from URL on mount (client-side only)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const phone = searchParams.get('phone');
      if (phone) {
        setPhoneNumber(phone);
      }
    }
  }, []);

  // Check initial status on mount
  useEffect(() => {
    checkStatus();
  }, [code]);

  // Check pass status when phone number is present
  useEffect(() => {
    if (phoneNumber) {
      checkPassStatus(phoneNumber);
    }
  }, [phoneNumber]);

  const checkStatus = async () => {
    try {
      const response = await fetch(`${apiUrl}/verify/${code}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setStatus('error');
          setErrorMessage('Verification code not found');
          return;
        }
        throw new Error('Failed to check status');
      }

      const data: VerifyCodeStatusResponse = await response.json();
      setStatus(data.status);
      
      if (data.status === 'verified' && data.name && data.reason) {
        setVerifiedName(data.name);
        setVerifiedReason(data.reason);
      }
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load verification');
    }
  };

  const checkPassStatus = async (phone: string) => {
    setPassCheckLoading(true);
    try {
      const response = await fetch(`${apiUrl}/pass/check?number=${encodeURIComponent(phone)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.log('Rate limited on pass check');
        } else if (response.status === 400) {
          console.log('Invalid phone number for pass check');
        }
        // Don't show errors for pass check failures, just don't display the section
        return;
      }

      const data: PassCheckResponse = await response.json();
      setPassStatus(data);
    } catch (err) {
      // Silently fail pass check - it's optional functionality
      console.log('Pass check failed:', err);
    } finally {
      setPassCheckLoading(false);
    }
  };

  const handleVoiceRecording = useCallback((blob: Blob) => {
    setVoiceBlob(blob);
  }, []);

  const uploadVoice = async (blob: Blob): Promise<string | null> => {
    try {
      // Try presigned URL first
      try {
        const presignedRes = await fetch(`${apiUrl}/upload/presigned`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contentType: blob.type || 'audio/webm'
          })
        });
        
        if (presignedRes.ok) {
          const { uploadUrl, key } = await presignedRes.json();
          
          // Upload directly to S3/R2
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Type': blob.type || 'audio/webm',
              'Content-Length': String(blob.size)
            },
            body: blob
          });
          
          if (uploadRes.ok) {
            // Get the public URL
            const urlRes = await fetch(`${apiUrl}/upload/voice-url?key=${encodeURIComponent(key)}`);
            if (urlRes.ok) {
              const { url } = await urlRes.json();
              return url;
            }
          }
        }
      } catch (presignedError) {
        console.log('Presigned upload not available, falling back to direct upload');
      }
      
      // Fallback to direct upload
      const formData = new FormData();
      formData.append('file', blob, 'voice-recording.webm');

      const response = await fetch(`${apiUrl}/upload/voice`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        console.error('Voice upload failed:', response.status);
        return null;
      }

      const data: VoiceUploadResponse = await response.json();
      return data.voiceUrl;
    } catch (err) {
      console.error('Voice upload error:', err);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !reason.trim()) {
      setErrorMessage('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    setErrorMessage('');

    try {
      // Upload voice if recorded
      let uploadedVoiceUrl: string | null = null;
      if (voiceBlob) {
        uploadedVoiceUrl = await uploadVoice(voiceBlob);
        if (uploadedVoiceUrl) {
          setVoiceUrl(uploadedVoiceUrl);
        }
      }

      // Submit verification
      const submitData: VerifyCodeSubmitRequest = {
        code,
        name: name.trim(),
        reason: reason.trim(),
        voiceUrl: uploadedVoiceUrl || undefined
      };

      const response = await fetch(`${apiUrl}/verify/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit verification');
      }

      const data: VerifyCodeSubmitResponse = await response.json();
      
      if (data.ok) {
        setStatus('verified');
        setVerifiedName(name);
        setVerifiedReason(reason);
        
        // Store in sessionStorage for success tracking
        sessionStorage.setItem('callerName', name);
        sessionStorage.setItem('verifyCode', code);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to submit verification');
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading verification...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-lg w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Error</h1>
            <p className="text-gray-600">{errorMessage || 'Invalid verification code'}</p>
            <div className="mt-6">
              <a 
                href="/" 
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Start New Verification
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Expired state
  if (status === 'expired') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-lg w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 mb-4">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Expired</h1>
            <p className="text-gray-600">This verification link has expired. Please request a new one.</p>
            <div className="mt-6">
              <a 
                href="/" 
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Start New Verification
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Already verified state
  if (status === 'verified') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <div className="max-w-lg w-full bg-white rounded-lg shadow-md p-6">
          <div className="text-center mb-6">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Complete!</h1>
            <p className="text-gray-600">
              {verifiedName ? (
                <>Thank you, <strong>{verifiedName}</strong>!</>
              ) : (
                <>Thank you!</>
              )}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Your verification has been submitted successfully.
            </p>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <h2 className="text-lg font-medium text-gray-900 mb-3">Verification Details</h2>
            <div className="space-y-2 text-sm">
              {verifiedName && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Name:</span>
                  <span className="font-medium text-gray-900">{verifiedName}</span>
                </div>
              )}
              {verifiedReason && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Reason:</span>
                  <span className="font-medium text-gray-900">{verifiedReason}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Code:</span>
                <span className="font-mono text-gray-900">{code}</span>
              </div>
            </div>
          </div>

          {/* Pass Status Section - Only shown when phone parameter is present */}
          {phoneNumber && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <h2 className="text-lg font-medium text-gray-900 mb-3">Current Pass Status</h2>
              {passCheckLoading ? (
                <div className="flex items-center text-sm text-gray-500">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Checking pass status...
                </div>
              ) : passStatus ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Phone:</span>
                    <span className="font-medium text-gray-900">{phoneNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Pass Active:</span>
                    <span className={`font-medium ${passStatus.allowed ? 'text-green-600' : 'text-red-600'}`}>
                      {passStatus.allowed ? 'Yes' : 'No'}
                    </span>
                  </div>
                  {passStatus.allowed && passStatus.scope && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Scope:</span>
                        <span className="font-medium text-gray-900">{passStatus.scope}</span>
                      </div>
                      {passStatus.expires_at && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Expires:</span>
                          <span className="font-medium text-gray-900">
                            {new Date(passStatus.expires_at).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Unable to check pass status</p>
              )}
            </div>
          )}

          {/* Debug Panel Note */}
          {!phoneNumber && process.env.NODE_ENV === 'development' && (
            <div className="border-t border-gray-200 pt-4 mt-4">
              <p className="text-xs text-gray-400">
                Debug: Pass check disabled (no ?phone parameter in URL)
              </p>
            </div>
          )}

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 mb-4">
              The person you're trying to reach will be notified of your request.
            </p>
            <a 
              href="/" 
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Start New Verification
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Pending verification form
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-md p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Verify Your Call</h1>
          <p className="text-gray-600 mt-2">
            Please provide your details to verify this call request
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Code: <span className="font-mono font-medium">{code}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Your Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="John Doe"
              required
              disabled={submitting}
              maxLength={100}
            />
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Call <span className="text-red-500">*</span>
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              placeholder="I'm calling about..."
              rows={3}
              required
              disabled={submitting}
              maxLength={500}
            />
            <p className="text-xs text-gray-500 mt-1">{reason.length}/500 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Voice Note <span className="text-gray-500">(optional)</span>
            </label>
            <VoiceRecorder 
              onRecordingComplete={handleVoiceRecording}
              maxDuration={3000}
            />
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {errorMessage}
            </div>
          )}

          <div className="pt-4">
            <button
              type="submit"
              disabled={submitting || !name.trim() || !reason.trim()}
              className={`w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white 
                ${submitting || !name.trim() || !reason.trim()
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                }`}
            >
              {submitting ? (
                <>
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></span>
                  Submitting...
                </>
              ) : (
                'Submit Verification'
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>This verification will expire in 15 minutes</p>
        </div>
      </div>
    </div>
  );
}