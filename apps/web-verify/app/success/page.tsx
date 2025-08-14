'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
// TODO: Revert to `import type { PassCheckResponse } from '@verifd/shared'` after proper package exports
type PassCheckResponse = { 
  allowed: boolean; 
  scope?: '30m' | '24h' | '30d'; 
  expires_at?: string;
};

interface PassCheckState {
  loading: boolean;
  data: PassCheckResponse | null;
  error: string | null;
}

export default function SuccessPage() {
  const searchParams = useSearchParams();
  const [passCheck, setPassCheck] = useState<PassCheckState>({
    loading: true,
    data: null,
    error: null
  });
  
  const [verificationData, setVerificationData] = useState({
    token: '',
    callerName: '',
    phoneNumber: '',
    passGranted: false,
    passId: '',
    vanityUrl: ''
  });

  useEffect(() => {
    // Get verification data from URL params and sessionStorage
    const token = searchParams.get('token') || sessionStorage.getItem('verifyToken') || '';
    const callerName = sessionStorage.getItem('callerName') || '';
    const phoneNumber = sessionStorage.getItem('phoneNumber') || '';
    const passGranted = searchParams.get('granted') === 'true' || sessionStorage.getItem('passGranted') === 'true';
    const passId = sessionStorage.getItem('passId') || '';
    const vanityUrl = sessionStorage.getItem('vanityUrl') || '';
    
    setVerificationData({ 
      token, 
      callerName, 
      phoneNumber, 
      passGranted,
      passId,
      vanityUrl
    });

    // Check pass status
    if (phoneNumber) {
      checkPassStatus(phoneNumber);
    } else {
      setPassCheck({
        loading: false,
        data: null,
        error: 'Missing phone number for pass check'
      });
    }
  }, [searchParams]);

  const checkPassStatus = async (phoneNumber: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
      
      // Normalize phone number to E.164 format
      let normalizedNumber = phoneNumber;
      if (!normalizedNumber.startsWith('+')) {
        normalizedNumber = `+${normalizedNumber}`;
      }
      
      const response = await fetch(`${apiUrl}/pass/check?number_e164=${encodeURIComponent(normalizedNumber)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Too many checks—try again in a minute.');
        }
        throw new Error(data.error || 'Failed to check pass status');
      }

      setPassCheck({
        loading: false,
        data,
        error: null
      });
    } catch (err) {
      setPassCheck({
        loading: false,
        data: null,
        error: err instanceof Error ? err.message : 'Failed to check pass status'
      });
    }
  };

  const formatExpiryTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString();
    } catch {
      return isoString;
    }
  };

  const getScopeDescription = (scope: '30m' | '24h' | '30d') => {
    switch (scope) {
      case '30m':
        return 'Short-term (30 minutes)';
      case '24h':
        return 'Medium-term (24 hours)';
      case '30d':
        return 'Long-term (30 days)';
      default:
        return scope;
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="max-w-lg w-full bg-white rounded-lg shadow-md p-6" data-testid="success-page">
        <div className="text-center mb-6">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {verificationData.passGranted ? 'vPass Granted!' : 'Verification Request Sent'}
          </h1>
          <p className="text-gray-600 mt-2">
            {verificationData.passGranted ? (
              <>
                {verificationData.callerName && (
                  <>Great! {verificationData.callerName} now has temporary access to call you. </>
                )}
                <strong>Try calling me now.</strong>
              </>
            ) : (
              <>
                {verificationData.callerName && (
                  <>Thanks, {verificationData.callerName}! </>
                )}
                Your verification request has been sent.
              </>
            )}
          </p>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Current Pass Status</h2>
          
          {passCheck.loading && (
            <div className="flex items-center justify-center py-4" data-testid="loading-state">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Checking pass status...</span>
            </div>
          )}

          {passCheck.error && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded mb-4" data-testid="pass-error">
              <div className="flex">
                <svg className="h-5 w-5 text-red-400 mr-2" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <span>Error: {passCheck.error}</span>
              </div>
            </div>
          )}

          {passCheck.data && !passCheck.loading && (
            <div data-testid="pass-status">
              {passCheck.data.allowed ? (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-green-400 mt-0.5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-green-800" data-testid="pass-allowed">
                        {verificationData.passGranted ? '✨ vPass Active — Try Calling Now!' : 'Active Pass Found'}
                      </h3>
                      <div className="mt-2 text-sm text-green-700 space-y-1">
                        {passCheck.data.scope && (
                          <p data-testid="pass-scope">
                            <strong>Scope:</strong> {getScopeDescription(passCheck.data.scope)}
                          </p>
                        )}
                        {passCheck.data.expires_at && (
                          <p data-testid="pass-expires">
                            <strong>Expires:</strong> {formatExpiryTime(passCheck.data.expires_at)}
                          </p>
                        )}
                        {verificationData.passGranted && (
                          <p className="mt-2 font-medium text-green-800">
                            🎉 Your call will now ring through like a contact!
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 text-gray-400 mt-0.5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12zm0-3a1 1 0 01-1-1V8a1 1 0 112 0v4a1 1 0 01-1 1zm0-8a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-800" data-testid="pass-not-allowed">
                        No Active Pass
                      </h3>
                      <p className="mt-1 text-sm text-gray-600">
                        {verificationData.passGranted ? 
                          'The pass may take a moment to appear. Try refreshing the page.' :
                          'You don\'t currently have an active verification pass for this number.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {verificationData.vanityUrl && !verificationData.passGranted && (
          <div className="mt-6 border-t border-gray-200 pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Share this link:</h3>
            <div className="p-3 bg-gray-100 rounded border text-sm font-mono break-all">
              {verificationData.vanityUrl}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Send this link to the person you want to call for approval.
            </p>
          </div>
        )}

        <div className="mt-6 border-t border-gray-200 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">What happens next?</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            {verificationData.passGranted ? (
              <>
                <li>• ✅ vPass granted - you can now call through</li>
                <li>• Your calls will ring like you're in their contacts</li>
                <li>• The pass expires automatically after the set time</li>
                <li>• Try calling now to test the verification</li>
              </>
            ) : (
              <>
                <li>• The recipient will receive your verification request</li>
                <li>• They can approve or deny your request</li>
                <li>• If approved, you'll get a temporary pass to call through</li>
                <li>• Pass status is checked automatically during calls</li>
              </>
            )}
          </ul>
        </div>

        {verificationData.token && (
          <div className="mt-4 p-3 bg-gray-100 rounded text-xs text-gray-600" data-testid="debug-info">
            <strong>Debug Info:</strong><br />
            Token: {verificationData.token.substring(0, 16)}...<br />
            Phone: {verificationData.phoneNumber}
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => window.location.href = '/'}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            data-testid="back-button"
          >
            Make Another Request
          </button>
        </div>
      </div>
    </div>
  );
}