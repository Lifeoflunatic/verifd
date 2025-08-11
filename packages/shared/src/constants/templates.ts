export const TEMPLATE_VARIANTS = {
  contractor: {
    id: 'contractor',
    label: 'Contractor/Service',
    message: "Hi, I'm {name} from {company}. I'm calling about {reason}. Please verify me at:",
    ttl: '24h',
    scope: 'service',
    icon: '🔧'
  },
  client: {
    id: 'client',
    label: 'Client/Customer',
    message: "Hello, this is {name}. I need to discuss {reason} with you. Verify at:",
    ttl: '30m',
    scope: 'business',
    icon: '💼'
  },
  delivery: {
    id: 'delivery',
    label: 'Delivery/Pickup',
    message: "Hi! {name} here with your {service} delivery. I'll call shortly. Verify:",
    ttl: '15m',
    scope: 'delivery',
    icon: '📦'
  },
  emergency: {
    id: 'emergency',
    label: 'Urgent/Emergency',
    message: "URGENT: {name} needs to reach you about {reason}. Please verify immediately:",
    ttl: '30m',
    scope: 'urgent',
    icon: '🚨'
  },
  appointment: {
    id: 'appointment',
    label: 'Appointment',
    message: "Hi, this is {name} confirming our {time} appointment. Verify me at:",
    ttl: '24h',
    scope: 'appointment',
    icon: '📅'
  }
} as const;

export type TemplateVariant = keyof typeof TEMPLATE_VARIANTS;

export const DEFAULT_TEMPLATE: TemplateVariant = 'contractor';

// Feature flags for A/B testing
export const TEMPLATE_FEATURE_FLAGS = {
  enableWhatsApp: false,
  enableTemplates: false,
  enableClickToChat: false,
  enableDeepLinks: false
} as const;

// Copy aligned with "6-sec check" voice
export const TEMPLATE_COPY = {
  title: 'Quick Verify',
  subtitle: 'Get verified in 6 seconds',
  cta: 'Send Verification',
  whatsappCta: 'Open in WhatsApp',
  smsCta: 'Send via SMS',
  instructions: 'Choose how you want to verify yourself to the recipient'
} as const;