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

type Props = { code: string; initialPhone?: string };

export default function VerifyView({ code, initialPhone }: Props) {
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
  
  // Pass check state - normalize phone once from props only
  const norm = (v?: string) => {
    if (!v) return undefined;
    try { v = decodeURIComponent(v); } catch {}
    v = v.trim();
    return v || undefined; // keep '+'
  };
  const phoneNumber = norm(initialPhone);
  
  const [passStatus, setPassStatus] = useState<PassCheckResponse | null>(null);
  const [passCheckLoading, setPassCheckLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';

  // Check initial status on mount
  useEffect(() => {
    checkStatus();
  }, [code]);

  // Check pass status only when phone number is present
  useEffect(() => {
    if (!phoneNumber) return;
    
    const url = new URL(`${apiUrl}/pass/check`);
    url.searchParams.set('number', phoneNumber);
    
    setPassCheckLoading(true);
    fetch(url.toString(), { 
      headers: { Accept: 'application/json' }, 
      cache: 'no-store' 
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setPassStatus)
      .catch(() => {
        // Silently fail - no console logs, no error states
      })
      .finally(() => setPassCheckLoading(false));
  }, [phoneNumber, apiUrl]);

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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
          <p className="text-center text-gray-600 mt-4">Loading verification...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Verification Error</h1>
            <p className="mt-2 text-gray-600">{errorMessage || 'Something went wrong'}</p>
            <a 
              href="/" 
              className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Back to Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Expired state
  if (status === 'expired') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Verification Expired</h1>
            <p className="mt-2 text-gray-600">This verification link has expired. Please request a new one.</p>
            <a 
              href="/" 
              className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Request New Verification
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Verified/success state
  if (status === 'verified') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Identity Verified!</h1>
            <p className="mt-2 text-gray-600">
              {verifiedName ? (
                <>Thank you, <span className="font-semibold">{verifiedName}</span>!</>
              ) : (
                'Thank you for verifying your identity!'
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Verify Your Identity</h1>
            <p className="mt-2 text-gray-600">Help the person you're calling identify you</p>
            <div className="mt-2 inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
              Code: {code}
            </div>
          </div>

          {errorMessage && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-sm text-red-800">{errorMessage}</p>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Your Name *
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your full name"
              required
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
              Reason for Calling *
            </label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Briefly explain why you're calling"
              required
              disabled={submitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Voice Recording (Optional)
            </label>
            <VoiceRecorder 
              onRecordingComplete={handleVoiceRecording}
            />
            {voiceBlob && (
              <p className="mt-2 text-sm text-green-600 flex items-center">
                <svg className="h-4 w-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Voice recorded ({Math.round(voiceBlob.size / 1024)}KB)
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Submitting...
              </>
            ) : (
              'Submit Verification'
            )}
          </button>

          <p className="text-xs text-center text-gray-500">
            By submitting, you confirm that the information provided is accurate.
          </p>
        </form>
      </div>
    </div>
  );
}