import { Scissors, ImageDown, Check } from 'lucide-react';

function ProgressSteps({ currentStep }) {
  const steps = [
    { id: 'removing', label: 'Removing\nBackground', icon: Scissors },
    { id: 'compositing', label: 'White BG\n& Resize', icon: ImageDown },
    { id: 'done', label: 'Complete', icon: Check },
  ];

  const getStepState = (stepId) => {
    const order = ['removing', 'compositing', 'done'];
    const currentIdx = order.indexOf(currentStep);
    const stepIdx = order.indexOf(stepId);

    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'active';
    return 'pending';
  };

  return (
    <div className="progress-steps">
      {steps.map((step) => {
        const state = getStepState(step.id);
        const Icon = step.icon;
        return (
          <div
            key={step.id}
            className={`progress-step progress-step--${state}`}
          >
            <div className="progress-step__icon">
              <Icon size={22} />
            </div>
            <div className="progress-step__label">
              {step.label.split('\n').map((line, i) => (
                <span key={i}>
                  {line}
                  {i === 0 && <br />}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ProgressSteps;
