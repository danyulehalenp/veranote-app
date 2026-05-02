import { GENERAL_MEDICINE_LAB_REFERENCES } from '@/lib/veranote/clinical-labs/specialties/general-medicine';
import { PSYCHIATRY_LAB_REFERENCES } from '@/lib/veranote/clinical-labs/specialties/psychiatry';

export const CLINICAL_LAB_REFERENCES = {
  ...GENERAL_MEDICINE_LAB_REFERENCES,
  ...PSYCHIATRY_LAB_REFERENCES,
};
