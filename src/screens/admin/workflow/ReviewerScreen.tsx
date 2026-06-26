import React from 'react';
import { WorkflowInstance, PHASE_B_ITEMS } from '../../../db/workflow';
import { WorkflowPhaseBase } from './WorkflowPhaseBase';

interface Props {
  workflow: WorkflowInstance;
  onBack: () => void;
  onAdvance: () => Promise<void>;
}

export function ReviewerScreen({ workflow, onBack, onAdvance }: Props) {
  return (
    <WorkflowPhaseBase
      workflow={workflow}
      phase="B"
      phaseLabel="Reviewer"
      items={PHASE_B_ITEMS}
      onBack={onBack}
      onAdvance={onAdvance}
      canAddNotes
      submitLabel="Submit to Reprocessor →"
    />
  );
}
