import MaterialIcon from './MaterialIcon';

function ProgressSteps({ currentStep }) {
  const steps = [
    { id: 'removing', label: 'Remove BG\n& Detect Face', icon: 'content_cut' },
    { id: 'compositing', label: 'Crop &\nResize', icon: 'aspect_ratio' },
    { id: 'done', label: 'Complete', icon: 'check' },
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
        return (
          <div
            key={step.id}
            className={`progress-step progress-step--${state}`}
          >
            <div className="progress-step__icon">
              <MaterialIcon name={step.icon} size={15} />
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
