import React from 'react';

interface TemplateSelectorProps {
  onSelect: (template: string) => void;
  selectedTemplate?: string;
  featureFlags?: {
    enableWhatsApp?: boolean;
    enableTemplates?: boolean;
  };
}

const TEMPLATES = [
  {
    id: 'contractor',
    label: 'Contractor/Service',
    message: "Hi, I'm {name} from {company}. I'm calling about {reason}. Please verify me at:",
    icon: '🔧'
  },
  {
    id: 'client',
    label: 'Client/Customer',
    message: "Hello, this is {name}. I need to discuss {reason} with you. Verify at:",
    icon: '💼'
  },
  {
    id: 'delivery',
    label: 'Delivery/Pickup',
    message: "Hi! {name} here with your {service} delivery. I'll call shortly. Verify:",
    icon: '📦'
  },
  {
    id: 'emergency',
    label: 'Urgent/Emergency',
    message: "URGENT: {name} needs to reach you about {reason}. Please verify immediately:",
    icon: '🚨'
  },
  {
    id: 'appointment',
    label: 'Appointment',
    message: "Hi, this is {name} confirming our {time} appointment. Verify me at:",
    icon: '📅'
  }
];

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  onSelect,
  selectedTemplate,
  featureFlags = {}
}) => {
  if (!featureFlags.enableTemplates) {
    return null;
  }

  return (
    <div className="template-selector">
      <h3>Choose a template:</h3>
      <div className="template-grid">
        {TEMPLATES.map(template => (
          <button
            key={template.id}
            className={`template-button ${selectedTemplate === template.id ? 'selected' : ''}`}
            onClick={() => onSelect(template.id)}
            aria-label={`Select ${template.label} template`}
          >
            <span className="template-icon">{template.icon}</span>
            <span className="template-label">{template.label}</span>
          </button>
        ))}
      </div>
      {selectedTemplate && (
        <div className="template-preview">
          <h4>Message preview:</h4>
          <p className="preview-text">
            {TEMPLATES.find(t => t.id === selectedTemplate)?.message}
          </p>
        </div>
      )}
    </div>
  );
};

export default TemplateSelector;