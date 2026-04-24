export type PhiEntity = {
  type:
    | 'NAME'
    | 'DOB'
    | 'MRN'
    | 'PHONE'
    | 'ADDRESS'
    | 'EMAIL';
  original: string;
  placeholder: string;
};

export type PhiSanitizationResult = {
  sanitizedText: string;
  entities: PhiEntity[];
};
