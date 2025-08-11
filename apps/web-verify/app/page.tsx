'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getApiEndpoint, getEnvironmentBadge } from '../src/config';

export default function Home() {
  const [formData, setFormData] = useState({
    name: '',
    reason: '',
    phoneNumber: '',
    voicePing: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const environmentBadge = getEnvironmentBadge();

  useEffect(() => {
    // Check if we have a token in the URL (from vanity redirect)
    const urlToken = searchParams.get('t');
    if (urlToken) {
      setToken(urlToken);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      if (token) {
        // We have a token from vanity URL - submit the verification form
        const response = await fetch(getApiEndpoint('/verify/submit'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            token: token,
            recipientPhone: formData.phoneNumber,
            grantPass: true // For now, always grant pass if they submit the form
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to submit verification');
        }

        // Store the success info and redirect
        sessionStorage.setItem('verifyToken', token);
        sessionStorage.setItem('callerName', data.callerName || formData.name);
        sessionStorage.setItem('phoneNumber', formData.phoneNumber);
        sessionStorage.setItem('passGranted', data.passGranted ? 'true' : 'false');
        sessionStorage.setItem('passId', data.passId || '');
        
        router.push(`/success?token=${encodeURIComponent(token)}&granted=${data.passGranted}`);
      } else {
        // No token - start a new verification request
        const response = await fetch(getApiEndpoint('/verify/start'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            phoneNumber: formData.phoneNumber,
            name: formData.name,
            reason: formData.reason,
            voicePing: formData.voicePing || undefined
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to start verification');
        }

        // Store the token and redirect to success page with token
        sessionStorage.setItem('verifyToken', data.token);
        sessionStorage.setItem('callerName', formData.name);
        sessionStorage.setItem('phoneNumber', data.number_e164);
        sessionStorage.setItem('vanityUrl', data.vanity_url);
        
        router.push(`/success?token=${encodeURIComponent(data.token)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6" data-testid="verify-form">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">verifd</h1>
            {environmentBadge && (
              <span className={`px-2 py-1 text-xs font-medium border rounded-full ${environmentBadge.className}`}>
                {environmentBadge.label}
              </span>
            )}
          </div>
          <p className="text-gray-600 mt-2">
            {token ? 'Approve or deny call verification' : 'Request call verification'}
          </p>
          {token && (
            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              Someone wants to call you. Review their details below.
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded" data-testid="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">
              Your Name *
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              data-testid="name-input"
            />
          </div>

          <div>
            <label htmlFor="reason" className="block text-sm font-medium text-gray-700">
              Reason for Call *
            </label>
            <input
              type="text"
              id="reason"
              required
              value={formData.reason}
              onChange={(e) => setFormData(prev => ({ ...prev, reason: e.target.value }))}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              data-testid="reason-input"
              placeholder="e.g., Follow-up appointment"
            />
          </div>

          <div>
            <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700">
              Your Phone Number *
            </label>
            <input
              type="tel"
              id="phoneNumber"
              required
              value={formData.phoneNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              data-testid="phone-input"
              placeholder="+1234567890"
            />
          </div>

          <div>
            <label htmlFor="voicePing" className="block text-sm font-medium text-gray-700">
              Voice Message (Optional)
            </label>
            <textarea
              id="voicePing"
              value={formData.voicePing}
              onChange={(e) => setFormData(prev => ({ ...prev, voicePing: e.target.value }))}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              rows={3}
              data-testid="voice-input"
              placeholder="Optional voice message (will be encoded)"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="submit-button"
          >
            {isSubmitting ? 
              (token ? 'Processing...' : 'Sending...') : 
              (token ? 'Grant vPass' : 'Request Verification')
            }
          </button>
        </form>

        <div className="mt-6 text-xs text-gray-500 text-center">
          <p>Your information is processed privately and securely.</p>
          <p>Phone numbers are hashed in logs for privacy.</p>
        </div>
      </div>
    </div>
  );
}