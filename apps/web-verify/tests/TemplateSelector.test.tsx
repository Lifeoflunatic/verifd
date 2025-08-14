import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TemplateSelector } from '../components/TemplateSelector';

describe('TemplateSelector', () => {
  const mockOnSelect = jest.fn();

  beforeEach(() => {
    mockOnSelect.mockClear();
  });

  it('should not render when feature flag is disabled', () => {
    const { container } = render(
      <TemplateSelector
        onSelect={mockOnSelect}
        featureFlags={{ enableTemplates: false }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render all template options when enabled', () => {
    render(
      <TemplateSelector
        onSelect={mockOnSelect}
        featureFlags={{ enableTemplates: true }}
      />
    );

    expect(screen.getByLabelText('Select Contractor/Service template')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Client/Customer template')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Delivery/Pickup template')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Urgent/Emergency template')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Appointment template')).toBeInTheDocument();
  });

  it('should call onSelect when template is clicked', () => {
    render(
      <TemplateSelector
        onSelect={mockOnSelect}
        featureFlags={{ enableTemplates: true }}
      />
    );

    const contractorButton = screen.getByLabelText('Select Contractor/Service template');
    fireEvent.click(contractorButton);

    expect(mockOnSelect).toHaveBeenCalledWith('contractor');
  });

  it('should show preview for selected template', () => {
    render(
      <TemplateSelector
        onSelect={mockOnSelect}
        selectedTemplate="delivery"
        featureFlags={{ enableTemplates: true }}
      />
    );

    expect(screen.getByText('Message preview:')).toBeInTheDocument();
    expect(screen.getByText(/Hi! {name} here with your {service} delivery/)).toBeInTheDocument();
  });

  it('should highlight selected template', () => {
    render(
      <TemplateSelector
        onSelect={mockOnSelect}
        selectedTemplate="emergency"
        featureFlags={{ enableTemplates: true }}
      />
    );

    const emergencyButton = screen.getByLabelText('Select Urgent/Emergency template');
    expect(emergencyButton).toHaveClass('selected');
  });
});