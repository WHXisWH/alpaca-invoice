/**
 * Service 层通用错误基类
 * 使用泛型来支持不同 Service 的错误枚举
 */
export class ServiceError<TErrorCode extends string = string> extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly code: TErrorCode,
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = `${serviceName}Error`;
    
    // 保持正确的原型链（TypeScript 需要）
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * 判断是否为特定类型的错误
   */
  is(code: TErrorCode): boolean {
    return this.code === code;
  }

  /**
   * 判断是否为多个错误类型之一
   */
  isOneOf(codes: TErrorCode[]): boolean {
    return codes.includes(this.code);
  }

  /**
   * 获取完整的错误信息（用于日志）
   */
  toJSON() {
    return {
      service: this.serviceName,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack
    };
  }
}

/**
 * 创建特定 Service 的错误类工厂
 */
export function createServiceError<TErrorCode extends string>(
  serviceName: string
) {
  return class extends ServiceError<TErrorCode> {
    constructor(code: TErrorCode, message: string, details?: any) {
      super(serviceName, code, message, details);
    }
  };
}

