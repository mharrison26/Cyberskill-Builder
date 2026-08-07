type EnrollmentErrorMapping = {
  message: string;
  status: number;
};

export function mapEnrollmentError(error: unknown): EnrollmentErrorMapping {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : 'Failed to create enrollment';

  if (rawMessage.includes('cannot have more than 2 active track enrollments')) {
    return {
      message: 'You already have 2 active tracks.',
      status: 409,
    };
  }

  if (rawMessage.includes('must not be discounted')) {
    return {
      message: 'Your first track enrollment must be at full price.',
      status: 409,
    };
  }

  if (rawMessage.includes('must be discounted')) {
    return {
      message: 'Your second track enrollment must use the discounted price.',
      status: 409,
    };
  }

  if (
    rawMessage.includes('duplicate key') ||
    rawMessage.includes('already enrolled')
  ) {
    return {
      message: 'You are already enrolled in this track.',
      status: 409,
    };
  }

  return {
    message: 'Failed to create enrollment.',
    status: 500,
  };
}
