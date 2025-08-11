import React from 'react';

interface DeepLinkGeneratorProps {
  phoneNumber: string;
  message: string;
  verifyUrl: string;
  featureFlags?: {
    enableWhatsApp?: boolean;
    enableSMS?: boolean;
  };
}

export const DeepLinkGenerator: React.FC<DeepLinkGeneratorProps> = ({
  phoneNumber,
  message,
  verifyUrl,
  featureFlags = { enableWhatsApp: true, enableSMS: true }
}) => {
  const fullMessage = `${message} ${verifyUrl}`;
  
  // WhatsApp deep link
  const whatsappUrl = `https://wa.me/${phoneNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(fullMessage)}`;
  
  // SMS deep link (works on mobile)
  const smsUrl = `sms:${phoneNumber}?body=${encodeURIComponent(fullMessage)}`;
  
  // iOS MFMessageCompose prefill (for native iOS app)
  const iosMessageUrl = `sms:${phoneNumber}&body=${encodeURIComponent(fullMessage)}`;

  const handleWhatsAppClick = () => {
    window.open(whatsappUrl, '_blank');
  };

  const handleSMSClick = () => {
    window.location.href = smsUrl;
  };

  return (
    <div className="deep-link-generator">
      <h3>Send verification request:</h3>
      
      {featureFlags.enableWhatsApp && (
        <button
          className="deep-link-button whatsapp"
          onClick={handleWhatsAppClick}
          aria-label="Send via WhatsApp"
        >
          <svg className="icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.149-.67.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
          </svg>
          Send via WhatsApp
        </button>
      )}
      
      {featureFlags.enableSMS && (
        <button
          className="deep-link-button sms"
          onClick={handleSMSClick}
          aria-label="Send via SMS"
        >
          <svg className="icon" viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
          </svg>
          Send via SMS
        </button>
      )}
      
      <div className="message-preview">
        <h4>Message to send:</h4>
        <code className="preview-code">{fullMessage}</code>
      </div>
    </div>
  );
};

export default DeepLinkGenerator;