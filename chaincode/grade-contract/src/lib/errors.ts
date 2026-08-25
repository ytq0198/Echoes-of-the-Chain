export class AcademicRecordError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = 'AcademicRecordError';
  }
}
