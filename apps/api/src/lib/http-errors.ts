import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

const statusByCode: Record<string, number> = {
  INVALID_ARGUMENT: 400,
  MISSING_PRIVATE_DATA: 400,
  HASH_MISMATCH: 400,
  FORBIDDEN: 403,
  SEPARATION_OF_DUTIES: 403,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  IMMUTABLE_IDENTITY: 409,
  INVALID_STATE: 409,
  STALE_AMENDMENT: 409,
};

export function registerHttpErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: 'VALIDATION_ERROR',
        message: '请求字段不符合约束',
        issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      });
    }

    const message = error instanceof Error ? error.message : String(error);
    const code = extractDomainCode(message);
    if (code) {
      return reply.code(statusByCode[code] ?? 500).send({
        code,
        message: domainMessage(code),
      });
    }

    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: '服务暂时无法完成请求' });
  });
}

function extractDomainCode(message: string): string | undefined {
  return Object.keys(statusByCode).find((code) => new RegExp(`(?:^|\\b)${code}(?::|\\b)`).test(message));
}

function domainMessage(code: string): string {
  return (
    {
      INVALID_ARGUMENT: '请求参数无效',
      MISSING_PRIVATE_DATA: '缺少隐私数据',
      HASH_MISMATCH: '隐私数据与公共哈希不一致',
      FORBIDDEN: '当前身份无权执行此操作',
      SEPARATION_OF_DUTIES: '提交者不能复核自己的记录',
      NOT_FOUND: '未找到目标记录',
      ALREADY_EXISTS: '标识已存在，请更换后重试',
      IMMUTABLE_IDENTITY: '修订不能改变学生或课程身份',
      INVALID_STATE: '记录当前状态不允许此操作',
      STALE_AMENDMENT: '原凭证已不再有效，修订草稿已过期',
    }[code] ?? '账本拒绝了该操作'
  );
}
