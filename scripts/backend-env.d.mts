export function backendEnvironment(root: string, envFile?: string, managed?: boolean): {
  env: NodeJS.ProcessEnv; source: string;
};
export function validateIndexDatabase(value: string | undefined, env?: NodeJS.ProcessEnv): string;
