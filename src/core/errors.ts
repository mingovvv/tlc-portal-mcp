/**
 * 포탈 공통 예외 계층.
 */

export class PortalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalError";
  }
}

export class AuthenticationRequiredError extends PortalError {
  constructor(message = "인증된 포탈 세션이 없습니다.") {
    super(message);
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthenticationFlowError extends PortalError {
  loginUrl?: string;
  successUrl?: string;
  detail?: string;

  constructor(
    message: string,
    opts: { loginUrl?: string; successUrl?: string; detail?: string } = {}
  ) {
    super(message);
    this.name = "AuthenticationFlowError";
    this.loginUrl = opts.loginUrl;
    this.successUrl = opts.successUrl;
    this.detail = opts.detail;
  }
}

export class PortalRequestError extends PortalError {
  constructor(message: string) {
    super(message);
    this.name = "PortalRequestError";
  }
}

export class LeaveValidationError extends PortalError {
  constructor(message: string) {
    super(message);
    this.name = "LeaveValidationError";
  }
}

export class PreparedRequestNotFoundError extends PortalError {
  constructor(message: string) {
    super(message);
    this.name = "PreparedRequestNotFoundError";
  }
}

export class TimetableValidationError extends PortalError {
  constructor(message: string) {
    super(message);
    this.name = "TimetableValidationError";
  }
}

export class PreparedTimetableEntryNotFoundError extends PortalError {
  constructor(message: string) {
    super(message);
    this.name = "PreparedTimetableEntryNotFoundError";
  }
}
