export type VeranoteBuildTaskStatus = 'proposed' | 'active' | 'done';

export type VeranoteTaskProvenance = {
  sourceType: 'founder_workflow_eval';
  evalCaseId: string;
  evalCaseTitle: string;
  reviewedAt: string | null;
  stoplight: 'Green' | 'Yellow' | 'Red' | null;
  overallRating: 'Pass' | 'Needs revision' | 'Fail' | null;
  rubricTotal: number | null;
  regressionRunLabel?: string;
  sourcePressure: string;
};

export type VeranoteBuildTask = {
  id: string;
  workflowId: string;
  workflowTitle: string;
  productSurface: string;
  severity: 'high' | 'medium' | 'low' | 'unscored';
  focus: string;
  pressureNote: string;
  status: VeranoteBuildTaskStatus;
  createdAt: string;
  updatedAt: string;
  provenance?: VeranoteTaskProvenance;
};
