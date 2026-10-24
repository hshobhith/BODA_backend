import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_TRANSFORM_KEY } from '../decorators/skip-transform.decorator';

export interface Response<T> {
  success: true;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T> | T>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T> | T> {
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_TRANSFORM_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skip) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: T) => {
        if (
          Buffer.isBuffer(data) ||
          data instanceof Uint8Array ||
          (data && typeof (data as any).pipe === 'function')
        ) {
          return data;
        }

        return { success: true, data };
      }),
    );
  }
}
