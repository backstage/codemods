interface AppConfig {
  schema: {
    type: string;
    properties: Record<string, unknown>;
  };
}

const config: AppConfig = {
  schema: {
    type: 'object',
    properties: {},
  },
};

const schemaType = config.schema.type;
