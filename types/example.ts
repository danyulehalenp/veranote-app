export type ExampleRecord = {
  id: string;
  specialty: string;
  noteType: string;
  title: string;
  rawInput: string;
  idealOutputSummary: string;
  expectedFlags: string[];
  forbiddenAdditions: string[];
};
