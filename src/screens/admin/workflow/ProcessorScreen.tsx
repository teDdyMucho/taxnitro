import React from 'react';
import { WorkflowInstance } from '../../../db/workflow';
import { PHASE_A_ITEMS } from '../../../db/workflow';
import { WorkflowPhaseBase } from './WorkflowPhaseBase';

interface Props {
  workflow: WorkflowInstance;
  onBack: () => void;
  onAdvance: () => Promise<void>;
}

export function ProcessorScreen({ workflow, onBack, onAdvance }: Props) {
  return (
    <WorkflowPhaseBase
      workflow={workflow}
      phase="A"
      phaseLabel="Processor"
      items={PHASE_A_ITEMS}
      onBack={onBack}
      onAdvance={onAdvance}
      submitLabel="Submit to Reviewer →"
    />
  );
}
