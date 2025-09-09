import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { injectable } from 'inversify';
import { ValidationPort } from '../../domain/ports.js';

@injectable()
export class AjvValidationAdapter implements ValidationPort {
  private readonly ajv: Ajv;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    addFormats(this.ajv);
  }

  async validate<T>(data: unknown, schema: object): Promise<T> {
    const validate = this.ajv.compile(schema);
    const valid = validate(data);
    
    if (!valid) {
      const errors = validate.errors?.map(err => 
        `${err.instancePath || 'root'}: ${err.message}`
      ).join(', ') ?? 'Unknown validation error';
      throw new Error(`Validation failed: ${errors}`);
    }
    
    return data as T;
  }

  createSchema(schemaDefinition: object): object {
    return schemaDefinition;
  }
}