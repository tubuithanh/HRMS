/**
 * Lỗi nghiệp vụ có kiểm soát. Middleware xử lý lỗi sẽ đọc statusCode
 * và trả về đúng mã HTTP thay vì luôn trả 500.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 400,
    code = 'BAD_REQUEST',
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Không tìm thấy dữ liệu') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dữ liệu không hợp lệ', details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Dữ liệu bị trùng hoặc xung đột') {
    super(message, 409, 'CONFLICT');
  }
}
