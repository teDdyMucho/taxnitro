import React from 'react';
import { WorkflowInstance, PHASE_C_ITEMS } from '../../../db/workflow';
import { WorkflowPhaseBase } from './WorkflowPhaseBase';

interface Props {
  workflow: WorkflowInstance;
  onBack: () => void;
  onAdvance: () => Promise<void>;
}

export function ReprocessorScreen({ workflow, onBack, onAdvance }: Props) {
  return (
    <WorkflowPhaseBase
      workflow={workflow}
      phase="C"
      phaseLabel="Reprocessor"
      items={PHASE_C_ITEMS}
      onBack={onBack}
      onAdvance={onAdvance}
      showNotes
      submitLabel="Submit to Report Sender →"
    />
  );
}
